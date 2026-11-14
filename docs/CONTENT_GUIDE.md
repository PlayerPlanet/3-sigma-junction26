# Content guide

Everything under `content/` is JSON, validated by zod schemas exported from `@lab-rats/shared`. Invalid
content fails at server start-up and in tests, not at play time. (Schemas land with the milestone that
first needs them.)

| folder | holds | first milestone |
|--------|-------|-----------------|
| `lab-layouts/` | room size, table, hoods, rail graph (nodes, segments), stations | 2 |
| `equipment/` | one file per equipment type: id, asset id, controls, capacities | 2 |
| `pathways/` | step graphs: dispense, mix, heat, stir, filter, analyze, with parameter bands | 5 |
| `scenarios/` | orders and research questions, budgets, scoring targets | 5, 8 |
| `faults/` | PLACEHOLDER: hidden faults that change outcomes and leave log clues | later |

## Chemistry is a game, not a lab manual

- Pathways are abstract. Use school-lab flavour (soap, a fruit-scented ester, an aspirin-style product)
  with **invented** numbers, temperature bands and times.
- Do not add real quantities, reagent grades or real procedures.
- Hidden optima are drawn per seed from ranges in the pathway file; the yield model and analyzer noise
  live in sim-core, not in content.

## Lab layouts

`content/lab-layouts/<id>.json` (schema `LabLayout`). Coordinates are in metres, as described in
`docs/ARCHITECTURE.md`. Beyond the schema, sim-core rejects a layout (listing every problem) when:

- a segment, station or robot refers to an id that does not exist;
- an arc's two end nodes are not the same distance from its centre (`arc.ccw` = increasing `atan2(z, x)`);
- a station is used by no hood/equipment, or by more than one;
- an item's slot is beyond its host equipment's `slots`, or two items share a slot;
- two robots start on the same node, or the rail graph is not connected.

A station is a rail node plus the one hood or piece of equipment it serves; robots there face that thing.
Keep rail segments short around busy stations: only one robot may occupy a segment at a time (milestone 3).

## Pathways and scenarios

`content/pathways/<id>.json` (schema `Pathway`): reagents (the dispenser offers them in this order), a
`combine` step (base + add, a hidden optimum share drawn from `shareRange`, whether it must happen in a
fume hood), a `heat` step (hidden optimum temperature from `tempRange`, minimum cooking ticks, stirring),
an optional `filter` step, noise levels, and lab-log clues for common mistakes. The yield is the product
of per-step scores (ratio, temperature, time, stirring, hood, purity, filter, faults) plus per-run noise:
see `sim-core/src/chemistry/pathway.ts`. Shipped: soap (playable), ester and aspirin-style (data only).

`content/scenarios/<id>.json` (schema `Scenario`): an `order` names a pathway, a target yield, a budget
(ticks, reagent units) and fault chances. Score: below target 0–40, at/above target 60–100, minus 0.1 per
unit of waste and 0.2 per unit over the reagent budget. Doing nothing scores 0.

A `research` scenario names a pathway, a budget (ticks, reagent units and `analyses`, the number of
analyzer runs; the analyzer refuses more) and an `answerTolerance`. The player commits
`{ add_share, temp }`: the hidden optimum's share of the added reagent in whole percent and its
temperature in whole °C. Score: 50 points for each half, falling linearly to 0 at the tolerance, minus 0.2
per unit over the reagent budget. Shipped: `soap_order` and `soap_research`.

## Equipment types

`content/equipment/<id>.json` (schema `EquipmentType`): `assetId` must be listed in `assets/MANIFEST.md`;
`size` is the footprint `[width, height, depth]` the primitive or model is fitted to; `controls` are the
names `press` accepts; `slots` is how many items it holds.

## Conventions

- ids are `snake_case` and stable; renaming an id breaks stored replays.
- Visual references use asset ids from `assets/MANIFEST.md`.
