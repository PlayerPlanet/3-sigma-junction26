# Action space

One schema for humans, LLM controllers and scripts: `packages/shared/src/actions.ts` (zod). This page
describes the rules sim-core applies. Units: hand **levels** are integers (0 = lowest, 6 levels on the
default robot); **extension** is a percentage 0..100; liquid **amounts** are whole units; time is
**ticks** (10 per simulated second).

## Tier 1: primitives

Primitives are what the sim executes and what the event log replays. Each takes at least one tick; a
robot runs one primitive at a time. Checks marked *start* reject the primitive immediately (status
`invalid`, nothing moves); others are decided when it completes.

| action | args | duration | rules |
|--------|------|----------|-------|
| `move_along_rail` | `robot`, `to` (station or rail node id) | 0.6 m/s | *start*: both hands retracted; a rail route exists. Follows the shortest route. Waits while the next segment or node is taken by another robot; after 10 s of waiting it ends `blocked`. Cancel stops it at the next node. |
| `set_hand_height` | `robot`, `hand` (`a`/`b`), `level` | 4 ticks per level | *start*: hand retracted. |
| `extend_hand` | `robot`, `hand`, `amount` 0..100 | 10 % per tick | *start*: at a station, extending below the place's **work level** would hit the table/worktop. |
| `grip` | `robot`, `hand`, `slot?` | 2 ticks | *start*: hand empty. If the hand is **on the spot** it picks the item in `slot` (or the first occupied slot), otherwise it grips nothing. |
| `release` | `robot`, `hand`, `slot?` | 2 ticks | Holding something: *start* requires the hand on the spot and a free slot (or a sink, which discards the item and its contents as waste). Empty hand: just opens. |
| `tilt_pour` | `robot`, `hand`, `amount`, `slot?` | 10 units per tick | *start*: holding a non-empty vessel, hand on the spot **one level above** the work level, a vessel below (or a sink). Mixes proportionally; overflow spills to waste. Cancel stops pouring. |
| `press` | `robot`, `hand`, `control` | 1 tick | *start*: hand on the spot of a piece of equipment that has that control. The equipment's rules decide the effect (and may fail, e.g. "no vessel under the dispenser"). |
| `wait` | `robot`, `ticks` 1..600 | `ticks` | Cancel ends it immediately. |

**On the spot** = robot parked at the place's station, hand at the place's work level (+1 to pour), and
extension within ±10 of the place's reach. Work level and reach are computed per place from the layout
(see `World.places`); controllers can read them, so this is about procedure, not guessing geometry.

**Rail rules.** One robot per segment, and a robot parked at a node blocks it, including stations. A
robot moving onto a segment also reserves the node it is heading to. Routes are planned when a move
starts and go round nodes where other robots are parked if there is another way. Two robots meeting
head-on fail at once ("head-on with r2 … one of you must back off"). Robots start at docks (rail ends).

## Tier 2: macros

Macros expand into primitives when the robot gets to them, using the state at that moment. If any of its
primitives fails, the rest of the plan is abandoned.

| macro | args | expands to |
|-------|------|-----------|
| `go_to` | `station` (or rail node) | retract hands, `move_along_rail` |
| `pick` | `item`, `hand?` | go to the item's place, set level, extend, `grip(slot)`, retract (free hand unless given) |
| `place` | `item`, `target` (equipment/hood id) | `pick` if needed, go to target, set level, extend, `release`, retract |
| `transfer` | `from`, `to`, `amount` | `pick(from)` if needed, go to `to`'s place, level + 1, extend, `tilt_pour(amount, slot)`, retract |
| `operate` | `equipment`, `settings` | go there, the presses that reach `settings` (e.g. `{ heat: 4, stir: true }`), retract |
| `analyze` | `sample` | place the sample in the analyzer if needed, `press run`, retract, wait for the result |

## Session actions

Applied at the next tick, not queued on a robot.

| action | args | effect |
|--------|------|--------|
| `read_log` | `limit?` | returns the recent lab log immediately; logged, no sim effect |
| `commit` | `result: { item?, answer? }` | records a submission (scored in M5 / M8) |
| `cancel` | `robot` | clears the robot's queue; the primitive in flight stops at its next safe point |
| `set_controller` | `robot`, `controller` | `human` / `llm` / `script` / `idle`; also clears the queue and cancels (takeover / hand-back) |

## Queues, controllers and failures

- Each robot has a FIFO queue. Only the robot's current controller may queue actions for it (`idle`
  accepts none). The browser always acts as `human`.
- A failed request (rejected macro, or a primitive that ends `invalid`/`blocked`/`failed`/`cancelled`)
  **clears the rest of that robot's queue**, because later requests were planned assuming it worked.
  Controllers get a completion notice with the reason (`Sim.drainCompletions()`).

## Event record

`{ tick, actor: "human"|"llm"|"script"|"system", robot, action, result }`. Primitives and session
actions are replayed exactly from these records (`replay(world, seed, events, endTick)`); macro records
are annotations kept for data capture, since the primitives they expanded into are logged too. `system`
sets the initial controllers at tick 0.
