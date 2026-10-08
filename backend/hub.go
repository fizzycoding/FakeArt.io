package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math/big"
	"sync"
	"time"
)

type Hub struct {
	Rooms            map[string]*Room
	ActivePublicRoom *Room
	Mutex            sync.Mutex
}

var globalHub = &Hub{
	Rooms: make(map[string]*Room),
}

func generateRoomCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return string(b)
}

func generateUUID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *Hub) JoinPublicQueue(p *Player) {
	h.Mutex.Lock()

	if h.ActivePublicRoom == nil || len(h.ActivePublicRoom.Players) >= 4 || h.ActivePublicRoom.Phase != PhaseLobby {
		code := generateRoomCode()
		h.ActivePublicRoom = NewRoom(code, false)
		h.Rooms[code] = h.ActivePublicRoom
	}

	room := h.ActivePublicRoom
	room.AddPlayer(p)
	count := len(room.Players)
	h.Mutex.Unlock()

	room.Broadcast("LOBBY_UPDATE", map[string]interface{}{
		"roomCode": room.Code,
		"players":  room.Players,
		"required": 4,
	})

	if count == 4 {
		h.Mutex.Lock()
		if h.ActivePublicRoom == room {
			h.ActivePublicRoom = nil
		}
		h.Mutex.Unlock()
		go room.StartGame()
		return
	}

	go func(r *Room) {
		time.Sleep(6 * time.Second)
		h.Mutex.Lock()
		r.Mutex.Lock()

		if r.Phase == PhaseLobby {
			needed := 4 - len(r.Players)
			if needed > 0 && needed < 4 {
				botAvatars := []string{"🤖", "🎨", "👾"}
				botNames := []string{"ArtBot", "PixelMaster", "DoodleKing"}

				for i := 0; i < needed; i++ {
					bot := &Player{
						ID:       "bot_" + generateUUID(),
						Name:     botNames[i%len(botNames)],
						Avatar:   botAvatars[i%len(botAvatars)],
						IsBot:    true,
						RoomCode: r.Code,
					}
					r.Players = append(r.Players, bot)
				}

				if h.ActivePublicRoom == r {
					h.ActivePublicRoom = nil
				}

				r.Mutex.Unlock()
				h.Mutex.Unlock()
				go r.StartGame()
				return
			}
		}

		r.Mutex.Unlock()
		h.Mutex.Unlock()
	}(room)
}

func (h *Hub) LeavePublicQueue(playerID string) {
	h.Mutex.Lock()
	defer h.Mutex.Unlock()

	if h.ActivePublicRoom != nil {
		h.ActivePublicRoom.RemovePlayer(playerID)
		if len(h.ActivePublicRoom.Players) > 0 {
			h.ActivePublicRoom.Broadcast("LOBBY_UPDATE", map[string]interface{}{
				"roomCode": h.ActivePublicRoom.Code,
				"players":  h.ActivePublicRoom.Players,
				"required": 4,
			})
		}
	}
}

func (h *Hub) CreateCustomRoom(p *Player) *Room {
	h.Mutex.Lock()
	defer h.Mutex.Unlock()

	code := generateRoomCode()
	room := NewRoom(code, true)
	room.AddPlayer(p)
	h.Rooms[code] = room
	return room
}

func (h *Hub) JoinCustomRoom(code string, p *Player) (*Room, error) {
	h.Mutex.Lock()
	room, exists := h.Rooms[code]
	h.Mutex.Unlock()

	if !exists {
		return nil, fmt.Errorf("Room %s not found", code)
	}

	if !room.AddPlayer(p) {
		return nil, fmt.Errorf("Room %s is full", code)
	}

	room.Mutex.RLock()
	count := len(room.Players)
	room.Mutex.RUnlock()

	room.Broadcast("LOBBY_UPDATE", map[string]interface{}{
		"roomCode": room.Code,
		"players":  room.Players,
		"required": 4,
	})

	if count == 4 {
		go room.StartGame()
	}

	return room, nil
}

func (h *Hub) AddBotsToRoom(code string) {
	h.Mutex.Lock()
	room, exists := h.Rooms[code]
	h.Mutex.Unlock()

	if !exists {
		return
	}

	room.Mutex.Lock()
	needed := 4 - len(room.Players)
	if needed <= 0 || room.Phase != PhaseLobby {
		room.Mutex.Unlock()
		return
	}

	botAvatars := []string{"🤖", "🎨", "👾"}
	botNames := []string{"ArtBot", "PixelMaster", "DoodleKing"}

	for i := 0; i < needed; i++ {
		bot := &Player{
			ID:       "bot_" + generateUUID(),
			Name:     botNames[i%len(botNames)],
			Avatar:   botAvatars[i%len(botAvatars)],
			IsBot:    true,
			RoomCode: code,
		}
		room.Players = append(room.Players, bot)
	}

	h.Mutex.Lock()
	if h.ActivePublicRoom == room {
		h.ActivePublicRoom = nil
	}
	h.Mutex.Unlock()

	room.Mutex.Unlock()
	go room.StartGame()
}
