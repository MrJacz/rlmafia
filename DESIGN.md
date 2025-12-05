# Rocket League Mafia Bot — Game & System Design Document

---

## **1. Overview**

Rocket League Mafia is a Discord-driven, round-based social deduction companion game played alongside private Rocket League matches.

The bot:

- Manages players
- Randomly assigns a hidden mafia
- Randomizes Rocket League teams
- Collects post-match Mafia guesses
- Resolves scoring and maintains persistent ELO ratings

Players remain enrolled between rounds and accumulate rating over time based on performance in deception and deduction.

---

## **2. Core Fantasy**

One Rocket League player is secretly sabotaging their team.
Everyone else is trying to figure out who it is.

The bot acts as:

- Game host
- Mafia assigner
- Match record keeper
- Voting system
- Scorekeeper

The match happens in Rocket League — the deduction happens socially — the scoring and outcome tracking happen via Discord.

---

## **3. Player Roles**

There are only **two roles**:

### **Villager**

- Normal player
- Goal: correctly identify the Mafia

### **Mafia**

- Secret saboteur
- Goal: lose the Rocket League match _without being detected_

Roles are randomly assigned at the start of each round.

---

## **4. Maximum Player Count**

- Supports **up to 8 players** due to Rocket League private match limits
- All registered players persist between rounds unless they leave registration
- Rounds can start with any number of players from 4 to 8

---##

## **5. Game Flow / Lifecycle**

### **Phase 1 — Join Phase**

Players register using:

```
/mafia join
```

Players remain registered across future rounds.

---

### **Phase 2 — Start Phase**

A player initiates a round with:

```
/mafia start
```

Bot actions:

1. Randomly selects exactly **one Mafia**
2. DMs all players:
    - Mafia receives "You are the Mafia"
    - Others receive "You are NOT the Mafia"

3. Randomizes players into two Rocket League teams
4. Posts team assignments in the channel for reference

Players now move into Rocket League and play.

---

### **Phase 3 — Match Phase (external)**

Players join their private Rocket League match.

- Mafia attempts to subtly sabotage their team
- Villagers observe behaviour and form suspicions

Bot is idle during the match.

---

### **Phase 4 — Report Phase**

After Rocket League match ends, someone reports the winning team:

```
/mafia report 1
```

or

```
/mafia report 2
```

This tells the bot which team actually won.

---

### **Phase 5 — Accusation Phase**

Bot posts:

> "Who was the Mafia? Vote now — 30–60 seconds to decide!"

Players vote using UI buttons representing player names.

Voting ends when:

- Everyone votes, or
- Timer expires

---

### **Phase 6 — Resolution Phase**

Bot determines:

- Who the Mafia was
- Most-voted suspect
- Whether Mafia succeeded (their team lost without being caught)
- Which voters were correct

Then applies scoring (see Section 7).

Bot posts:

- Mafia reveal
- Vote breakdown
- Updated player ELO values

---

### **Phase 7 — Reset Phase**

Round ends -> Bot returns to **Idle State**
Players remain registered -> `/mafia start` can be run immediately to begin another round.

---

## **6. Commands**

### **Gameplay Commands**

#### `/mafia join`

Adds you to the permanent player registry.

#### `/mafia leave`

Removes you from the registry.

#### `/mafia start`

Starts a new round:

- Chooses mafia
- Sends role DMs
- Randomizes teams
- Displays team assignments

#### `/mafia report <1|2>`

Reports which team won the Rocket League match.

---

### **Utility Commands**

#### `/mafia scoreboard`

Displays current ELO standings for all registered players.

#### `/mafia profile <player>`

Shows a player's stats:

- ELO rating
- Games played
- Mafia rounds played
- Mafia win rate
- Guess accuracy

#### `/mafia reset`

Admin/emergency command to force-stop a stuck round.

---

## **7. ELO System (No Rank Tiers)**

### **Purpose**

Track skill/performance over time:

- Mafia skill at deception
- Villager skill at detection

No rank divisions, no promotion thresholds — just a rating number.

---

### **Starting Point**

All players begin at **1000 ELO**.

---

### **Round Scoring Model**

There are two dimensions of reward:

#### **A. Mafia Match Success**

Mafia succeeds when:

- Their Rocket League team loses
- AND they were **not correctly voted out**

This is treated as a win equivalent in ELO terms.

#### **Mafia failure**

If the Mafia's team did _not_ lose
or
they were correctly voted out
→ Mafia loses the round.

---

### **B. Player Prediction**

Players gain rating when they correctly vote for the Mafia.

Players lose a small amount for incorrect votes (optional, tuning element).

---

### **ELO Adjustment**

A typical implementation per round might be:

- Mafia win: +30 ELO
- Mafia loss: −30 ELO
- Correct voter: +5 ELO
- Incorrect voter: −3 ELO (optional)

Values can be tuned — the system design allows for:

- static modifiers
- or true ELO expected-value scaling

Either approach works because rank tiers are removed.

---

### **Persistence**

ELO persists across rounds and sessions.

### **Seasonal Adjustment (optional)**

Season ends may decay ratings 10–20% toward baseline to avoid runaway inflation.

---

## **8. Data Tracked Per Player**

Bot tracks the following persistent stats:

- ELO rating
- Total rounds played
- Mafia rounds played
- Mafia win rate
- Guess accuracy (% of correct votes)
- Lifetime peak ELO (optional)
- Season peak ELO (optional)

These appear via `/mafia profile`.

---

## **9. Bot Responsibilities**

The bot:

1. Maintains roster of players
2. Assigns hidden Mafia roles
3. Randomizes Rocket League teams
4. Sends private role messages
5. Coordinates voting UI
6. Resolves round outcome
7. Updates rating system
8. Posts results and maintains leaderboard
9. Lets players replay indefinitely

---

## **10. Game State Model**

Bot cycles through five states:

- **No Round / Idle**
- **Lobby/Ready** (players joined, waiting for start)
- **Playing** (Rocket League match active)
- **Voting** (collection in progress)
- **Resolving** (scores + reveal)
- **Reset** (return to Idle)

---

## **11. UX / Messaging Philosophy**

Tone is Rocket League-flavoured:

- Mafia reveal messages reference demos, tilts, throws
- Score announcements feel like sports commentary
- Voting prompts encourage tension and rivalry

Example:

> Player **Jax** was demoed at mid — they were the Mafia!

---

## **12. Why This Works**

This design:

✔ Keeps rounds fast and social
✔ Combines deception with actual sports gameplay
✔ Builds progression over multiple sessions
✔ Encourages rivalry, learning, and storytelling
✔ Requires minimal bot intervention during Rocket League

---

## **13. Expansion Opportunities (Future Work)**

- Mafia team size scaling (at higher player counts)
- Achievement badges
- Match history logs per round
- Tournament mode / playoffs
- Discord UI enhancements

All build on this same lifecycle.

---

## **Single Sentence Summary**

A Discord bot that moderates a hidden-role deception minigame layered on Rocket League matches, assigning Mafia secretly, collecting post-match accusations, updating ELO scores, and letting the game repeat indefinitely with persistent progression.

---

## Additional Commands & Features

- `/mafia stats` — Overall server stats (total games, top players)
- `/mafia help` — Command reference and gameplay instructions
- `/mafia reset` — Admin command to reset game state also removes all players
- `/mafia addplayer <@user> <@user> ...` — Admin command to add players manually can add multiple players at once
- `/mafia removeplayer <@user> <@user> ...` — Admin command to remove players manually can remove multiple players at once
- `/mafia restart` — Admin command to restart the current round will reassign roles and teams

I also want to note I want the elo system to be a per server basis so each discord server has its own elo ratings and leaderboards teams should be randomly assigned each round to keep things fair and unpredictable not based on elo or skill level
