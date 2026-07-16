# Labyrinth

Prototype breakout for a short grid-based arcade maze game: the player gets a
head start, then a faster hunter enters the maze.

Start from `SPEC.md`. The current experiment keeps the arcade maze shape but
chains rooms together:

- grid movement
- one small generated maze plus one fixed test maze
- endless room-to-room loop
- visible countdown
- entrance gate on one room side
- exit gate on a different room side
- next room entrance appears on the opposite wall at the same row/column as the
  previous exit gate
- hunter breaks through the entrance gate after the countdown
- readable hunter with patrol, line-of-sight sprint chase, straightaway
  acceleration, corridor overshoot, slower tracking/search, and periodic scent
  reacquisition
- instant loss on contact
- one key
- one locked gate to the next room
- broken entrance gate becomes an impassable blocked doorway
- limited tap-to-path movement for nearby hallway destinations
- generated rooms are filtered by route length, head-start coverage, and
  diagnostic hunter timing margin
- no traps, stealth, fog, optional objectives, or multiplayer yet

Likely stack: Vite + React + TypeScript, so the prototype can be tested in a
browser, run through Devhost, and eventually deployed with GitHub Pages.
