package main

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func dial(t *testing.T, url string) *websocket.Conn {
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func send(c *websocket.Conn, typ string, payload interface{}) {
	c.WriteMessage(websocket.TextMessage, marshalWS(typ, payload))
}

func waitFor(t *testing.T, c *websocket.Conn, typ string) map[string]interface{} {
	c.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		_, data, err := c.ReadMessage()
		if err != nil {
			t.Fatalf("waiting for %s: %v", typ, err)
		}
		var msg struct {
			Type    string                 `json:"type"`
			Payload map[string]interface{} `json:"payload"`
		}
		json.Unmarshal(data, &msg)
		if msg.Type == typ {
			return msg.Payload
		}
	}
}

func TestPublicQueueEndToEnd(t *testing.T) {
	mux := httptest.NewServer(httpHandler())
	defer mux.Close()
	url := "ws" + strings.TrimPrefix(mux.URL, "http") + "/ws"

	matchCountdown = 100 * time.Millisecond
	defer func() { matchCountdown = 5 * time.Second }()

	conns := make([]*websocket.Conn, 4)
	for i := range conns {
		conns[i] = dial(t, url)
		defer conns[i].Close()
		send(conns[i], "JOIN_QUEUE", map[string]string{"name": "p"})
	}

	var order string
	for _, c := range conns {
		found := waitFor(t, c, "MATCH_FOUND")
		var ids []string
		for _, pl := range found["players"].([]interface{}) {
			ids = append(ids, pl.(map[string]interface{})["id"].(string))
		}
		if len(ids) != 4 {
			t.Fatalf("MATCH_FOUND should list 4 players, got %v", ids)
		}
		if joined := strings.Join(ids, ","); order == "" {
			order = joined
		} else if order != joined {
			t.Fatalf("player order differs between clients: %v vs %v", order, joined)
		}
	}

	words := map[string]int{}
	for _, c := range conns {
		p := waitFor(t, c, "START_ROUND")
		words[p["word"].(string)]++
		if _, leaked := p["isImpostor"]; leaked {
			t.Fatal("START_ROUND must not reveal the impostor")
		}
	}
	if len(words) != 2 {
		t.Fatalf("expected 2 distinct words (3 + 1), got %v", words)
	}
}

func TestPrivateRoomEndToEnd(t *testing.T) {
	mux := httptest.NewServer(httpHandler())
	defer mux.Close()
	url := "ws" + strings.TrimPrefix(mux.URL, "http") + "/ws"

	host := dial(t, url)
	defer host.Close()
	send(host, "CREATE_ROOM", map[string]string{"name": "host"})
	created := waitFor(t, host, "ROOM_CREATED")
	code := created["code"].(string)

	guests := []*websocket.Conn{dial(t, url), dial(t, url)}
	for _, g := range guests {
		defer g.Close()
		send(g, "JOIN_ROOM", map[string]string{"name": "g", "code": strings.ToLower(code)})
		waitFor(t, g, "JOIN_SUCCESS")
	}

	send(guests[0], "START_GAME", nil) // non-host: ignored
	send(host, "START_GAME", nil)
	waitFor(t, host, "START_ROUND")

	late := dial(t, url)
	defer late.Close()
	send(late, "JOIN_ROOM", map[string]string{"code": code})
	if msg := waitFor(t, late, "ERROR"); msg["message"] == "" {
		t.Fatal("expected an error for joining a started game")
	}
}
