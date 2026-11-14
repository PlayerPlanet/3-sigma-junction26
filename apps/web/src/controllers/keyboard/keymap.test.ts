import { describe, expect, it } from "vitest";
import { createInitialState, labView, snapshot } from "@lab-rats/sim-core";
import { DEFAULT_CONTENT_DIR, loadContent, worldFromContent } from "@lab-rats/sim-core/node";
import type { UiState } from "../../state/store";
import { handleKey, type KeyContext } from "./keymap";
import { neighbourInDirection } from "./railDirection";

const world = worldFromContent(loadContent(DEFAULT_CONTENT_DIR));
const lab = labView(world);
const state = createInitialState(world, 1);
for (const r of Object.values(state.robots)) r.controller = "human";
const snap = snapshot(world, state);

const ui: UiState = { activeRobot: "r1", hand: "a", controlIdx: 0, camera: "overview", showLabels: true, showHelp: false, handBack: {}, toast: null };
const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({ lab, snapshot: snap, ui, forward: { x: 0, z: -1 }, intents: new Map(), ...over });
const key = (code: string, shift = false) => ({ code, shift });

describe("keyboard teleoperation", () => {
  it("maps arrow keys to the adjacent rail node in the view direction", () => {
    // r1 is at loop_nw (-2.5, -2). Default camera looks toward -z (north).
    expect(handleKey(key("ArrowRight"), ctx()).action).toEqual({ type: "move_along_rail", robot: "r1", to: "loop_n" });
    expect(handleKey(key("ArrowDown"), ctx()).action).toMatchObject({ to: "loop_w" });
    expect(handleKey(key("ArrowUp"), ctx()).toast).toMatch(/No rail/);
    // Camera turned to look toward +x: "up" now drives east.
    expect(handleKey(key("ArrowUp"), ctx({ forward: { x: 1, z: 0 } })).action).toMatchObject({ to: "loop_n" });
  });

  it("emits hand primitives for the selected hand and stacks repeated presses", () => {
    const c = ctx();
    const up = handleKey(key("KeyW"), c);
    expect(up.action).toEqual({ type: "set_hand_height", robot: "r1", hand: "a", level: snap.robots[0]!.hands[0].level + 1 });
    expect(handleKey(key("KeyR", true), c).action).toEqual({ type: "extend_hand", robot: "r1", hand: "a", amount: world.places.get("dispenser_1")!.reach });
    expect(handleKey(key("Space"), ctx({ ui: { ...ui, hand: "b" } })).action).toEqual({ type: "grip", robot: "r1", hand: "b" });
    expect(handleKey(key("KeyX"), c).action).toEqual({ type: "press", robot: "r1", hand: "a", control: "select_reagent" });
    expect(handleKey(key("KeyC"), c).ui).toEqual({ controlIdx: 1 });
  });

  it("refuses robot keys when the robot is not under human control, and T takes over", () => {
    const llmSnap = { ...snap, robots: snap.robots.map((r) => (r.id === "r1" ? { ...r, controller: "llm" as const } : r)) };
    expect(handleKey(key("KeyW"), ctx({ snapshot: llmSnap })).toast).toMatch(/Press T to take over/);
    const t = handleKey(key("KeyT"), ctx({ snapshot: llmSnap }));
    expect(t.action).toEqual({ type: "set_controller", robot: "r1", controller: "human" });
    expect(t.ui?.handBack).toEqual({ r1: "llm" });
  });

  it("picks no neighbour for a direction with no rail", () => {
    expect(neighbourInDirection(lab.layout, "wall_n_e", 1, 0)).toBeNull();
    expect(neighbourInDirection(lab.layout, "wall_n_e", -1, 0)).toBe("wall_n_3");
  });
});
