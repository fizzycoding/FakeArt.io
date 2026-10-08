package main

import "testing"

func newTestRoom() *Room {
	r := NewRoom("TEST", true)
	for _, id := range []string{"a", "b", "c", "d"} {
		r.AddPlayer(&Player{ID: id, Name: id})
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
	defer func() {
		r.Mutex.Lock()
		if r.Timer != nil {
			r.Timer.Stop()
		}
		r.Mutex.Unlock()
	}()

	if r.SecretWord == r.ImpostorWord {
		t.Fatalf("impostor must get a different word, both %q", r.SecretWord)
	}

	first := activeDrawer(r)

	// A non-active player cannot draw.
	other := "a"
	if first == "a" {
		other = "b"
	}
	r.HandleStroke(other, StrokeData{IsNewStroke: true})
	if len(r.Strokes) != 0 {
		t.Fatal("stroke from non-active player was accepted")
	}

	// Active drawer: one stroke only.
	r.HandleStroke(first, StrokeData{IsNewStroke: true})
	r.HandleStroke(first, StrokeData{IsNewStroke: false})
	r.HandleStroke(first, StrokeData{IsNewStroke: true}) // second stroke: rejected
	if len(r.Strokes) != 2 {
		t.Fatalf("expected 2 points, got %d", len(r.Strokes))
	}

	// Ending the stroke passes the turn; stale EndStroke does nothing.
	r.EndStroke(first)
	second := activeDrawer(r)
	if second == first {
		t.Fatal("turn did not advance")
	}
	r.EndStroke(first)
	if activeDrawer(r) != second {
		t.Fatal("stale EndStroke advanced the turn")
	}

	// Play out the rest: 4 players x 4 rounds = 16 turns, everyone draws equally.
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
