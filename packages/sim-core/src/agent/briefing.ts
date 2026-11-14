import { MACRO_TYPES, PRIMITIVE_TYPES } from "@lab-rats/shared";
import type { SimState } from "../state.js";
import type { World } from "../world/compile.js";
import { labView } from "../world/view.js";

/**
 * What an agent is told at the start: the goal, the public pathway description, the rules and the numbers
 * it needs to work at each place. Shared by the server's agent API and the headless CLI (scripts/play.ts).
 * Never includes hidden state (optimum, faults).
 */
export const RULES = [
  "Time runs in ticks (10 per simulated second). The session ends when you commit or the time budget runs out.",
  "An order is committed with the product vessel: commit { result: { item } }. A research question is committed with an answer: commit { result: { answer: { add_share, temp } } } (whole percent of the added reagent, whole °C); its analyzer runs are budgeted.",
  "Claim a robot first: set_controller { robot, controller: 'llm' } works on idle robots. Humans may take robots over at any time; then your queue for that robot is dropped.",
  "Each robot runs its queue in order. If a request fails, the rest of that robot's queue is dropped and you get the reason from /wait or /observe.",
  "Rails: one robot per segment, and a robot parked at a station blocks it. Park robots out of each other's way.",
  "Hands: move a hand up/down only when retracted; drive only with both hands retracted. Extending below a station's work level hits the table.",
  "To work at a place: park at its station, set the hand to its workLevel, extend to its reach (±10). Pour from workLevel + 1. Macros (pick, place, transfer, operate, analyze) do this for you.",
  "The dispenser adds 20 u of the selected reagent per press. operate { equipment: 'dispenser_1', settings: { reagent: i } } selects reagent i of `reagents`; then press 'dispense'.",
  "Hotplate: operate { equipment: 'hotplate_1', settings: { heat: 0..15, stir: true } }; target temperature is 20 + 5 × heat °C. Vessels warm about 1 °C per 3 ticks.",
  "The analyzer gives a noisy reading of the yield. The true yield (or the best conditions, for research) is only revealed when you commit.",
];

export function briefing(world: World, state: SimState) {
  const lab = labView(world);
  return {
    scenario: lab.scenario,
    pathway: lab.pathway,
    reagents: lab.reagents,
    rules: RULES,
    robots: world.layout.robots.map((r) => ({ id: r.id, label: r.label, controller: state.robots[r.id]!.controller })),
    places: lab.places,
    stations: world.layout.stations.map((s) => ({ id: s.id, label: s.label })),
    items: Object.values(state.items).map((i) => ({ id: i.id, type: i.type })),
    actions: {
      primitives: PRIMITIVE_TYPES,
      macros: MACRO_TYPES,
      session: ["read_log", "commit", "cancel", "set_controller"],
      examples: [
        { type: "set_controller", robot: "r1", controller: "llm" },
        { type: "place", robot: "r1", item: "flask_1", target: "dispenser_1" },
        { type: "operate", robot: "r1", equipment: "dispenser_1", settings: { reagent: 0 } },
        { type: "press", robot: "r1", hand: "b", control: "dispense" },
        { type: "transfer", robot: "r1", from: "beaker_1", to: "flask_1", amount: 40 },
        { type: "analyze", robot: "r1", sample: "flask_1" },
        { type: "commit", result: { item: "flask_1" } },
      ],
      schema: "docs/ACTION_SPACE.md",
    },
  };
}
