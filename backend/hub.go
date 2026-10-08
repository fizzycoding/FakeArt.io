package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"sync"
)

var (
	errRoomFull    = errors.New("room is full")
	errRoomStarted = errors.New("game already in progress")
)

type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

var globalHub = &Hub{rooms: make(map[string]*Room)}

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

// newRoom registers a room under a fresh, unused code.
func (h *Hub) newRoom(isCustom bool) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	for {
		code := generateRoomCode()
		if _, taken := h.rooms[code]; taken {
			continue
		}
		room := NewRoom(code, isCustom)
		h.rooms[code] = room
		return room
	}
}

func (h *Hub) Get(code string) *Room {
	if code == "" {
		return nil
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms[code]
}

func (h *Hub) removeRoom(code string) {
	h.mu.Lock()
	delete(h.rooms, code)
	h.mu.Unlock()
}

func (h *Hub) RoomCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms)
}

func (h *Hub) CreatePublicMatch(players []*Player) *Room {
	room := h.newRoom(false)
	for _, p := range players {
		room.AddPlayer(p)
	}
	return room
}

func (h *Hub) CreatePrivateRoom(p *Player) *Room {
	room := h.newRoom(true)
	room.AddPlayer(p)
	return room
}

func (h *Hub) JoinPrivateRoom(code string, p *Player) (*Room, error) {
	room := h.Get(code)
	if room == nil || !room.IsCustom {
		return nil, fmt.Errorf("room %s not found", code)
	}
	if err := room.AddPlayer(p); err != nil {
		return nil, err
	}
	return room, nil
}

// JoinOpenMatch seats p in a running public game that has a free seat.
func (h *Hub) JoinOpenMatch(p *Player) bool {
	h.mu.RLock()
	rooms := make([]*Room, 0, len(h.rooms))
	for _, r := range h.rooms {
		if !r.IsCustom {
			rooms = append(rooms, r)
		}
	}
	h.mu.RUnlock()

	for _, r := range rooms {
		if r.TryJoinMidGame(p) {
			return true
		}
	}
	return false
}
