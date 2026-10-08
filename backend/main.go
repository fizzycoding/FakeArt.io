package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func main() {
	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	fmt.Println("Server running on http://localhost:8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	player := &Player{
		ID:    generateUUID(),
		Conn:  conn,
		Send:  make(chan []byte, 256),
		Score: 0,
	}

	go writePump(player)

	playerInfo, _ := json.Marshal(WSMessage{
		Type: "PLAYER_INFO",
		Payload: mustMarshal(map[string]interface{}{
			"id": player.ID,
		}),
	})
	player.Send <- playerInfo

	readPump(player)
}

func readPump(p *Player) {
	defer func() {
		p.Conn.Close()
		if p.RoomCode != "" {
			globalHub.Mutex.Lock()
			room, ok := globalHub.Rooms[p.RoomCode]
			globalHub.Mutex.Unlock()
			if ok {
				room.RemovePlayer(p.ID)
			}
		} else {
			globalHub.LeavePublicQueue(p.ID)
		}
	}()

	for {
		_, messageBytes, err := p.Conn.ReadMessage()
		if err != nil {
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(messageBytes, &msg); err != nil {
			continue
		}

		handleClientMessage(p, msg)
	}
}

func writePump(p *Player) {
	defer p.Conn.Close()
	for message := range p.Send {
		if err := p.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			break
		}
	}
}

func handleClientMessage(p *Player, msg WSMessage) {
	switch msg.Type {
	case "JOIN_QUEUE":
		var payload JoinQueuePayload
		json.Unmarshal(msg.Payload, &payload)
		if payload.Name != "" {
			p.Name = payload.Name
		} else {
			p.Name = "Artist_" + p.ID[:4]
		}
		if payload.Avatar != "" {
			p.Avatar = payload.Avatar
		} else {
			p.Avatar = "🎨"
		}
		globalHub.JoinPublicQueue(p)

	case "LEAVE_QUEUE":
		globalHub.LeavePublicQueue(p.ID)

	case "CREATE_ROOM":
		var payload CreateRoomPayload
		json.Unmarshal(msg.Payload, &payload)
		if payload.Name != "" {
			p.Name = payload.Name
		} else {
			p.Name = "Artist_" + p.ID[:4]
		}
		if payload.Avatar != "" {
			p.Avatar = payload.Avatar
		} else {
			p.Avatar = "🎨"
		}
		room := globalHub.CreateCustomRoom(p)
		p.Send <- mustMarshalWSMessage("ROOM_CREATED", map[string]interface{}{
			"code":    room.Code,
			"players": room.Players,
		})

	case "JOIN_ROOM":
		var payload JoinRoomPayload
		json.Unmarshal(msg.Payload, &payload)
		if payload.Name != "" {
			p.Name = payload.Name
		} else {
			p.Name = "Artist_" + p.ID[:4]
		}
		if payload.Avatar != "" {
			p.Avatar = payload.Avatar
		} else {
			p.Avatar = "🎨"
		}
		room, err := globalHub.JoinCustomRoom(payload.Code, p)
		if err != nil {
			p.Send <- mustMarshalWSMessage("ERROR", map[string]interface{}{
				"message": err.Error(),
			})
		} else {
			p.Send <- mustMarshalWSMessage("JOIN_SUCCESS", map[string]interface{}{
				"code":    room.Code,
				"players": room.Players,
			})
		}

	case "ADD_BOTS":
		if p.RoomCode != "" {
			globalHub.AddBotsToRoom(p.RoomCode)
		}

	case "DRAW_STROKE":
		if p.RoomCode == "" {
			return
		}
		globalHub.Mutex.Lock()
		room, ok := globalHub.Rooms[p.RoomCode]
		globalHub.Mutex.Unlock()
		if !ok {
			return
		}

		var stroke StrokeData
		if err := json.Unmarshal(msg.Payload, &stroke); err == nil {
			room.HandleStroke(p.ID, stroke)
		}

	case "END_STROKE":
		if p.RoomCode == "" {
			return
		}
		globalHub.Mutex.Lock()
		room, ok := globalHub.Rooms[p.RoomCode]
		globalHub.Mutex.Unlock()
		if ok {
			room.EndStroke(p.ID)
		}

	case "SEND_CHAT":
		if p.RoomCode == "" {
			return
		}
		globalHub.Mutex.Lock()
		room, ok := globalHub.Rooms[p.RoomCode]
		globalHub.Mutex.Unlock()
		if !ok {
			return
		}

		var payload SendChatPayload
		json.Unmarshal(msg.Payload, &payload)
		if payload.Message != "" {
			room.HandleChat(p, payload.Message)
		}

	case "CAST_VOTE":
		if p.RoomCode == "" {
			return
		}
		globalHub.Mutex.Lock()
		room, ok := globalHub.Rooms[p.RoomCode]
		globalHub.Mutex.Unlock()
		if !ok {
			return
		}

		var payload CastVotePayload
		json.Unmarshal(msg.Payload, &payload)
		if payload.TargetPlayerID != "" {
			room.CastVote(p.ID, payload.TargetPlayerID)
		}
	}
}

func mustMarshalWSMessage(msgType string, payload interface{}) []byte {
	b, _ := json.Marshal(WSMessage{
		Type:    msgType,
		Payload: mustMarshal(payload),
	})
	return b
}
