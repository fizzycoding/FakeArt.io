package main

import (
	"encoding/json"
	"math/rand"
	"sync"
	"time"
)

const (
	drawRounds  = 4  // every player draws once per round
	turnSeconds = 10 // time limit for each player's single stroke
)

type Room struct {
	Code           string
	IsCustom       bool
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
	StrokeStarted  bool // the active drawer has begun their one stroke
	StrokeEnded    bool // ...and has finished it
	TurnOrder      []string
	Votes          map[string]string // VoterID -> TargetPlayerID
	Strokes        []StrokeData
	Mutex          sync.RWMutex
	Timer          *time.Timer
	StopChan       chan struct{}
}

func NewRoom(code string, isCustom bool) *Room {
	maxM := 9999
	if isCustom {
		maxM = 4
	}
	return &Room{
		Code:       code,
		IsCustom:   isCustom,
		Players:    make([]*Player, 0, 4),
		Phase:      PhaseLobby,
		Votes:      make(map[string]string),
		Strokes:    make([]StrokeData, 0),
		MaxMatches: maxM,
		StopChan:   make(chan struct{}),
	}
}

func (r *Room) AddPlayer(p *Player) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()
	if len(r.Players) >= 4 {
		return false
	}
	p.RoomCode = r.Code
	r.Players = append(r.Players, p)
	return true
}

func (r *Room) RemovePlayer(playerID string) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()
	for i, p := range r.Players {
		if p.ID == playerID {
			r.Players = append(r.Players[:i], r.Players[i+1:]...)
			break
		}
	}
}

func (r *Room) Broadcast(msgType string, payload interface{}) {
	data, err := json.Marshal(WSMessage{Type: msgType, Payload: mustMarshal(payload)})
	if err != nil {
		return
	}
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	for _, p := range r.Players {
		if p.Conn != nil && !p.IsBot {
			select {
			case p.Send <- data:
			default:
			}
		}
	}
}

func (r *Room) BroadcastToPlayer(playerID string, msgType string, payload interface{}) {
	data, err := json.Marshal(WSMessage{Type: msgType, Payload: mustMarshal(payload)})
	if err != nil {
		return
	}
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	for _, p := range r.Players {
		if p.ID == playerID && p.Conn != nil && !p.IsBot {
			select {
			case p.Send <- data:
			default:
			}
			break
		}
	}
}

func (r *Room) StartGame() {
	r.Mutex.Lock()
	if len(r.Players) < 4 {
		r.Mutex.Unlock()
		return
	}
	r.MatchCount++
	r.Phase = PhaseDrawing
	pair := getRandomWordPair()
	r.SecretWord = pair.Main
	r.ImpostorWord = pair.Impostor
	r.Strokes = make([]StrokeData, 0)
	r.Votes = make(map[string]string)

	impostorIdx := rand.Intn(len(r.Players))
	r.ImpostorID = r.Players[impostorIdx].ID

	r.TurnOrder = make([]string, len(r.Players))
	perm := rand.Perm(len(r.Players))
	for i, v := range perm {
		r.TurnOrder[i] = r.Players[v].ID
	}
	r.CurrentTurn = 0
	r.ActiveDrawerID = ""
	r.Mutex.Unlock()

	r.notifyRoundStart()
	r.startDrawingTurn()
}

func (r *Room) notifyRoundStart() {
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()

	type PlayerSummary struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Avatar string `json:"avatar"`
		Score  int    `json:"score"`
		IsBot  bool   `json:"isBot"`
	}

	summaries := make([]PlayerSummary, len(r.Players))
	for i, p := range r.Players {
		summaries[i] = PlayerSummary{
			ID:     p.ID,
			Name:   p.Name,
			Avatar: p.Avatar,
			Score:  p.Score,
			IsBot:  p.IsBot,
		}
	}

	for _, p := range r.Players {
		// Everyone, Impostor included, just receives "their" word. Nobody is told
		// whether it's the real one.
		word := r.SecretWord
		if p.ID == r.ImpostorID {
			word = r.ImpostorWord
		}
		payload := map[string]interface{}{
			"word":        word,
			"roundNumber": r.MatchCount,
			"maxMatches":  r.MaxMatches,
			"players":     summaries,
		}
		r.BroadcastToPlayer(p.ID, "START_ROUND", payload)
	}
}

// startDrawingTurn begins the next player's turn, or moves on to voting once
// every player has drawn in every round.
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

	present, isBot := false, false
	for _, p := range r.Players {
		if p.ID == drawerID {
			present, isBot = true, p.IsBot
			break
		}
	}

	if r.Timer != nil {
		r.Timer.Stop()
	}
	r.Timer = time.AfterFunc(turnSeconds*time.Second, func() {
		r.endTurn(gen)
	})
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

	switch {
	case !present:
		// The drawer left mid-game: skip their turn instead of waiting it out.
		go r.endTurn(gen)
	case isBot:
		go r.simulateBotDrawing(drawerID)
	}
}

// endTurn finishes the turn identified by gen (timer ran out, or the drawer
// lifted their pen). Calls for a turn that already ended are ignored.
func (r *Room) endTurn(gen int) {
	r.Mutex.Lock()
	if gen != r.TurnGen || r.Phase != PhaseDrawing {
		r.Mutex.Unlock()
		return
	}
	r.TurnGen++ // invalidate any other caller still holding this gen
	r.Mutex.Unlock()

	r.startDrawingTurn()
}

// HandleStroke accepts a point of the active drawer's single stroke.
func (r *Room) HandleStroke(playerID string, s StrokeData) {
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

// EndStroke is called when the active drawer lifts their pen: their one stroke
// is done, so the turn passes to the next player immediately.
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

// simulateBotDrawing draws one wobbly stroke, then hands the turn over.
func (r *Room) simulateBotDrawing(botID string) {
	time.Sleep(time.Duration(1000+rand.Intn(2500)) * time.Millisecond)

	colors := []string{"#FF5722", "#4CAF50", "#2196F3", "#9C27B0", "#FFEB3B"}
	stroke := StrokeData{
		X:           rand.Float64()*0.6 + 0.2,
		Y:           rand.Float64()*0.6 + 0.2,
		Color:       colors[rand.Intn(len(colors))],
		Width:       6,
		IsNewStroke: true,
	}
	r.HandleStroke(botID, stroke)

	stroke.IsNewStroke = false
	for j := 0; j < 12; j++ {
		time.Sleep(150 * time.Millisecond)
		stroke.X = clamp01(stroke.X + (rand.Float64()-0.5)*0.12)
		stroke.Y = clamp01(stroke.Y + (rand.Float64()-0.5)*0.12)
		r.HandleStroke(botID, stroke)
	}

	r.EndStroke(botID)
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func (r *Room) startVotingPhase() {
	r.Mutex.Lock()
	r.Phase = PhaseVoting
	r.TurnGen++ // any in-flight turn timer is now stale
	r.ActiveDrawerID = ""
	if r.Timer != nil {
		r.Timer.Stop()
	}
	r.Timer = time.AfterFunc(20*time.Second, func() {
		r.calculateResults()
	})
	r.Mutex.Unlock()

	r.Broadcast("PHASE_CHANGE", map[string]interface{}{
		"phase":           "VOTING",
		"durationSeconds": 20,
	})

	go r.simulateBotVotes()
}

func (r *Room) simulateBotVotes() {
	time.Sleep(3 * time.Second)
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	if r.Phase != PhaseVoting {
		return
	}

	for _, p := range r.Players {
		if p.IsBot {
			var targets []string
			for _, other := range r.Players {
				if other.ID != p.ID {
					targets = append(targets, other.ID)
				}
			}
			if len(targets) > 0 {
				chosenTarget := targets[rand.Intn(len(targets))]
				go r.CastVote(p.ID, chosenTarget)
			}
		}
	}
}

func (r *Room) CastVote(voterID, targetID string) {
	r.Mutex.Lock()
	if r.Phase != PhaseVoting {
		r.Mutex.Unlock()
		return
	}
	r.Votes[voterID] = targetID
	allVoted := len(r.Votes) >= len(r.Players)
	r.Mutex.Unlock()

	r.Broadcast("VOTE_REGISTERED", map[string]interface{}{
		"voterId": voterID,
	})

	if allVoted {
		if r.Timer != nil {
			r.Timer.Stop()
		}
		r.calculateResults()
	}
}

func (r *Room) calculateResults() {
	r.Mutex.Lock()
	if r.Phase == PhaseResults {
		r.Mutex.Unlock()
		return
	}
	r.Phase = PhaseResults

	voteCounts := make(map[string]int)
	for _, target := range r.Votes {
		voteCounts[target]++
	}

	topVotedID := ""
	maxVotes := -1
	for id, count := range voteCounts {
		if count > maxVotes {
			maxVotes = count
			topVotedID = id
		}
	}

	impostorCaught := (topVotedID == r.ImpostorID && maxVotes > 0)
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
		} else {
			votedTarget := r.Votes[p.ID]
			if votedTarget == r.ImpostorID {
				delta = 25
			} else {
				delta = -25
			}
		}
		scoreDeltas[p.ID] = delta
		p.Score += delta
		totalScores[p.ID] = p.Score
	}

	isGameOver := r.IsCustom && r.MatchCount >= r.MaxMatches
	impostorID, word, impostorWord := r.ImpostorID, r.SecretWord, r.ImpostorWord
	votes := make(map[string]string, len(r.Votes))
	for k, v := range r.Votes {
		votes[k] = v
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

	if !isGameOver {
		r.Timer = time.AfterFunc(10*time.Second, func() {
			r.StartGame()
		})
	}
}

func (r *Room) HandleChat(sender *Player, text string) {
	r.Mutex.RLock()
	currentPhase := r.Phase
	r.Mutex.RUnlock()

	if currentPhase != PhaseVoting {
		return
	}

	r.Broadcast("CHAT_MESSAGE", map[string]interface{}{
		"senderId":   sender.ID,
		"senderName": sender.Name,
		"message":    text,
		"timestamp":  time.Now().Format("15:04"),
	})
}

func mustMarshal(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
