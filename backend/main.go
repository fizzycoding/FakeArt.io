package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 25 * time.Second
	maxMsgSize = 8 * 1024

	// Per-connection message budget. Drawing sends one message per pointer move
	// (up to ~120/s), so this is generous for real play but stops floods.
	msgsPerSecond = 240
	msgBurst      = 480
	// A connection that keeps blowing through its budget is dropped.
	maxRateStrikes = 300
)

var upgrader = websocket.Upgrader{CheckOrigin: checkOrigin}

// extraOrigins are additional allowed origins from ALLOWED_ORIGINS
// (comma-separated hosts or full origins; "*" allows everything).
var extraOrigins = parseOrigins(os.Getenv("ALLOWED_ORIGINS"))

func parseOrigins(csv string) []string {
	var out []string
	for _, o := range strings.Split(csv, ",") {
		if o = strings.TrimSpace(o); o != "" {
			out = append(out, o)
		}
	}
	return out
}

// checkOrigin accepts the game's own host, local development, CrazyGames and
// anything listed in ALLOWED_ORIGINS, so other websites can't open sockets
// to the game server on a visitor's behalf.
func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true // not a browser
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())

	switch {
	case host == "localhost" || host == "127.0.0.1" || host == "::1":
		return true
	case strings.EqualFold(u.Host, r.Host):
		return true
	case host == "crazygames.com" || strings.HasSuffix(host, ".crazygames.com"):
		return true
	}
	for _, allowed := range extraOrigins {
		if allowed == "*" || strings.EqualFold(allowed, origin) || strings.EqualFold(allowed, host) {
			return true
		}
	}
	log.Printf("rejected websocket from origin %q", origin)
	return false
}

func httpHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", handleWebSocket)
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "OK rooms=%d", globalHub.RoomCount())
	})
	return mux
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           httpHandler(),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Stop accepting new connections cleanly on Ctrl+C or a platform shutdown.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()

	fmt.Printf("Server running on http://localhost:%s\n", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	player := newPlayer(conn)
	go writePump(player)

	player.SendMsg("PLAYER_INFO", map[string]interface{}{"id": player.ID})
	readPump(player)
}

func readPump(p *Player) {
	defer func() {
		p.Close()
		p.Conn.Close()
		p.leaveAll()
	}()

	p.Conn.SetReadLimit(maxMsgSize)
	p.Conn.SetReadDeadline(time.Now().Add(pongWait))
	p.Conn.SetPongHandler(func(string) error {
		return p.Conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	strikes := 0
	for {
		_, data, err := p.Conn.ReadMessage()
		if err != nil {
			return
		}
		p.Conn.SetReadDeadline(time.Now().Add(pongWait))

		if !p.msgLimit.allow() {
			if strikes++; strikes > maxRateStrikes {
				return
			}
			continue
		}

		var msg WSMessage
		if json.Unmarshal(data, &msg) == nil {
			handleClientMessage(p, msg)
		}
	}
}

func writePump(p *Player) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		p.Conn.Close()
	}()

	for {
		select {
		case message := <-p.Send:
			p.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := p.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			p.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := p.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-p.Done:
			return
		}
	}
}

func handleClientMessage(p *Player, msg WSMessage) {
	switch msg.Type {
	case "JOIN_QUEUE":
		var payload ProfilePayload
		json.Unmarshal(msg.Payload, &payload)
		p.leaveAll()
		p.SetProfile(payload.Name, payload.Avatar)
		globalMatchmaker.Join(p)

	case "CREATE_ROOM":
		var payload ProfilePayload
		json.Unmarshal(msg.Payload, &payload)
		p.leaveAll()
		p.SetProfile(payload.Name, payload.Avatar)
		room := globalHub.CreatePrivateRoom(p)
		p.SendMsg("ROOM_CREATED", map[string]interface{}{
			"code":    room.Code,
			"players": room.summaries(),
			"hostId":  p.ID,
		})

	case "JOIN_ROOM":
		var payload ProfilePayload
		json.Unmarshal(msg.Payload, &payload)
		p.leaveAll()
		p.SetProfile(payload.Name, payload.Avatar)
		code := strings.ToUpper(strings.TrimSpace(payload.Code))
		room, err := globalHub.JoinPrivateRoom(code, p)
		if err != nil {
			p.SendMsg("ERROR", map[string]interface{}{"message": err.Error()})
			return
		}
		room.Mutex.RLock()
		hostID := room.HostID
		room.Mutex.RUnlock()
		p.SendMsg("JOIN_SUCCESS", map[string]interface{}{
			"code":    room.Code,
			"players": room.summaries(),
			"hostId":  hostID,
		})
		room.broadcastLobby()
		if room.IsFull() {
			go room.StartGame()
		}

	case "LEAVE_ROOM", "LEAVE_QUEUE":
		p.leaveAll()

	case "START_GAME":
		if room := globalHub.Get(p.Room()); room != nil {
			room.HostStart(p.ID)
		}

	case "DRAW_STROKE":
		if room := globalHub.Get(p.Room()); room != nil {
			var stroke StrokeData
			if json.Unmarshal(msg.Payload, &stroke) == nil {
				room.HandleStroke(p.ID, stroke)
			}
		}

	case "END_STROKE":
		if room := globalHub.Get(p.Room()); room != nil {
			room.EndStroke(p.ID)
		}

	case "SEND_CHAT":
		if room := globalHub.Get(p.Room()); room != nil {
			var payload SendChatPayload
			json.Unmarshal(msg.Payload, &payload)
			room.HandleChat(p, payload.Message)
		}

	case "CAST_VOTE":
		if room := globalHub.Get(p.Room()); room != nil {
			var payload CastVotePayload
			json.Unmarshal(msg.Payload, &payload)
			if payload.TargetPlayerID != "" {
				room.CastVote(p.ID, payload.TargetPlayerID)
			}
		}
	}
}
