# Head Start Labyrinth Escape

## Snapshot

A short grid-based arcade maze game: the player gets a head start, then a
faster hunter enters the maze.

The original idea was close to "modified Pac-Man with a Minotaur." That is still
a valid center. The project should not assume it needs to become a roguelike,
stealth sim, trap game, or multiplayer game before proving the basic chase.

The first design question:

> Is maze escape more exciting when the player gets a brief head start before a
> faster predator enters the problem?

If yes, the game can grow. If no, extra systems probably will not save the core.

## Current Anchors

- Short runs: roughly 2 to 5 minutes.
- Grid movement, closer to Pac-Man than freeform corridor movement.
- Visible countdown for the first prototype.
- Faster hunter once active.
- Instant loss on contact.
- Pure escape is enough for the first objective.
- Minotaur/labyrinth is the cleanest default theme, but full Greek myth is not
  required.
- Procedural/systemic design is a better fit than a handcrafted puzzle campaign.

## Not Decided

- Fully visible maze, fogged maze, or some kind of memory/reveal system.
- Visible exit, unknown exit, locked exit, or hinted exit.
- Fast twitch grid movement versus slower deliberate grid movement.
- Whether the first real hook after the baseline is movement/detection,
  maze information, or maze tools.
- Whether sound matters immediately or later.
- Whether gates, traps, and Bomberman-like tools are core or just a later branch.
- Whether a larger roguelike structure is worth pursuing later.
- Whether any multiplayer or social version matters.

## V0 Prototype

Make the smallest playable arcade version first:

- one small generated maze
- one fixed test maze
- player start
- exit
- visible countdown
- fixed hunter release point
- faster hunter
- instant loss on contact
- win by reaching the exit
- placeholder art is fine, including Pac-Man/ghost-like stand-ins

Leave out gates, traps, keys, stealth, fog, optional objectives, and multiplayer.

This may be too bare. It may collapse into a timed maze solver. That is still a
useful baseline, as long as the prototype is built so one uncertainty layer can
be tested quickly afterward.

The first follow-up toggle should probably be visibility:

- full visible maze
- local reveal/fog until corridors are seen

That A/B test answers whether the game needs unknown maze information before
adding larger mechanics.

## Ideas To Preserve

### Sneak/Sprint

The player may have two movement modes:

- sneak: slower and quiet
- sprint: faster and loud

This affects every movement decision and may be a cleaner identity mechanic than
gates or traps. The head start could let the player sprint freely early, then
shift into quieter movement once the hunter is close.

Stamina is unresolved. Start without it if testing this branch: sprinting's
first downside should be detectability. Add stamina or cooldown only if sprint
is automatic even with sound risk.

### Fog, Automap, And Memory

Maze information may be the real hook if the baseline is too plain.

Possibilities:

- full visible maze under pressure
- line-of-sight fog of war
- revealed cells stay visible
- revealed cells fade dynamically with limited memory
- only the last N cells or corridors remain highlighted
- pickups or upgrades extend memory length

The fading memory idea is worth keeping. It directly supports backtracking,
panic, and maze-solving without relying on a large new toolset.

### Gates, Traps, And Bomberman Influence

Gates and traps are still interesting, but they should not be assumed core.

Possible gate shape:

- gates block both player and hunter
- the player can close a gate behind them
- gates buy time rather than permanently solving the chase
- the hunter can break gates after a delay

Possible trap shape:

- traps are pre-placed map fixtures
- traps are collectibles
- traps can be triggered manually or automatically
- traps stun, redirect, or delay the hunter
- traps create danger zones rather than direct combat

Bomberman is a useful influence for destructible barriers, temporary danger
zones, and maze tactics. The caution is that this branch may turn the game into
trap combat instead of escape.

### Social And Alternate Modes

Several ideas are worth preserving without forcing them into one taxonomy yet:

- player controls the hunter
- asymmetric multiplayer: one player escapes while another controls the hunter
- multiple runners share the maze and compete or cooperate under pressure
- multiple runners try to survive CPU-controlled hunter(s)
- multiple hunters pressure a solo runner or a group

The "I do not have to outrun the monster; I have to outrun you" version is a
strong social hook for multiple runners. It could create cooperation, blocking,
baiting, sacrifice, and last-second betrayals.

The inverse hunter idea may be harder than it first sounds if the victim is CPU
controlled, because a good runner needs to solve the maze, flee, and make
believable escape decisions. That does not kill the idea; it just means it is a
different problem from the first prototype.

### Multiple Hunters

Multiple hunters are not inherently a multiplayer idea. They could appear in
solo, social, or alternate modes. The question is whether they create readable
pressure or make the maze feel unfair.

### Room-To-Room Gate Loop

The room-to-room gate idea may be a core loop, not just a roguelike expansion.
Each room is a short local maze escape. Reaching a border door/gate transitions
to the next room, and the player seals the gate behind them. The monster is
trapped in the previous room, and the countdown/head start has an in-world
cause: it is the time the monster needs to break through the sealed gate and
enter the new room.

Arcade shape:

- each room is a short maze escape
- reaching a border door/gate clears or exits the room
- the player seals the gate behind them
- the monster is trapped in the previous room
- the countdown/head start is the monster breaking through the sealed gate
- the next room starts with a fresh escape problem

This could support a simple non-roguelike structure: survive a fixed number of
rooms, reach a final exit, or score by rooms cleared.

### Roguelike Expansion

A larger roguelike version could build on the room-to-room gate loop, but it is
not the first priority.

Possible shape:

- Binding of Isaac-like room traversal layered over the maze: each chamber is a
  local maze problem, and the run advances by crossing border doors or gates
- gather resources during the head start or while fleeing
- clear chambers or sub-objectives inside the labyrinth
- earn upgrades that change movement, memory, detection, gates, traps, or escape
  options
- unlock new maze features, hunters, tools, or starting conditions across runs
- decide whether to escape early or keep pushing deeper for more resources
- reveal a metamap/minimap of the larger labyrinth as rooms are discovered, so
  players make route choices across the run rather than only inside one maze

This points toward an endless or long-form run structure. Each room creates a
fresh local escape problem, while the larger metamap, room rewards, powerups,
and persistent unlocks provide progression between rooms and across attempts.

This could give the idea longer-term progression and more systemic texture. The
risk is that it buries the clean arcade premise under too many economies before
the basic escape loop is proven.

## Theme Notes

The Minotaur is a good default because players immediately understand:

- labyrinth
- hunter
- escape
- mythic danger

The first prototype does not need real theme art. The hunter can be visibly
asleep, sealed in a lair, released from a fixed point, or represented by a
placeholder. That choice matters for readability and fairness, but not for the
first design proof.

## Questions For Prototype Review

- Does the countdown create tension?
- Is the hunter exciting or merely annoying?
- Does a short run invite immediate retries?
- Does the player feel like they lost because of readable decisions?
- Is the baseline too much like a timed maze solver?
- Does hidden information create panic or intrigue or just randomness?
- Does sprint noise create interesting choices, or is sprint still automatic?
- Do gates/traps create clever escape moments or distract from escape?
- Does backtracking feel like a useful pressure or a chore?

## Offline Map Diagnostics

A small offline analyzer may be useful if tuning starts to feel blind. It should
not become a substitute for playtesting or a "fun score." The goal is only to
flag map and tuning combinations that are obviously unlikely to produce a good
chase.

Possible outputs:

- shortest path length from start to exit
- hunter distance to the player start and exit
- fork, junction, dead-end, and corridor-length counts
- earliest likely detection point on a simple escape route
- rough pressure estimates from current speed and head-start settings
- warnings for maps that look too short, too linear, instantly detected, or
  mathematically hopeless

Keep this lightweight and offline. Avoid adding player-facing debug UI or a
large simulation harness unless the prototype clearly needs it.

## Failure Modes

- Overbuilding stealth before the arcade maze works.
- Treating gates, traps, fog, or multiplayer as required before testing pure
  escape.
- Making the hunter omniscient or unpredictable in a way that feels unfair.
- Making fog so restrictive that losing feels random or the maze becomes too
  obscure.
- Making the maze fully procedural before there is a known-good test map.
- Letting the game become pure route memorization with no fresh decisions.
- Turning the game into combat when the stronger premise may be escape.

## Recommended Next Step

Build the KISS prototype and answer one question:

> Does head-start maze escape feel fun with almost no extra mechanics?

If it feels too plain but promising, test visibility next. If visibility is not
the issue, test sneak/sprint before gates and traps.
