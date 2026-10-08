package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 25 * time.Second
	maxMsgSize = 8 * 1024
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
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
	fmt.Println("Server running on http://localhost:8080")
	if err := http.ListenAndServe(":8080", httpHandler()); err != nil {
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

	for {
		_, data, err := p.Conn.ReadMessage()
		if err != nil {
			return
		}
		p.Conn.SetReadDeadline(time.Now().Add(pongWait))

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
