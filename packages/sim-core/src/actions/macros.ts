import type { HandId, Macro, Primitive } from "@lab-rats/shared";
import { behaviorFor } from "../equipment/index.js";
import type { SimState } from "../state.js";
import type { Place, World } from "../world/compile.js";
import { firstSlot, parkedNode } from "./spot.js";

/**
 * Expands a macro into primitives against the current state. The plan is fixed at expansion time; if any
 * primitive fails, the runner abandons the rest. A small model of the robot (node, hand levels, extension,
 * what it holds) is tracked while planning so the plan contains no redundant steps.
 */
export type Expansion = { steps: Primitive[] } | { error: string };

class Planner {
  steps: Primitive[] = [];
  node: string;
  hands: Record<HandId, { level: number; extend: number; holding: string | null }>;

  constructor(
    private world: World,
    private state: SimState,
    readonly robot: string,
  ) {
    const r = state.robots[robot]!;
    this.node = parkedNode(r)!;
    this.hands = { a: { ...r.hands.a }, b: { ...r.hands.b } };
  }

  retractAll() {
    for (const hand of ["a", "b"] as const) this.extend(hand, 0);
  }
  extend(hand: HandId, amount: number) {
    if (this.hands[hand].extend === amount) return;
    this.steps.push({ type: "extend_hand", robot: this.robot, hand, amount });
    this.hands[hand].extend = amount;
  }
  level(hand: HandId, level: number) {
    if (this.hands[hand].level === level) return;
    this.extend(hand, 0);
    this.steps.push({ type: "set_hand_height", robot: this.robot, hand, level });
    this.hands[hand].level = level;
  }
  goTo(place: Place) {
    if (this.node === place.node) return;
    this.retractAll();
    this.steps.push({ type: "move_along_rail", robot: this.robot, to: place.station });
    this.node = place.node;
  }
  reach(hand: HandId, place: Place, levelOffset = 0) {
    this.goTo(place);
    this.level(hand, place.workLevel + levelOffset);
    this.extend(hand, place.reach);
  }
  push(p: Primitive) {
    this.steps.push(p);
  }

  heldBy(item: string): HandId | null {
    return this.hands.a.holding === item ? "a" : this.hands.b.holding === item ? "b" : null;
  }
  freeHand(prefer?: HandId): HandId | null {
    if (prefer) return this.hands[prefer].holding ? null : prefer;
    return !this.hands.a.holding ? "a" : !this.hands.b.holding ? "b" : null;
  }

  /** Ensures `item` is in one of this robot's hands; returns which. */
  pick(item: string, prefer?: HandId): HandId | { error: string } {
    const held = this.heldBy(item);
    if (held) return held;
    const it = this.state.items[item];
    if (!it) return { error: `unknown item "${item}"` };
    if (it.location.kind === "waste") return { error: `${item} was discarded` };
    if (it.location.kind === "hand") return { error: `${item} is held by ${it.location.robot}` };
    const hand = this.freeHand(prefer);
    if (!hand) return { error: prefer ? `hand ${prefer} is busy holding ${this.hands[prefer].holding}` : "both hands are full" };
    const place = this.world.places.get(it.location.place)!;
    this.reach(hand, place);
    this.push({ type: "grip", robot: this.robot, hand, slot: it.location.slot });
    this.hands[hand].holding = item;
    this.extend(hand, 0);
    return hand;
  }
}

const err = (error: string): Expansion => ({ error });

export function expandMacro(world: World, state: SimState, m: Macro): Expansion {
  if (!state.robots[m.robot]) return err(`unknown robot "${m.robot}"`);
  const p = new Planner(world, state, m.robot);
  const placeOf = (id: string) => world.places.get(id);

  switch (m.type) {
    case "go_to": {
      const place = world.placeByStation.get(m.station);
      if (place) p.goTo(place);
      else if (world.layout.stations.some((s) => s.id === m.station) || world.neighbours.has(m.station)) {
        p.retractAll();
        p.push({ type: "move_along_rail", robot: m.robot, to: m.station });
      } else return err(`unknown station "${m.station}"`);
      return { steps: p.steps };
    }

    case "pick": {
      const hand = p.pick(m.item, m.hand);
      return typeof hand === "string" ? { steps: p.steps } : err(hand.error);
    }

    case "place": {
      const target = placeOf(m.target);
      if (!target) return err(`unknown place "${m.target}" (use an equipment or hood id)`);
      const loc = state.items[m.item]?.location;
      const alreadyThere = loc?.kind === "place" && loc.place === target.id;
      if (!target.sink && !alreadyThere && firstSlot(state.places[target.id]!, "free") === null) return err(`${target.id} has no free space`);
      const hand = p.pick(m.item);
      if (typeof hand !== "string") return err(hand.error);
      p.reach(hand, target);
      p.push({ type: "release", robot: m.robot, hand });
      p.extend(hand, 0);
      return { steps: p.steps };
    }

    case "transfer": {
      const to = state.items[m.to];
      if (!to) return err(`unknown item "${m.to}"`);
      if (to.location.kind !== "place") return err(`${m.to} must be standing somewhere to pour into it`);
      const target = placeOf(to.location.place)!;
      if (!target.pourable) return err(`cannot pour into vessels on ${target.id}; move ${m.to} somewhere else first`);
      if (m.from === m.to) return err("cannot pour a vessel into itself");
      const hand = p.pick(m.from);
      if (typeof hand !== "string") return err(hand.error);
      p.reach(hand, target, 1);
      p.push({ type: "tilt_pour", robot: m.robot, hand, amount: m.amount, slot: to.location.slot });
      p.extend(hand, 0);
      return { steps: p.steps };
    }

    case "operate": {
      const place = placeOf(m.equipment);
      if (!place || place.kind !== "equipment") return err(`unknown equipment "${m.equipment}"`);
      const b = behaviorFor(place.typeId!);
      if (!b.planPresses) return err(`${m.equipment} has no settings to operate; use press`);
      const presses = b.planPresses(state.equipment[m.equipment]!.settings, m.settings, world);
      if (!Array.isArray(presses)) return err(presses.error);
      const hand = p.freeHand() ?? "a";
      if (presses.length === 0) return { steps: [] };
      p.reach(hand, place);
      for (const control of presses) p.push({ type: "press", robot: m.robot, hand, control });
      p.extend(hand, 0);
      return { steps: p.steps };
    }

    case "analyze": {
      const analyzer = [...world.places.values()].find((pl) => pl.typeId === "analyzer");
      if (!analyzer) return err("this lab has no analyzer");
      const loc = state.items[m.sample]?.location;
      const inAnalyzer = loc?.kind === "place" && loc.place === analyzer.id;
      if (!inAnalyzer) {
        if (state.places[analyzer.id]!.some((s) => s !== null)) return err(`${analyzer.id} already holds a sample; remove it first`);
        const hand = p.pick(m.sample);
        if (typeof hand !== "string") return err(hand.error);
        p.reach(hand, analyzer);
        p.push({ type: "release", robot: m.robot, hand });
        p.hands[hand].holding = null;
      }
      const hand = p.freeHand() ?? "a";
      p.reach(hand, analyzer);
      p.push({ type: "press", robot: m.robot, hand, control: "run" });
      p.retractAll();
      p.push({ type: "wait", robot: m.robot, ticks: 31 });
      return { steps: p.steps };
    }
  }
}
