package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
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

// drawStroke simulates one pen-down, move, pen-up.
func drawStroke(r *Room, id string) {
	r.HandleStroke(id, StrokeData{IsNewStroke: true})
	r.HandleStroke(id, StrokeData{IsNewStroke: false})
	r.EndStroke(id)
}

func TestTwoStrokesPerTurnAndFourRounds(t *testing.T) {
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

	// A second pen-down while the first is still open is ignored.
	r.HandleStroke(first, StrokeData{IsNewStroke: true})
	r.HandleStroke(first, StrokeData{IsNewStroke: true})
	if len(r.Strokes) != 1 {
		t.Fatalf("expected 1 point, got %d", len(r.Strokes))
	}
	r.EndStroke(first)
	if activeDrawer(r) != first {
		t.Fatal("turn ended after only one of two strokes")
	}

	drawStroke(r, first)
	second := activeDrawer(r)
	if second == first {
		t.Fatal("turn did not advance after the second stroke")
	}
	r.EndStroke(first)
	if activeDrawer(r) != second {
		t.Fatal("stale EndStroke advanced the turn")
	}

	drawStroke(r, second)
	drawStroke(r, second)
	if activeDrawer(r) == second {
		t.Fatal("turn did not advance after two strokes")
	}

	counts := map[string]int{first: 1, second: 1}
	for turn := 3; turn <= drawRounds*4; turn++ {
		d := activeDrawer(r)
		counts[d]++
		drawStroke(r, d)
		drawStroke(r, d)
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

func TestGameContinuesWhenPlayersLeave(t *testing.T) {
	r := NewRoom("LEAVE", true)
	defer r.Close()
	for _, id := range []string{"a", "b", "c", "d"} {
		r.AddPlayer(testPlayer(id))
	}
	r.HostStart("a")
	if r.Phase != PhaseDrawing {
		t.Fatalf("game did not start, phase %s", r.Phase)
	}

	// Even the Impostor and the active drawer walking out must not end the game.
	r.RemovePlayer(r.ImpostorID)
	r.RemovePlayer(r.ActiveDrawerID)
	r.Mutex.RLock()
	phase, left := r.Phase, len(r.Players)
	r.Mutex.RUnlock()
	if phase != PhaseDrawing {
		t.Fatalf("game ended after players left, phase %s", phase)
	}
	if left == 0 || left > 3 {
		t.Fatalf("unexpected player count %d", left)
	}
}

func TestSelfVoteAllowed(t *testing.T) {
	r := newTestRoom()
	r.StartGame()
	defer r.Close()
	r.Mutex.Lock()
	r.Phase = PhaseVoting
	r.Mutex.Unlock()
	r.CastVote("a", "a")
	if r.Votes["a"] != "a" {
		t.Fatal("a player should be able to vote for themselves")
	}
}

func TestNewPlayerTakesOverVacatedSeat(t *testing.T) {
	r := NewRoom("MID", false)
	for _, id := range []string{"a", "b", "c", "d"} {
		r.AddPlayer(testPlayer(id))
	}
	r.StartGame()
	defer r.Close()

	if r.TryJoinMidGame(testPlayer("x")) {
		t.Fatal("joined a full game")
	}

	impostor := r.ImpostorID
	r.RemovePlayer(impostor)

	newcomer := testPlayer("x")
	if !r.TryJoinMidGame(newcomer) {
		t.Fatal("could not join a game with an open seat")
	}
	if r.ImpostorID != "x" {
		t.Fatalf("newcomer should inherit the Fake Artist seat, impostor is %s", r.ImpostorID)
	}
	seated := 0
	for _, id := range r.TurnOrder {
		if id == impostor {
			t.Fatal("old player still in the turn order")
		}
		if id == "x" {
			seated++
		}
	}
	if seated != 1 {
		t.Fatalf("newcomer seated %d times", seated)
	}
	if newcomer.Room() != "MID" {
		t.Fatal("newcomer not assigned to the room")
	}
	if r.TryJoinMidGame(testPlayer("y")) {
		t.Fatal("joined a full game after refill")
	}
}

func TestPrivateAndFinishedGamesRefuseMidGameJoin(t *testing.T) {
	private := newTestRoom()
	private.StartGame()
	defer private.Close()
	private.RemovePlayer("a")
	if private.TryJoinMidGame(testPlayer("x")) {
		t.Fatal("private rooms must not accept mid-game joins")
	}

	public := NewRoom("DONE", false)
	for _, id := range []string{"a", "b", "c", "d"} {
		public.AddPlayer(testPlayer(id))
	}
	public.StartGame()
	defer public.Close()
	public.RemovePlayer("a")
	public.Mutex.Lock()
	public.GameOver = true
	public.Mutex.Unlock()
	if public.TryJoinMidGame(testPlayer("x")) {
		t.Fatal("a finished game must not accept new players")
	}
}

func TestPlayersDrawInSeatOrder(t *testing.T) {
	r := newTestRoom()
	r.StartGame()
	defer r.Close()

	want := []string{"a", "b", "c", "d"}
	for lap := 0; lap < drawRounds; lap++ {
		for _, id := range want {
			if got := activeDrawer(r); got != id {
				t.Fatalf("lap %d: expected %s to draw, got %s", lap+1, id, got)
			}
			drawStroke(r, id)
			drawStroke(r, id)
		}
	}
}

func TestScoringNeverGoesNegative(t *testing.T) {
	r := newTestRoom()
	r.StartGame()
	defer r.Close()

	impostor := r.ImpostorID
	var artists []string
	for _, id := range []string{"a", "b", "c", "d"} {
		if id != impostor {
			artists = append(artists, id)
		}
	}

	// Two artists catch the Fake Artist, one votes wrongly, the Fake Artist is caught.
	r.Mutex.Lock()
	r.Phase = PhaseVoting
	r.Votes = map[string]string{
		artists[0]: impostor,
		artists[1]: impostor,
		artists[2]: artists[0],
		impostor:   artists[1],
	}
	r.Mutex.Unlock()
	r.calculateResults()

	score := func(id string) int {
		r.Mutex.RLock()
		defer r.Mutex.RUnlock()
		for _, p := range r.Players {
			if p.ID == id {
				return p.Score
			}
		}
		return -1
	}
	if score(artists[0]) != pointsSpotFakeArtist || score(artists[1]) != pointsSpotFakeArtist {
		t.Fatalf("artists who caught the Fake Artist should get %d", pointsSpotFakeArtist)
	}
	if score(artists[2]) != 0 {
		t.Fatalf("a wrong vote should score 0, got %d", score(artists[2]))
	}
	if score(impostor) != 0 {
		t.Fatalf("a caught Fake Artist should score 0, got %d", score(impostor))
	}
}

func TestFakeArtistSurvivingScores(t *testing.T) {
	r := newTestRoom()
	r.StartGame()
	defer r.Close()

	impostor := r.ImpostorID
	other := "a"
	if impostor == "a" {
		other = "b"
	}
	r.Mutex.Lock()
	r.Phase = PhaseVoting
	r.Votes = map[string]string{other: other}
	r.Mutex.Unlock()
	r.calculateResults()

	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	for _, p := range r.Players {
		switch {
		case p.ID == impostor && p.Score != pointsFakeArtistSurvives:
			t.Fatalf("surviving Fake Artist got %d, want %d", p.Score, pointsFakeArtistSurvives)
		case p.ID != impostor && p.Score != 0:
			t.Fatalf("artist %s got %d, want 0", p.ID, p.Score)
		}
	}
}

func TestTiedVoteLetsFakeArtistOff(t *testing.T) {
	r := newTestRoom()
	r.StartGame()
	defer r.Close()

	impostor := r.ImpostorID
	var artists []string
	for _, id := range []string{"a", "b", "c", "d"} {
		if id != impostor {
			artists = append(artists, id)
		}
	}
	r.Mutex.Lock()
	r.Phase = PhaseVoting
	r.Votes = map[string]string{
		artists[0]: impostor,
		artists[1]: artists[0],
		artists[2]: artists[0],
		impostor:   impostor,
	}
	r.Mutex.Unlock()
	r.calculateResults()

	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	for _, p := range r.Players {
		if p.ID == impostor && p.Score != pointsFakeArtistSurvives {
			t.Fatalf("tied vote should let the Fake Artist off, got %d", p.Score)
		}
	}
}

func TestVoteCannotBeChanged(t *testing.T) {
	r := newTestRoom()
	r.StartGame()
	defer r.Close()
	r.Mutex.Lock()
	r.Phase = PhaseVoting
	r.Mutex.Unlock()

	r.CastVote("a", "b")
	r.CastVote("a", "c")
	r.CastVote("a", "a")
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	if r.Votes["a"] != "b" || len(r.Votes) != 1 {
		t.Fatalf("first vote should stand, got %v", r.Votes)
	}
}

func TestAvatarIsValidatedToAnImageId(t *testing.T) {
	cases := map[string]string{
		"pfp1":                  "pfp1",
		"pfp12":                 "pfp12",
		"🎨":                     "pfp1",
		"":                      "pfp1",
		"../../etc/passwd":      "pfp1",
		"<img src=x onerror=1>": "pfp1",
		"pfp1234":               "pfp1",
	}
	for in, want := range cases {
		p := testPlayer("avatar-test")
		p.SetProfile("x", in)
		if p.Avatar != want {
			t.Errorf("avatar %q became %q, want %q", in, p.Avatar, want)
		}
	}
}

func TestProfanityFilter(t *testing.T) {
	blocked := []string{"fuck", "FUCK!", "sh1t", "f*ck", "fuuuuck", "you are a bitch", "$hit", "(shit)", "well,fuck"}
	for _, s := range blocked {
		if !containsProfanity(s) {
			t.Errorf("%q should be flagged", s)
		}
	}
	clean := []string{"hello there", "class", "Assassin", "Scunthorpe", "I think it's the cat", "Artist_1234", "pass the ball", "Dickens"}
	for _, s := range clean {
		if containsProfanity(s) {
			t.Errorf("%q should be fine, censored to %q", s, censor(s))
		}
	}
	if got := censor("what the fuck is that"); got != "what the **** is that" {
		t.Errorf("censor() = %q", got)
	}
}

func TestNamesAreCleanedAndModerated(t *testing.T) {
	p := testPlayer("name-test-1234")
	p.SetProfile("Bad\u200bName\n", "pfp1")
	if p.Name != "BadName" {
		t.Errorf("invisible characters should be stripped, got %q", p.Name)
	}
	p.SetProfile("fuck", "pfp1")
	if p.Name != "Artist_name" {
		t.Errorf("profane name should be replaced, got %q", p.Name)
	}
}

func TestStrokePointsAreCapped(t *testing.T) {
	r := newTestRoom()
	r.StartGame()
	defer r.Close()
	d := activeDrawer(r)
	r.HandleStroke(d, StrokeData{IsNewStroke: true})
	for i := 0; i < maxPointsPerTurn+500; i++ {
		r.HandleStroke(d, StrokeData{})
	}
	r.Mutex.RLock()
	n := len(r.Strokes)
	r.Mutex.RUnlock()
	if n != maxPointsPerTurn {
		t.Fatalf("expected %d points kept, got %d", maxPointsPerTurn, n)
	}
}

func TestRateLimitBucket(t *testing.T) {
	b := newBucket(10, 5)
	allowed := 0
	for i := 0; i < 20; i++ {
		if b.allow() {
			allowed++
		}
	}
	if allowed != 5 {
		t.Fatalf("burst of 5 expected, got %d", allowed)
	}
}

func TestOriginCheck(t *testing.T) {
	mk := func(origin, host string) *http.Request {
		r := httptest.NewRequest("GET", "http://"+host+"/ws", nil)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		return r
	}
	ok := [][2]string{
		{"", "game.example.com"},
		{"http://localhost:5173", "game.example.com"},
		{"https://game.example.com", "game.example.com"},
		{"https://www.crazygames.com", "game.example.com"},
		{"https://abc123.game.crazygames.com", "game.example.com"},
	}
	for _, c := range ok {
		if !checkOrigin(mk(c[0], c[1])) {
			t.Errorf("origin %q should be allowed", c[0])
		}
	}
	bad := [][2]string{
		{"https://evil.example.org", "game.example.com"},
		{"https://crazygames.com.evil.org", "game.example.com"},
		{"https://notcrazygames.com", "game.example.com"},
	}
	for _, c := range bad {
		if checkOrigin(mk(c[0], c[1])) {
			t.Errorf("origin %q should be rejected", c[0])
		}
	}
}
