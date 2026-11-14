import { useSyncExternalStore } from "react";
import type { ActionResult, ControllerKind, LabView, ServerHello, Snapshot } from "@lab-rats/shared";
import type { ConnectionStatus } from "../net/socket";

export type CameraMode = "overview" | "robot";

/** Browser-only UI state. Nothing here affects the simulation. */
export interface UiState {
  activeRobot: string | null;
  hand: "a" | "b";
  /** Index into the controls of the place the active robot is parked at. */
  controlIdx: number;
  camera: CameraMode;
  showLabels: boolean;
  showHelp: boolean;
  /** Controller to hand back to when the human releases a robot. */
  handBack: Record<string, ControllerKind>;
  toast: { text: string; at: number } | null;
}

/** Client-side view of what the server has sent, plus UI state. */
export interface ClientState {
  status: ConnectionStatus;
  hello: ServerHello | null;
  lab: LabView | null;
  snapshot: Snapshot | null;
  /** Previous snapshot and when the current one arrived (performance.now), for interpolation. */
  prevSnapshot: Snapshot | null;
  receivedAt: number;
  lastResult: ActionResult | null;
  ui: UiState;
}

let state: ClientState = {
  status: "connecting",
  hello: null,
  lab: null,
  snapshot: null,
  prevSnapshot: null,
  receivedAt: 0,
  lastResult: null,
  ui: { activeRobot: null, hand: "a", controlIdx: 0, camera: "overview", showLabels: true, showHelp: false, handBack: {}, toast: null },
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getState(): ClientState {
  return state;
}

export function setState(patch: Partial<ClientState>): void {
  state = { ...state, ...patch };
  emit();
}

export function setUi(patch: Partial<UiState>): void {
  state = { ...state, ui: { ...state.ui, ...patch } };
  emit();
}

export function toast(text: string): void {
  setUi({ toast: { text, at: performance.now() } });
}

export function receiveSnapshot(snapshot: Snapshot): void {
  const ui = state.ui.activeRobot === null && snapshot.robots[0] ? { ...state.ui, activeRobot: snapshot.robots[0].id } : state.ui;
  state = { ...state, prevSnapshot: state.snapshot, snapshot, receivedAt: performance.now(), ui };
  emit();
}

export function useClientState(): ClientState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}
