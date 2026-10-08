package main

import (
	"encoding/json"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/gorilla/websocket"
)

type Player struct {
	ID     string
	Name   string
	Avatar string
	Score  int // guarded by the owning Room's mutex

	Conn *websocket.Conn
	Send chan []byte
	Done chan struct{}

	mu        sync.Mutex
	roomCode  string
	closeOnce sync.Once
}

type PlayerSummary struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
	Score  int    `json:"score"`
}

func newPlayer(conn *websocket.Conn) *Player {
	return &Player{
		ID:   generateUUID(),
		Conn: conn,
		Send: make(chan []byte, 256),
		Done: make(chan struct{}),
	}
}

func (p *Player) Room() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.roomCode
}

func (p *Player) SetRoom(code string) {
	p.mu.Lock()
	p.roomCode = code
	p.mu.Unlock()
}

func (p *Player) Close() {
	p.closeOnce.Do(func() { close(p.Done) })
}

func (p *Player) Gone() bool {
	select {
	case <-p.Done:
		return true
	default:
		return false
	}
}

// Enqueue never blocks: a client that can't keep up simply misses messages.
func (p *Player) Enqueue(data []byte) {
	select {
	case p.Send <- data:
	default:
	}
}

func (p *Player) SendMsg(msgType string, payload interface{}) {
	p.Enqueue(marshalWS(msgType, payload))
}

func (p *Player) SetProfile(name, avatar string) {
	name = truncateRunes(strings.TrimSpace(name), 15)
	if name == "" {
		name = "Artist_" + p.ID[:4]
	}
	avatar = truncateRunes(strings.TrimSpace(avatar), 8)
	if avatar == "" {
		avatar = "🎨"
	}
	p.Name, p.Avatar = name, avatar
}

// leaveAll removes the player from the matchmaking queue and any room.
func (p *Player) leaveAll() {
	globalMatchmaker.Leave(p.ID)
	if r := globalHub.Get(p.Room()); r != nil {
		r.RemovePlayer(p.ID)
	}
	p.SetRoom("")
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

type StrokeData struct {
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Color       string  `json:"color"`
	Width       float64 `json:"width"`
	IsNewStroke bool    `json:"isNewStroke"`
}

type WSMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type ProfilePayload struct {
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
	Code   string `json:"code"`
}

type SendChatPayload struct {
	Message string `json:"message"`
}

type CastVotePayload struct {
	TargetPlayerID string `json:"targetPlayerId"`
}

type PhaseType string

const (
	PhaseLobby   PhaseType = "LOBBY"
	PhaseDrawing PhaseType = "DRAWING"
	PhaseVoting  PhaseType = "VOTING"
	PhaseResults PhaseType = "RESULTS"
	PhaseClosed  PhaseType = "CLOSED"
)

func mustMarshal(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func marshalWS(msgType string, payload interface{}) []byte {
	b, _ := json.Marshal(WSMessage{Type: msgType, Payload: mustMarshal(payload)})
	return b
}
