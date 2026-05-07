# Blackjack Trainer

A three-phase blackjack training app. Single-page, no backend, works offline after first load. Built for self-paced practice from beginner through advantage play.

**Live:** https://juureeg.github.io/blackjack-trainer/

## Three phases

**Phase 1 — Basic strategy drill.** Random hands, instant feedback on hit/stand/double/split/surrender, with explanations on the most-confused cells (16v10, soft 18 vs 9, 12v3, etc.). Toggle H17/S17, DAS, surrender. Tracks your accuracy, streak, and worst cells.

**Phase 2 — Counting drills.**
- *Deck-down speed:* count a single deck card-by-card at adjustable speed (1.5s slow → 0.35s elite). Hi-Lo or KO. Final RC must be exactly 0 (Hi-Lo) or +4 (KO single deck). Tracks best time.
- *True count conversion:* random RC and decks-remaining, you call the TC (round toward zero). Tracks accuracy and average response time.
- *Pair cancellation:* two random cards, call the net Hi-Lo value. Auto-advances to drill speed.

**Phase 3 — Full game.** 6-deck shoe with 83% penetration. You see running count and TC update live. Place a bet (suggested bet shown for the current TC using the 1-12 spread "TC minus 1" rule), play the hand, get per-decision feedback on (a) play accuracy vs basic strategy and (b) bet sizing vs Kelly-approximation suggestion. Bankroll persists across sessions.

## Pedagogical order

1. Phase 1 only, until you hit 100% accuracy across 200 random hands.
2. Phase 2 deck-down + pair cancellation, until you can count a deck under 25s with no errors.
3. Phase 2 TC conversion, until under 1.5s/answer with 100% accuracy.
4. Phase 3 integrated game, focus on holding the count under decision pressure.

The flashcard-style Phase 1 is mathematically the most efficient way to learn the strategy. Phase 3 hand-by-hand simulation is great for *integration* but inefficient for *memorization*. Don't skip Phase 1.

## Stack

Vanilla HTML/CSS/JS. No build step, no dependencies. State stored in `localStorage`. Works on iOS Safari, Android Chrome, and any modern desktop browser. Add to home screen for app-like full-screen mode on phone.

## Limitations (v1)

- Phase 3 doesn't yet handle splits properly (single hand only after split is auto-resolved).
- Phase 3 deviation scoring uses pure basic strategy, not Illustrious 18 (the index plays are described in the companion coursework PDF but not yet wired into the simulator).
- No Hi-Opt II or Wong Halves drills (only Hi-Lo and KO).
- No insurance offering as a separate decision.

## Companion material

This app pairs with `Blackjack: From Noob to Pro`, a 61-page coursework PDF covering the same material in textbook depth (rules, strategy, counting systems, Kelly/RoR math, advanced AP techniques, casino countermeasures, legal landscape, 12-month training program).

## License

MIT.
