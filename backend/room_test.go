package main

import (
	"fmt"
	"testing"
	"time"
)

func testPlayer(id string) *Player {
	return &Player{ID: id, Name: id, Send: make(chan []byte, 64), Done: make(chan struct{})}
}

func newTestRoom() *Room {
	r := NewRoom("TEST", true)
	for _, id := range []string{"a", "b", "c", "d"} {
		r.AddPlayer(testPlayer(id))
	}
	return r
}

func activeDrawer(r *Room) string {
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	return r.ActiveDrawerID
}

func TestOneStrokePerTurnAndFourRounds(t *testing.T) {
	r := newTestRoom()
	r.StartGame()
	defer r.Close()

	if r.SecretWord == r.ImpostorWord {
		t.Fatalf("impostor must get a different word, both %q", r.SecretWord)
	}

	first := activeDrawer(r)
	other := "a"
	if first == "a" {
		other = "b"
	}
	r.HandleStroke(other, StrokeData{IsNewStroke: true})
	if len(r.Strokes) != 0 {
		t.Fatal("stroke from non-active player was accepted")
	}

	r.HandleStroke(first, StrokeData{IsNewStroke: true})
	r.HandleStroke(first, StrokeData{IsNewStroke: false})
	r.HandleStroke(first, StrokeData{IsNewStroke: true})
	if len(r.Strokes) != 2 {
		t.Fatalf("expected 2 points, got %d", len(r.Strokes))
	}

	r.EndStroke(first)
	second := activeDrawer(r)
	if second == first {
		t.Fatal("turn did not advance")
	}
	r.EndStroke(first)
	if activeDrawer(r) != second {
		t.Fatal("stale EndStroke advanced the turn")
	}

	counts := map[string]int{first: 1}
	for turn := 2; turn <= 16; turn++ {
		d := activeDrawer(r)
		counts[d]++
		r.HandleStroke(d, StrokeData{IsNewStroke: true})
		r.EndStroke(d)
	}
	for id, n := range counts {
		if n != drawRounds {
			t.Errorf("player %s drew %d times, want %d", id, n, drawRounds)
		}
	}

	r.Mutex.RLock()
	phase := r.Phase
	r.Mutex.RUnlock()
	if phase != PhaseVoting {
		t.Fatalf("expected VOTING after all rounds, got %s", phase)
	}
}

func TestHostStartNeedsEnoughPlayers(t *testing.T) {
	r := NewRoom("HOST", true)
	defer r.Close()
	for _, id := range []string{"a", "b"} {
		r.AddPlayer(testPlayer(id))
	}
	r.HostStart("a")
	if r.Phase != PhaseLobby {
		t.Fatal("started with too few players")
	}

	r.AddPlayer(testPlayer("c"))
	r.HostStart("b")
	if r.Phase != PhaseLobby {
		t.Fatal("non-host started the game")
	}
	r.HostStart("a")
	if r.Phase != PhaseDrawing {
		t.Fatalf("host could not start with 3 players, phase %s", r.Phase)
	}
	if err := r.AddPlayer(testPlayer("d")); err != errRoomStarted {
		t.Fatalf("late join should be rejected, got %v", err)
	}
}

func TestHostMigratesAndEmptyRoomCloses(t *testing.T) {
	r := globalHub.CreatePrivateRoom(testPlayer("a"))
	code := r.Code
	r.AddPlayer(testPlayer("b"))

	r.RemovePlayer("a")
	if r.HostID != "b" {
		t.Fatalf("host should migrate to b, got %s", r.HostID)
	}
	r.RemovePlayer("b")
	if globalHub.Get(code) != nil {
		t.Fatal("empty room was not removed")
	}
}

func TestMatchmakerMakesRoomsOfFour(t *testing.T) {
	before := globalHub.RoomCount()
	players := make([]*Player, 9)
	for i := range players {
		players[i] = testPlayer(fmt.Sprintf("q%d", i))
		globalMatchmaker.Join(players[i])
	}

	deadline := time.Now().Add(2 * time.Second)
	for globalHub.RoomCount() < before+2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if got := globalHub.RoomCount() - before; got != 2 {
		t.Fatalf("expected 2 public rooms from 9 players, got %d", got)
	}

	for _, p := range players {
		if code := p.Room(); code != "" {
			if r := globalHub.Get(code); r != nil {
				r.Close()
			}
		}
		globalMatchmaker.Leave(p.ID)
	}
}
