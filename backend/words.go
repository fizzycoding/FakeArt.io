package main

import (
	"math/rand"
)

// WordPair is a main word (given to the artists) and a similar decoy word
// (given to the Impostor, who is never told they have a different word).
type WordPair struct {
	Main     string
	Impostor string
}

var wordPairs = []WordPair{
	{"Cat", "Lion"},
	{"Dog", "Wolf"},
	{"Apple", "Tomato"},
	{"Banana", "Moon"},
	{"Pizza", "Pie"},
	{"Sun", "Flower"},
	{"Rocket", "Missile"},
	{"Airplane", "Bird"},
	{"Bicycle", "Motorcycle"},
	{"House", "Castle"},
	{"Tree", "Broccoli"},
	{"Fish", "Whale"},
	{"Guitar", "Violin"},
	{"Ice Cream", "Cupcake"},
	{"Dragon", "Dinosaur"},
	{"Zebra", "Horse"},
	{"Watermelon", "Pumpkin"},
	{"Umbrella", "Mushroom"},
	{"Yacht", "Submarine"},
	{"Owl", "Penguin"},
	{"Carrot", "Pencil"},
	{"Volcano", "Mountain"},
	{"Kite", "Balloon"},
	{"Elephant", "Hippo"},
}

func getRandomWordPair() WordPair {
	p := wordPairs[rand.Intn(len(wordPairs))]
	// Randomly swap which side is the Impostor's so the pairing order leaks nothing.
	if rand.Intn(2) == 0 {
		p.Main, p.Impostor = p.Impostor, p.Main
	}
	return p
}
