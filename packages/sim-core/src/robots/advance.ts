import { addToItem, describeContents, takeUnits, volume } from "../chemistry/contents.js";
import { EXTEND_PER_TICK, HAND_LEVEL_TICKS, MAX_BLOCKED_TICKS, POUR_PER_TICK, SPEED_MM_PER_TICK } from "../constants.js";
import { firstSlot, handAtPlace } from "../actions/spot.js";
import { log, type RobotState, type SimState, type TaskStatus } from "../state.js";
import type { World } from "../world/compile.js";
import { segmentBetween } from "../world/path.js";
import { pressEquipment } from "../equipment/run.js";
import { onContentsChanged } from "../chemistry/pathway.js";
import { onPick } from "../faults/index.js";

/** Pouring carries the source's history (combination, cooking) into the destination. */
function mergeProcess(src: SimState["items"][string], dst: SimState["items"][string]): void {
  const a = src.process;
  const b = dst.process;
  if (a.combinedAt !== null && (b.combinedAt === null || a.combinedAt < b.combinedAt)) {
    b.combinedAt = a.combinedAt;
    b.combinedInHood = a.combinedInHood;
    b.noise = a.noise;
  }
  b.cookTicks = Math.max(a.cookTicks, b.cookTicks);
  b.tempSum = Math.max(a.tempSum, b.tempSum);
  b.stirTicks = Math.max(a.stirTicks, b.stirTicks);
  b.overheatTicks = Math.max(a.overheatTicks, b.overheatTicks);
  b.filtered = b.filtered && a.filtered;
}

function finish(state: SimState, r: RobotState, status: TaskStatus, reason?: string): void {
  const t = r.task!;
  r.last = { seq: t.seq, type: t.action.type, status, ...(reason ? { reason } : {}), startTick: t.startTick, endTick: state.tick };
  if (status !== "ok") log(state, "warn", r.id, `${t.action.type} ${status}${reason ? `: ${reason}` : ""}`);
  r.task = null;
  r.cancelRequested = false;
}

/** Another robot is on `segment`, parked at `node`, or already heading to `node`. */
function railOccupant(state: SimState, self: string, segment: string, node: string): string | null {
  for (const id of Object.keys(state.robots).sort()) {
    if (id === self) continue;
    const rail = state.robots[id]!.rail;
    if ("node" in rail ? rail.node === node : rail.segment === segment || rail.to === node) return id;
  }
  return null;
}

function advanceMove(world: World, state: SimState, r: RobotState): void {
  const t = r.task!;
  let budget = SPEED_MM_PER_TICK;
  for (;;) {
    if ("segment" in r.rail) {
      const rail = r.rail;
      const step = Math.min(budget, rail.length - rail.progress);
      rail.progress += step;
      budget -= step;
      if (rail.progress < rail.length) return;
      r.rail = { node: rail.to };
      t.route.shift();
    }
    // Parked at a node: the safe point for cancellation.
    if (t.route.length === 0) return finish(state, r, "ok");
    if (r.cancelRequested) return finish(state, r, "cancelled", "stopped at the next rail node");
    if (budget === 0) return;
    const from = r.rail.node;
    const next = t.route[0]!;
    const seg = segmentBetween(world, from, next)!;
    const occupant = railOccupant(state, r.id, seg.segment, next);
    if (occupant) {
      // Head-on: the occupant is itself waiting for the node we are parked on. Nobody can pass on one rail.
      const o = state.robots[occupant]!;
      if (o.task?.action.type === "move_along_rail" && o.task.blocked > 0 && o.task.route[0] === from) {
        return finish(state, r, "blocked", `head-on with ${occupant} between ${from} and ${next}; one of you must back off`);
      }
      if (t.blocked === 0) log(state, "warn", r.id, `waiting: ${occupant} is in the way at ${next}`);
      t.blocked++;
      if (t.blocked > MAX_BLOCKED_TICKS) finish(state, r, "blocked", `${occupant} did not clear ${next}`);
      return;
    }
    t.blocked = 0;
    r.rail = { segment: seg.segment, from, to: next, progress: 0, length: seg.length };
  }
}

/** Advances the robot's current primitive by one tick. */
export function advanceRobot(world: World, state: SimState, r: RobotState): void {
  const t = r.task;
  if (!t) return;
  const a = t.action;
  switch (a.type) {
    case "move_along_rail":
      return advanceMove(world, state, r);

    case "set_hand_height": {
      const h = r.hands[a.hand];
      if (h.level === a.level) return finish(state, r, "ok");
      if (++t.remaining < HAND_LEVEL_TICKS) return;
      t.remaining = 0;
      h.level += a.level > h.level ? 1 : -1;
      if (h.level === a.level) finish(state, r, "ok");
      return;
    }

    case "extend_hand": {
      const h = r.hands[a.hand];
      const d = a.amount - h.extend;
      h.extend += Math.sign(d) * Math.min(Math.abs(d), EXTEND_PER_TICK);
      if (h.extend === a.amount) finish(state, r, "ok");
      return;
    }

    case "grip": {
      if (--t.remaining > 0) return;
      const h = r.hands[a.hand];
      h.gripping = true;
      const at = handAtPlace(world, r, a.hand);
      const slot = "place" in at ? firstSlot(state.places[at.place.id]!, "occupied", a.slot) : null;
      if ("reason" in at || slot === null) {
        log(state, "info", r.id, `hand ${a.hand} gripped nothing`);
        return finish(state, r, "ok");
      }
      const id = state.places[at.place.id]![slot]!;
      state.places[at.place.id]![slot] = null;
      state.items[id]!.location = { kind: "hand", robot: r.id, hand: a.hand };
      h.holding = id;
      log(state, "info", r.id, `picked up ${id} from ${at.place.id}`);
      onPick(state, id);
      return finish(state, r, "ok");
    }

    case "release": {
      if (--t.remaining > 0) return;
      const h = r.hands[a.hand];
      h.gripping = false;
      const id = h.holding;
      if (!id) return finish(state, r, "ok");
      const at = handAtPlace(world, r, a.hand);
      if ("reason" in at) return finish(state, r, "failed", at.reason); // cannot happen after start checks; kept for safety
      const item = state.items[id]!;
      h.holding = null;
      if (at.place.sink) {
        const v = volume(item.contents);
        state.waste += v;
        item.contents = {};
        item.location = { kind: "waste" };
        log(state, "warn", r.id, `discarded ${id}${v ? ` with ${v} u inside` : ""}`);
        return finish(state, r, "ok");
      }
      const slot = firstSlot(state.places[at.place.id]!, "free", a.slot)!;
      state.places[at.place.id]![slot] = id;
      item.location = { kind: "place", place: at.place.id, slot };
      log(state, "info", r.id, `put ${id} on ${at.place.id}`);
      return finish(state, r, "ok");
    }

    case "tilt_pour": {
      const h = r.hands[a.hand];
      const src = state.items[h.holding!]!;
      const at = handAtPlace(world, r, a.hand, 1);
      if ("reason" in at) return finish(state, r, "failed", at.reason);
      const n = Math.min(POUR_PER_TICK, a.amount - t.poured);
      const moved = takeUnits(src.contents, n);
      const units = volume(moved);
      t.poured += units;
      if (at.place.sink) {
        state.waste += units;
      } else {
        const slot = firstSlot(state.places[at.place.id]!, "occupied", a.slot)!;
        const dst = state.items[state.places[at.place.id]![slot]!]!;
        const spilled = addToItem(state, dst, moved, src.temp);
        if (spilled) log(state, "warn", r.id, `${dst.id} overflowed: ${spilled} u spilled`);
        mergeProcess(src, dst);
        onContentsChanged(world, state, dst, at.place.id);
      }
      const done = t.poured >= a.amount || volume(src.contents) === 0;
      if (done || r.cancelRequested) {
        log(state, "info", r.id, `poured ${t.poured} u from ${src.id} at ${at.place.id}; ${src.id} now ${describeContents(src.contents)}`);
        return finish(state, r, done ? "ok" : "cancelled", done ? undefined : `stopped after ${t.poured} u`);
      }
      return;
    }

    case "press": {
      const at = handAtPlace(world, r, a.hand);
      if ("reason" in at) return finish(state, r, "failed", at.reason);
      const res = pressEquipment(world, state, at.place.id, a.control);
      return res.ok ? finish(state, r, "ok") : finish(state, r, "failed", res.reason);
    }

    case "wait":
      if (r.cancelRequested) return finish(state, r, "cancelled");
      if (--t.remaining <= 0) finish(state, r, "ok");
      return;
  }
}
