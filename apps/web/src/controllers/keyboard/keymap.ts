import type { Action, ControllerKind, LabView, RobotPose, Snapshot } from "@lab-rats/shared";
import type { UiState } from "../../state/store";
import { neighbourInDirection } from "./railDirection";

/**
 * Keyboard teleoperation: maps a key press to (at most) one action from the shared action space, plus UI
 * changes. Pure so it can be unit-tested. Humans mostly emit primitives; the sim validates everything.
 */
export interface KeyInput {
  code: string;
  shift: boolean;
}

export interface KeyContext {
  lab: LabView;
  snapshot: Snapshot;
  ui: UiState;
  /** Camera's horizontal forward direction (unit-ish), so arrow keys follow the view. */
  forward: { x: number; z: number };
  /** Last targets sent per robot hand, so repeated presses stack while earlier ones are still queued. */
  intents: Map<string, { level: number; extend: number }>;
}

export interface KeyResult {
  action?: Action;
  ui?: Partial<UiState>;
  toast?: string;
  intent?: { key: string; level: number; extend: number };
}

export const EXTEND_STEP = 10;
export const POUR_SMALL = 10;
export const POUR_LARGE = 50;

export const KEY_HELP: [string, string][] = [
  ["1–9", "select robot"],
  ["T", "take over / hand back (to whoever had the robot)"],
  ["← → ↑ ↓", "drive to the next rail node that way"],
  ["click station", "drive there (go_to)"],
  ["Q / E", "select hand A / B"],
  ["W / S", "hand up / down one level"],
  ["R / F", `extend / retract ${EXTEND_STEP}%`],
  ["Shift+R", "extend to this station's reach"],
  ["Space", "grip / release"],
  ["P / Shift+P", `pour ${POUR_SMALL} / ${POUR_LARGE} u`],
  ["C / X", "cycle control / press it"],
  ["Esc", "stop (cancel queue)"],
  ["V", "overview / mast camera"],
  ["L / H", "labels / this help"],
];

const placeAt = (lab: LabView, pose: RobotPose) => (pose.station ? lab.places.find((p) => p.station === pose.station) ?? null : null);

export function handBase(ctx: KeyContext, pose: RobotPose, hand: "a" | "b") {
  const h = pose.hands[hand === "a" ? 0 : 1];
  const key = `${pose.id}:${hand}`;
  const idle = !pose.busy && pose.queued === 0;
  return { key, ...(idle ? { level: h.level, extend: Math.round(h.extend * 100) } : ctx.intents.get(key) ?? { level: h.level, extend: Math.round(h.extend * 100) }) };
}

export function handleKey(k: KeyInput, ctx: KeyContext): KeyResult {
  const { lab, snapshot, ui } = ctx;

  // ---- UI-only keys ----
  const digit = /^Digit([1-9])$/.exec(k.code);
  if (digit) {
    const robot = snapshot.robots[Number(digit[1]) - 1];
    return robot ? { ui: { activeRobot: robot.id, controlIdx: 0 } } : {};
  }
  if (k.code === "KeyV") return { ui: { camera: ui.camera === "overview" ? "robot" : "overview" } };
  if (k.code === "KeyL") return { ui: { showLabels: !ui.showLabels } };
  if (k.code === "KeyH" || k.code === "Slash") return { ui: { showHelp: !ui.showHelp } };
  if (k.code === "KeyQ") return { ui: { hand: "a" } };
  if (k.code === "KeyE") return { ui: { hand: "b" } };

  const pose = snapshot.robots.find((r) => r.id === ui.activeRobot);
  if (!pose) return {};
  const label = lab.layout.robots.find((r) => r.id === pose.id)?.label ?? pose.id;
  const robot = pose.id;

  if (k.code === "KeyT") {
    if (pose.controller === "human") {
      const back: ControllerKind = ui.handBack[robot] ?? "idle";
      return { action: { type: "set_controller", robot, controller: back }, toast: `${label} handed back to ${back}` };
    }
    return {
      action: { type: "set_controller", robot, controller: "human" },
      ui: { handBack: { ...ui.handBack, [robot]: pose.controller } },
      toast: `You took over ${label}`,
    };
  }

  if (k.code === "KeyC") {
    const place = placeAt(lab, pose);
    if (!place?.controls.length) return { toast: "No controls here" };
    return { ui: { controlIdx: (ui.controlIdx + 1) % place.controls.length } };
  }

  const isRobotKey = ["KeyW", "KeyS", "KeyR", "KeyF", "Space", "KeyP", "KeyX", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k.code);
  if (!isRobotKey) return {};
  if (pose.controller !== "human") {
    return { toast: pose.controller === "idle" ? `${label} is idle. Press T to take control.` : `${label} is under ${pose.controller} control. Press T to take over.` };
  }

  const hand = ui.hand;
  const base = handBase(ctx, pose, hand);
  const levels = lab.layout.robotSpec.handLevels;

  switch (k.code) {
    case "Escape":
      return { action: { type: "cancel", robot }, toast: `${label}: stop` };
    case "KeyW":
    case "KeyS": {
      const level = Math.max(0, Math.min(levels - 1, base.level + (k.code === "KeyW" ? 1 : -1)));
      if (level === base.level) return { toast: `Hand ${hand.toUpperCase()} is at the ${level === 0 ? "bottom" : "top"}` };
      return { action: { type: "set_hand_height", robot, hand, level }, intent: { key: base.key, level, extend: base.extend } };
    }
    case "KeyR":
    case "KeyF": {
      const place = placeAt(lab, pose);
      const target = k.code === "KeyR" && k.shift && place ? place.reach : base.extend + (k.code === "KeyR" ? EXTEND_STEP : -EXTEND_STEP);
      const amount = Math.max(0, Math.min(100, target));
      if (amount === base.extend) return {};
      return { action: { type: "extend_hand", robot, hand, amount }, intent: { key: base.key, level: base.level, extend: amount } };
    }
    case "Space": {
      const h = pose.hands[hand === "a" ? 0 : 1];
      return { action: { type: h.holding || h.gripping ? "release" : "grip", robot, hand } };
    }
    case "KeyP":
      return { action: { type: "tilt_pour", robot, hand, amount: k.shift ? POUR_LARGE : POUR_SMALL } };
    case "KeyX": {
      const place = placeAt(lab, pose);
      const control = place?.controls[ui.controlIdx % Math.max(1, place.controls.length)];
      if (!control) return { toast: "No controls here" };
      return { action: { type: "press", robot, hand, control } };
    }
    default: {
      // Arrow keys: drive to the adjacent node in that screen direction.
      if (!pose.node) return { toast: "Wait until the robot stops at a node" };
      const f = ctx.forward;
      const right = { x: -f.z, z: f.x };
      const dir = { ArrowUp: f, ArrowDown: { x: -f.x, z: -f.z }, ArrowRight: right, ArrowLeft: { x: -right.x, z: -right.z } }[k.code as "ArrowUp"]!;
      const to = neighbourInDirection(lab.layout, pose.node, dir.x, dir.z);
      if (!to) return { toast: "No rail that way" };
      return { action: { type: "move_along_rail", robot, to } };
    }
  }
}
