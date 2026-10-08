package main

import "time"

// matchCountdown is how long a found match waits before the game begins.
var matchCountdown = 5 * time.Second

// Matchmaker owns the public queue from a single goroutine, so it needs no
// locks. The queue never holds more than roomSize-1 players because a room is
// created the moment enough have gathered, which keeps every operation O(1).
type Matchmaker struct {
	join  chan *Player
	leave chan string
	queue []*Player
}

var globalMatchmaker = newMatchmaker()

func newMatchmaker() *Matchmaker {
	m := &Matchmaker{
		join:  make(chan *Player, 1024),
		leave: make(chan string, 1024),
	}
	go m.run()
	return m
}

func (m *Matchmaker) Join(p *Player) {
	select {
	case m.join <- p:
	case <-p.Done:
	}
}

func (m *Matchmaker) Leave(id string) {
	m.leave <- id
}

func (m *Matchmaker) run() {
	for {
		select {
		case p := <-m.join:
			m.add(p)
		case id := <-m.leave:
			m.remove(id)
		}
		m.prune()
		m.match()
		m.notify()
	}
}

func (m *Matchmaker) add(p *Player) {
	for _, q := range m.queue {
		if q.ID == p.ID {
			return
		}
	}
	m.queue = append(m.queue, p)
}

func (m *Matchmaker) remove(id string) {
	for i, q := range m.queue {
		if q.ID == id {
			m.queue = append(m.queue[:i], m.queue[i+1:]...)
			return
		}
	}
}

func (m *Matchmaker) prune() {
	live := m.queue[:0]
	for _, p := range m.queue {
		if !p.Gone() {
			live = append(live, p)
		}
	}
	m.queue = live
}

func (m *Matchmaker) match() {
	for len(m.queue) >= maxPlayers {
		group := make([]*Player, maxPlayers)
		copy(group, m.queue[:maxPlayers])
		m.queue = append([]*Player(nil), m.queue[maxPlayers:]...)

		room := globalHub.CreatePublicMatch(group)
		room.Broadcast("MATCH_FOUND", map[string]interface{}{
			"players":   room.summaries(),
			"countdown": int(matchCountdown / time.Second),
			"roomCode":  room.Code,
		})
		go room.StartAfter(matchCountdown)
	}
}

func (m *Matchmaker) notify() {
	// Everyone sees the same queue order, so slots line up across clients.
	players := make([]PlayerSummary, len(m.queue))
	for i, p := range m.queue {
		players[i] = PlayerSummary{ID: p.ID, Name: p.Name, Avatar: p.Avatar, Score: p.Score}
	}
	for _, p := range m.queue {
		p.SendMsg("QUEUE_UPDATE", map[string]interface{}{
			"waiting":  len(m.queue),
			"required": maxPlayers,
			"players":  players,
		})
	}
}
