package main

import (
	"math/rand"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	drawRounds    = 4  // every player draws once per round
	turnSeconds   = 10 // time limit for each player's single stroke
	votingSeconds = 20
	minPlayers    = 3
	maxPlayers    = 4
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
	StrokeStarted  bool
	StrokeEnded    bool
	TurnOrder      []string
	Votes          map[string]string // VoterID -> TargetPlayerID
	Strokes        []StrokeData
	Mutex          sync.RWMutex
	Timer          *time.Timer
}

func NewRoom(code string, isCustom bool) *Room {
	maxMatches := 1
	if isCustom {
		maxMatches = 4
	}
	return &Room{
		Code:       code,
		IsCustom:   isCustom,
		Players:    make([]*Player, 0, maxPlayers),
		Phase:      PhaseLobby,
		Votes:      make(map[string]string),
		MaxMatches: maxMatches,
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
	r.Phase = PhaseDrawing
	pair := getRandomWordPair()
	r.SecretWord = pair.Main
	r.ImpostorWord = pair.Impostor
	r.Strokes = make([]StrokeData, 0)
	r.Votes = make(map[string]string)
	r.ImpostorID = r.Players[rand.Intn(len(r.Players))].ID

	r.TurnOrder = make([]string, len(r.Players))
	for i, v := range rand.Perm(len(r.Players)) {
		r.TurnOrder[i] = r.Players[v].ID
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
	r.StrokeStarted = false
	r.StrokeEnded = false

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

// HandleStroke accepts a point of the active drawer's single stroke.
func (r *Room) HandleStroke(playerID string, s StrokeData) {
	s = sanitizeStroke(s)

	r.Mutex.Lock()
	if r.Phase != PhaseDrawing || r.ActiveDrawerID != playerID || r.StrokeEnded {
		r.Mutex.Unlock()
		return
	}
	if s.IsNewStroke {
		if r.StrokeStarted {
			r.Mutex.Unlock()
			return
		}
		r.StrokeStarted = true
	} else if !r.StrokeStarted {
		r.Mutex.Unlock()
		return
	}
	r.Strokes = append(r.Strokes, s)
	r.Mutex.Unlock()

	r.Broadcast("SYNC_STROKE", s)
}

// EndStroke passes the turn on as soon as the active drawer lifts their pen.
func (r *Room) EndStroke(playerID string) {
	r.Mutex.Lock()
	if r.Phase != PhaseDrawing || r.ActiveDrawerID != playerID || !r.StrokeStarted || r.StrokeEnded {
		r.Mutex.Unlock()
		return
	}
	r.StrokeEnded = true
	gen := r.TurnGen
	r.Mutex.Unlock()

	r.endTurn(gen)
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
	r.Mutex.Unlock()

	r.Broadcast("PHASE_CHANGE", map[string]interface{}{
		"phase":           "VOTING",
		"durationSeconds": votingSeconds,
	})
}

func (r *Room) CastVote(voterID, targetID string) {
	r.Mutex.Lock()
	if r.Phase != PhaseVoting || voterID == targetID || !r.hasPlayerLocked(voterID) || !r.hasPlayerLocked(targetID) {
		r.Mutex.Unlock()
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
	topVotedID, maxVotes := "", -1
	for id, count := range voteCounts {
		if count > maxVotes {
			maxVotes, topVotedID = count, id
		}
	}
	impostorCaught := topVotedID == r.ImpostorID && maxVotes > 0

	scoreDeltas := make(map[string]int)
	totalScores := make(map[string]int)
	for _, p := range r.Players {
		delta := 0
		if p.ID == r.ImpostorID {
			if impostorCaught {
				delta = -50
			} else {
				delta = 75
			}
		} else if r.Votes[p.ID] == r.ImpostorID {
			delta = 25
		} else {
			delta = -25
		}
		scoreDeltas[p.ID] = delta
		p.Score += delta
		totalScores[p.ID] = p.Score
	}

	isGameOver := r.MatchCount >= r.MaxMatches
	impostorID, word, impostorWord := r.ImpostorID, r.SecretWord, r.ImpostorWord
	votes := make(map[string]string, len(r.Votes))
	for k, v := range r.Votes {
		votes[k] = v
	}
	if isGameOver {
		r.Timer = time.AfterFunc(60*time.Second, r.Close)
	} else {
		r.Timer = time.AfterFunc(10*time.Second, r.StartGame)
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

	text = strings.TrimSpace(text)
	if utf8.RuneCountInString(text) > 200 {
		text = string([]rune(text)[:200])
	}
	if text == "" {
		return
	}

	r.Broadcast("CHAT_MESSAGE", map[string]interface{}{
		"senderId":   sender.ID,
		"senderName": sender.Name,
		"message":    text,
		"timestamp":  time.Now().Format("15:04"),
	})
}
