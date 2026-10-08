package main

import (
	"sync"
	"time"
)

// bucket is a small token-bucket rate limiter: it refills at `rate` tokens per
// second up to `burst`, and each allowed event costs one token.
type bucket struct {
	mu     sync.Mutex
	tokens float64
	last   time.Time
	rate   float64
	burst  float64
}

func newBucket(rate, burst float64) *bucket {
	return &bucket{tokens: burst, last: time.Now(), rate: rate, burst: burst}
}

func (b *bucket) allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	b.tokens += now.Sub(b.last).Seconds() * b.rate
	if b.tokens > b.burst {
		b.tokens = b.burst
	}
	b.last = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}
