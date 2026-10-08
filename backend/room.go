package main

import (
	"math/rand"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	drawRounds     = 2  // laps: every player draws this many times per round
	turnSeconds    = 12 // time limit for each player's turn
	votingSeconds  = 120
	strokesPerTurn = 2

	// A generous ceiling on points per turn (a long stroke is a few hundred).
	maxPointsPerTurn = 3000
	totalRounds      = 5 // rounds (draw + vote) in one game

	pointsSpotFakeArtist     = 100 // an artist who votes for the Fake Artist
	pointsFakeArtistSurvives = 150 // the Fake Artist when the group votes someone else
	minPlayers               = 3
	maxPlayers               = 4
)

type Room struct {
	Code           string
	IsCustom       bool
	HostID         string
	Players        []*Player
	Phase          PhaseType
	SecretWord     string // given to the artists
	ImpostorWord   string // similar decoy given to the Impostor
	ImpostorID     string
	MatchCount     int
	MaxMatches     int
	CurrentTurn    int
	TurnGen        int // bumped whenever a turn ends so stale timers/messages are ignored
	ActiveDrawerID string
	StrokesStarted int  // strokes begun in the current turn
	StrokeOpen     bool // the drawer's pen is currently down
	TurnPoints     int  // points drawn this turn, capped so a client can't flood the room
	PhaseEnds      time.Time
	Vacated        []string // turn-order seats left empty by departed players
	GameOver       bool
	TurnOrder      []string
	Votes          map[string]string // VoterID -> TargetPlayerID
	Strokes        []StrokeData
	Mutex          sync.RWMutex
	Timer          *time.Timer
}

func NewRoom(code string, isCustom bool) *Room {
	return &Room{
		Code:       code,
		IsCustom:   isCustom,
		Players:    make([]*Player, 0, maxPlayers),
		Phase:      PhaseLobby,
		Votes:      make(map[string]string),
		MaxMatches: totalRounds,
	}
}

func (r *Room) AddPlayer(p *Player) error {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()
	if r.Phase != PhaseLobby {
		return errRoomStarted
	}
	if len(r.Players) >= maxPlayers {
		return errRoomFull
	}
	r.Players = append(r.Players, p)
	if r.HostID == "" {
		r.HostID = p.ID
	}
	p.SetRoom(r.Code)
	return nil
}

func (r *Room) IsFull() bool {
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	return len(r.Players) >= maxPlayers
}

func (r *Room) RemovePlayer(playerID string) {
	r.Mutex.Lock()
	idx := -1
	for i, p := range r.Players {
		if p.ID == playerID {
			idx = i
			break
		}
	}
	if idx < 0 {
		r.Mutex.Unlock()
		return
	}
	r.Players = append(r.Players[:idx], r.Players[idx+1:]...)
	delete(r.Votes, playerID)

	remaining := len(r.Players)
	phase := r.Phase
	drawerLeft := phase == PhaseDrawing && playerID == r.ActiveDrawerID
	turnGen := r.TurnGen
	if r.HostID == playerID && remaining > 0 {
		r.HostID = r.Players[0].ID
	}
	allVoted := phase == PhaseVoting && remaining > 0 && len(r.Votes) >= remaining
	if phase == PhaseDrawing || phase == PhaseVoting {
		r.Vacated = append(r.Vacated, playerID)
	}
	r.Mutex.Unlock()

	switch {
	case remaining == 0:
		r.Close()
	case phase == PhaseLobby && !r.IsCustom:
		r.abort("A player left before the match started.")
	case phase == PhaseLobby:
		r.broadcastLobby()
	case phase == PhaseClosed:
	default:
		// The game carries on without them; clients just grey out their card.
		r.Broadcast("PLAYER_LEFT", map[string]interface{}{"playerId": playerID})
		switch {
		case allVoted:
			r.calculateResults()
		case drawerLeft:
			go r.endTurn(turnGen)
		}
	}
}

// Close stops all timers and unregisters the room; later timer callbacks no-op.
func (r *Room) Close() {
	r.Mutex.Lock()
	if r.Phase == PhaseClosed {
		r.Mutex.Unlock()
		return
	}
	r.Phase = PhaseClosed
	r.TurnGen++
	if r.Timer != nil {
		r.Timer.Stop()
	}
	r.Mutex.Unlock()
	globalHub.removeRoom(r.Code)
}

func (r *Room) abort(reason string) {
	r.Broadcast("GAME_ABORTED", map[string]interface{}{"message": reason})
	r.Close()
}

func (r *Room) summaries() []PlayerSummary {
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	return r.summariesLocked()
}

func (r *Room) summariesLocked() []PlayerSummary {
	out := make([]PlayerSummary, len(r.Players))
	for i, p := range r.Players {
		out[i] = PlayerSummary{ID: p.ID, Name: p.Name, Avatar: p.Avatar, Score: p.Score}
	}
	return out
}

func (r *Room) broadcastLobby() {
	r.Mutex.RLock()
	hostID := r.HostID
	players := r.summariesLocked()
	r.Mutex.RUnlock()

	r.Broadcast("LOBBY_UPDATE", map[string]interface{}{
		"roomCode": r.Code,
		"players":  players,
		"hostId":   hostID,
		"required": maxPlayers,
	})
}

func (r *Room) Broadcast(msgType string, payload interface{}) {
	data := marshalWS(msgType, payload)
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	for _, p := range r.Players {
		p.Enqueue(data)
	}
}

// HostStart lets a private room's host begin once enough players have joined.
func (r *Room) HostStart(playerID string) {
	r.Mutex.RLock()
	ok := r.IsCustom && r.HostID == playerID && r.Phase == PhaseLobby && len(r.Players) >= minPlayers
	r.Mutex.RUnlock()
	if ok {
		r.StartGame()
	}
}

// StartAfter begins the game once the pre-match countdown has elapsed.
func (r *Room) StartAfter(d time.Duration) {
	time.Sleep(d)
	r.StartGame()
}

func (r *Room) StartGame() {
	r.Mutex.Lock()
	if r.Phase != PhaseLobby && r.Phase != PhaseResults {
		r.Mutex.Unlock()
		return
	}
	if len(r.Players) < minPlayers {
		between := r.Phase == PhaseResults
		r.Mutex.Unlock()
		if between {
			r.abort("Not enough players left for another match.")
		}
		return
	}
	r.MatchCount++
	r.Vacated = nil
	r.Phase = PhaseDrawing
	pair := getRandomWordPair()
	r.SecretWord = pair.Main
	r.ImpostorWord = pair.Impostor
	r.Strokes = make([]StrokeData, 0)
	r.Votes = make(map[string]string)
	r.ImpostorID = r.Players[rand.Intn(len(r.Players))].ID

	// Players draw in seat order (1, 2, 3, 4, then 1 again), matching the
	// order every client lists them in.
	r.TurnOrder = make([]string, len(r.Players))
	for i, p := range r.Players {
		r.TurnOrder[i] = p.ID
	}
	r.CurrentTurn = 0
	r.ActiveDrawerID = ""

	summaries := r.summariesLocked()
	type delivery struct {
		p    *Player
		word string
	}
	deliveries := make([]delivery, len(r.Players))
	for i, p := range r.Players {
		word := r.SecretWord
		if p.ID == r.ImpostorID {
			word = r.ImpostorWord
		}
		deliveries[i] = delivery{p, word}
	}
	matchCount, maxMatches := r.MatchCount, r.MaxMatches
	r.Mutex.Unlock()

	// Everyone, Impostor included, just receives "their" word.
	for _, d := range deliveries {
		d.p.SendMsg("START_ROUND", map[string]interface{}{
			"word":        d.word,
			"roundNumber": matchCount,
			"maxMatches":  maxMatches,
			"players":     summaries,
		})
	}
	r.startDrawingTurn()
}

func (r *Room) startDrawingTurn() {
	r.Mutex.Lock()
	if r.Phase != PhaseDrawing {
		r.Mutex.Unlock()
		return
	}

	totalTurns := drawRounds * len(r.TurnOrder)
	if r.CurrentTurn >= totalTurns {
		r.Mutex.Unlock()
		r.startVotingPhase()
		return
	}

	drawerID := r.TurnOrder[r.CurrentTurn%len(r.TurnOrder)]
	drawRound := r.CurrentTurn/len(r.TurnOrder) + 1
	r.CurrentTurn++
	turnIndex := r.CurrentTurn

	r.TurnGen++
	gen := r.TurnGen
	r.ActiveDrawerID = drawerID
	r.StrokesStarted = 0
	r.StrokeOpen = false
	r.TurnPoints = 0

	present := false
	for _, p := range r.Players {
		if p.ID == drawerID {
			present = true
			break
		}
	}

	if r.Timer != nil {
		r.Timer.Stop()
	}
	r.Timer = time.AfterFunc(turnSeconds*time.Second, func() { r.endTurn(gen) })
	r.PhaseEnds = time.Now().Add(turnSeconds * time.Second)
	r.Mutex.Unlock()

	r.Broadcast("TURN_CHANGE", map[string]interface{}{
		"drawerId":     drawerID,
		"turnIndex":    turnIndex,
		"totalTurns":   totalTurns,
		"drawRound":    drawRound,
		"totalRounds":  drawRounds,
		"durationSecs": turnSeconds,
	})
	r.Broadcast("PHASE_CHANGE", map[string]interface{}{
		"phase":           "DRAWING",
		"durationSeconds": turnSeconds,
		"activeDrawerId":  drawerID,
	})

	if !present {
		go r.endTurn(gen)
	}
}

// endTurn finishes the turn identified by gen; repeat calls for it are ignored.
func (r *Room) endTurn(gen int) {
	r.Mutex.Lock()
	if gen != r.TurnGen || r.Phase != PhaseDrawing {
		r.Mutex.Unlock()
		return
	}
	r.TurnGen++
	r.Mutex.Unlock()

	r.startDrawingTurn()
}

func sanitizeStroke(s StrokeData) StrokeData {
	s.X = clamp(s.X, 0, 1)
	s.Y = clamp(s.Y, 0, 1)
	s.Width = clamp(s.Width, 1, 40)
	if len(s.Color) > 9 || !strings.HasPrefix(s.Color, "#") {
		s.Color = "#000000"
	}
	return s
}

// HandleStroke accepts a point of the active drawer's current stroke. Each
// turn allows strokesPerTurn separate strokes, one pen-down at a time.
func (r *Room) HandleStroke(playerID string, s StrokeData) {
	s = sanitizeStroke(s)

	r.Mutex.Lock()
	if r.Phase != PhaseDrawing || r.ActiveDrawerID != playerID {
		r.Mutex.Unlock()
		return
	}
	if s.IsNewStroke {
		if r.StrokeOpen || r.StrokesStarted >= strokesPerTurn {
			r.Mutex.Unlock()
			return
		}
		r.StrokeOpen = true
		r.StrokesStarted++
	} else if !r.StrokeOpen {
		r.Mutex.Unlock()
		return
	}
	if r.TurnPoints >= maxPointsPerTurn {
		r.Mutex.Unlock()
		return
	}
	r.TurnPoints++
	r.Strokes = append(r.Strokes, s)
	r.Mutex.Unlock()

	r.Broadcast("SYNC_STROKE", s)
}

// EndStroke closes the drawer's current stroke; the turn passes on once they
// have used all their strokes.
func (r *Room) EndStroke(playerID string) {
	r.Mutex.Lock()
	if r.Phase != PhaseDrawing || r.ActiveDrawerID != playerID || !r.StrokeOpen {
		r.Mutex.Unlock()
		return
	}
	r.StrokeOpen = false
	turnDone := r.StrokesStarted >= strokesPerTurn
	gen := r.TurnGen
	r.Mutex.Unlock()

	if turnDone {
		r.endTurn(gen)
	}
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func (r *Room) startVotingPhase() {
	r.Mutex.Lock()
	if r.Phase != PhaseDrawing {
		r.Mutex.Unlock()
		return
	}
	r.Phase = PhaseVoting
	r.TurnGen++
	r.ActiveDrawerID = ""
	if r.Timer != nil {
		r.Timer.Stop()
	}
	r.Timer = time.AfterFunc(votingSeconds*time.Second, r.calculateResults)
	r.PhaseEnds = time.Now().Add(votingSeconds * time.Second)
	r.Mutex.Unlock()

	r.Broadcast("PHASE_CHANGE", map[string]interface{}{
		"phase":           "VOTING",
		"durationSeconds": votingSeconds,
	})
}

func (r *Room) CastVote(voterID, targetID string) {
	r.Mutex.Lock()
	if r.Phase != PhaseVoting || !r.hasPlayerLocked(voterID) || !r.hasPlayerLocked(targetID) {
		r.Mutex.Unlock()
		return
	}
	if _, already := r.Votes[voterID]; already {
		r.Mutex.Unlock() // a vote is final
		return
	}
	r.Votes[voterID] = targetID
	allVoted := len(r.Votes) >= len(r.Players)
	r.Mutex.Unlock()

	r.Broadcast("VOTE_REGISTERED", map[string]interface{}{"voterId": voterID})

	if allVoted {
		r.calculateResults()
	}
}

func (r *Room) hasPlayerLocked(id string) bool {
	for _, p := range r.Players {
		if p.ID == id {
			return true
		}
	}
	return false
}

func (r *Room) calculateResults() {
	r.Mutex.Lock()
	if r.Phase != PhaseVoting {
		r.Mutex.Unlock()
		return
	}
	r.Phase = PhaseResults
	if r.Timer != nil {
		r.Timer.Stop()
	}

	voteCounts := make(map[string]int)
	for _, target := range r.Votes {
		voteCounts[target]++
	}
	// The Fake Artist is caught only with strictly the most votes; a tie lets
	// them off, so the result never depends on map ordering.
	impostorVotes := voteCounts[r.ImpostorID]
	impostorCaught := impostorVotes > 0
	for id, count := range voteCounts {
		if id != r.ImpostorID && count >= impostorVotes {
			impostorCaught = false
		}
	}

	scoreDeltas := make(map[string]int)
	totalScores := make(map[string]int)
	for _, p := range r.Players {
		// Nobody ever loses points: a miss simply scores nothing.
		delta := 0
		if p.ID == r.ImpostorID {
			if !impostorCaught {
				delta = pointsFakeArtistSurvives
			}
		} else if r.Votes[p.ID] == r.ImpostorID {
			delta = pointsSpotFakeArtist
		}
		scoreDeltas[p.ID] = delta
		p.Score += delta
		totalScores[p.ID] = p.Score
	}

	isGameOver := r.MatchCount >= r.MaxMatches
	r.GameOver = isGameOver
	impostorID, word, impostorWord := r.ImpostorID, r.SecretWord, r.ImpostorWord
	votes := make(map[string]string, len(r.Votes))
	for k, v := range r.Votes {
		votes[k] = v
	}
	if isGameOver {
		r.Timer = time.AfterFunc(60*time.Second, r.Close)
	} else {
		r.Timer = time.AfterFunc(10*time.Second, r.StartGame)
		r.PhaseEnds = time.Now().Add(10 * time.Second)
	}
	r.Mutex.Unlock()

	r.Broadcast("ROUND_RESULTS", map[string]interface{}{
		"impostorId":   impostorID,
		"word":         word,
		"impostorWord": impostorWord,
		"votes":        votes,
		"scoreDeltas":  scoreDeltas,
		"totalScores":  totalScores,
		"isGameOver":   isGameOver,
	})
}

func (r *Room) HandleChat(sender *Player, text string) {
	r.Mutex.RLock()
	phase := r.Phase
	r.Mutex.RUnlock()
	if phase != PhaseVoting {
		return
	}

	if !sender.chatLimit.allow() {
		return
	}
	text = strings.TrimSpace(cleanText(text))
	if utf8.RuneCountInString(text) > 200 {
		text = string([]rune(text)[:200])
	}
	if text == "" {
		return
	}
	text = censor(text)

	r.Broadcast("CHAT_MESSAGE", map[string]interface{}{
		"senderId":   sender.ID,
		"senderName": sender.Name,
		"message":    text,
		"timestamp":  time.Now().Format("15:04"),
	})
}

// TryJoinMidGame seats a newcomer in a public game that has lost a player.
// During a round they take over the empty turn-order seat (and the Fake
// Artist role if that is whose seat it was); between rounds they simply join.
func (r *Room) TryJoinMidGame(p *Player) bool {
	r.Mutex.Lock()
	if r.IsCustom || r.GameOver || len(r.Players) >= maxPlayers || len(r.Players) == 0 {
		r.Mutex.Unlock()
		return false
	}
	switch r.Phase {
	case PhaseDrawing, PhaseVoting:
		if len(r.Vacated) == 0 {
			r.Mutex.Unlock()
			return false
		}
		old := r.Vacated[0]
		r.Vacated = r.Vacated[1:]
		for i, id := range r.TurnOrder {
			if id == old {
				r.TurnOrder[i] = p.ID
			}
		}
		if r.ImpostorID == old {
			r.ImpostorID = p.ID
		}
		for voter, target := range r.Votes {
			if target == old {
				delete(r.Votes, voter)
			}
		}
	case PhaseResults:
	default:
		r.Mutex.Unlock()
		return false
	}

	r.Players = append(r.Players, p)
	p.SetRoom(r.Code)

	word := r.SecretWord
	if p.ID == r.ImpostorID {
		word = r.ImpostorWord
	}
	remaining := int(time.Until(r.PhaseEnds).Seconds()) + 1
	if remaining < 1 {
		remaining = 1
	}
	drawRound := 1
	if n := len(r.TurnOrder); n > 0 && r.CurrentTurn > 0 {
		drawRound = (r.CurrentTurn-1)/n + 1
	}
	strokes := append([]StrokeData(nil), r.Strokes...)
	voted := make([]string, 0, len(r.Votes))
	for voter := range r.Votes {
		voted = append(voted, voter)
	}
	snapshot := map[string]interface{}{
		"word":           word,
		"roundNumber":    r.MatchCount,
		"maxMatches":     r.MaxMatches,
		"players":        r.summariesLocked(),
		"phase":          string(r.Phase),
		"durationSecs":   remaining,
		"activeDrawerId": r.ActiveDrawerID,
		"drawRound":      drawRound,
		"totalRounds":    drawRounds,
		"strokes":        strokes,
		"voted":          voted,
	}
	players := r.summariesLocked()
	r.Mutex.Unlock()

	p.SendMsg("SYNC_GAME", snapshot)
	r.Broadcast("PLAYER_JOINED", map[string]interface{}{"players": players})
	return true
}
