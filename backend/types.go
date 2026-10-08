package main

import (
	"encoding/json"
	"sync"

	"github.com/gorilla/websocket"
)

type Player struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Avatar   string          `json:"avatar"`
	IsBot    bool            `json:"isBot"`
	Score    int             `json:"score"`
	Conn     *websocket.Conn `json:"-"`
	Send     chan []byte     `json:"-"`
	RoomCode string          `json:"-"`
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

type JoinQueuePayload struct {
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
}

type CreateRoomPayload struct {
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
}

type JoinRoomPayload struct {
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
)

type SafeMap struct {
	sync.RWMutex
	m map[string]*Player
}
