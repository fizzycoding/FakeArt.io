package main

import (
	"strings"
	"unicode"
)

// A deliberately small, conservative profanity filter for chat and player
// names. It matches whole words only (so "class" and "assassin" are fine),
// undoes common character swaps ("sh1t", "f*ck") and collapses stretched
// letters ("fuuuck"). It is not a substitute for a real moderation service.
var blockedWords = map[string]struct{}{}

func init() {
	for _, w := range []string{
		"fuck", "fucker", "fucking", "fuk", "fck", "motherfucker",
		"shit", "shitty", "bullshit", "bitch", "bastard", "asshole", "arsehole",
		"dick", "dickhead", "cock", "cunt", "pussy", "twat", "wanker",
		"whore", "slut", "porn", "rape", "rapist", "nazi",
		"nigger", "nigga", "faggot", "fag", "retard", "retarded", "tranny",
	} {
		blockedWords[collapseRepeats(w)] = struct{}{}
	}
}

var leetReplacer = strings.NewReplacer(
	"0", "o", "1", "i", "3", "e", "4", "a", "5", "s", "7", "t", "8", "b",
	"@", "a", "$", "s", "!", "i", "*", "", "+", "t",
)

func collapseRepeats(s string) string {
	var b strings.Builder
	var prev rune
	for _, r := range s {
		if r != prev {
			b.WriteRune(r)
		}
		prev = r
	}
	return b.String()
}

// isBlockedToken reports whether one whitespace-separated token is profanity.
func isBlockedToken(token string) bool {
	// Ignore punctuation around the word ("fuck!", "(shit)"), but keep "@" and
	// "$" because they stand in for letters ("$hit").
	token = strings.TrimFunc(token, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '@' && r != '$'
	})
	norm := leetReplacer.Replace(strings.ToLower(token))

	var letters strings.Builder
	for _, r := range norm {
		if unicode.IsLetter(r) {
			letters.WriteRune(r)
		}
	}
	word := collapseRepeats(letters.String())
	if word == "" {
		return false
	}
	_, blocked := blockedWords[word]
	return blocked
}

// censor replaces every profane word in text with asterisks.
func censor(text string) string {
	fields := strings.Fields(text)
	for i, f := range fields {
		// A token like "hello,fuck" or "a_fuck_b" is checked piece by piece too.
		if isBlockedToken(f) {
			fields[i] = strings.Repeat("*", len([]rune(f)))
			continue
		}
		pieces := strings.FieldsFunc(f, func(r rune) bool { return r == '_' || r == '-' || r == '.' || r == ',' })
		if len(pieces) > 1 {
			for _, p := range pieces {
				if isBlockedToken(p) {
					fields[i] = strings.Repeat("*", len([]rune(f)))
					break
				}
			}
		}
	}
	return strings.Join(fields, " ")
}

// containsProfanity reports whether text would be changed by censor.
func containsProfanity(text string) bool {
	return censor(text) != strings.Join(strings.Fields(text), " ")
}

// cleanText removes control characters, newlines and invisible formatting
// characters (zero-width spaces, bidi overrides) that could be used to spoof
// or break the layout of names and chat.
func cleanText(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return -1
		}
		return r
	}, s)
}
