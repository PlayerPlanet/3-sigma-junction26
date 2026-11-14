import { TICK_MS, type RobotPose } from "@lab-rats/shared";
import { getState } from "./store";

/** 0..1: how far we are from the previous snapshot to the current one (snapshots arrive every TICK_MS). */
export function interpAlpha(now = performance.now()): number {
  const { receivedAt } = getState();
  return Math.min(1, Math.max(0, (now - receivedAt) / TICK_MS));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

export interface RobotFrame {
  x: number;
  z: number;
  heading: number;
  handHeights: [number, number];
}

/** Robot pose blended between the last two snapshots. Render only. */
export function robotFrame(id: string, alpha = interpAlpha()): RobotFrame | null {
  const { snapshot, prevSnapshot } = getState();
  const cur = snapshot?.robots.find((r) => r.id === id);
  if (!cur) return null;
  const prev: RobotPose = prevSnapshot?.robots.find((r) => r.id === id) ?? cur;
  // Snap rather than swing when the heading flips by a lot (e.g. arriving at a station).
  const turn = Math.abs(((cur.heading - prev.heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  return {
    x: lerp(prev.x, cur.x, alpha),
    z: lerp(prev.z, cur.z, alpha),
    heading: turn > 1.2 ? cur.heading : lerpAngle(prev.heading, cur.heading, alpha),
    handHeights: [lerp(prev.hands[0].height, cur.hands[0].height, alpha), lerp(prev.hands[1].height, cur.hands[1].height, alpha)],
  };
}

/** Item position blended between snapshots; null if not visible. */
export function itemFrame(id: string, alpha = interpAlpha()): { x: number; y: number; z: number } | null {
  const { snapshot, prevSnapshot } = getState();
  const cur = snapshot?.items.find((i) => i.id === id)?.position;
  if (!cur) return null;
  const prev = prevSnapshot?.items.find((i) => i.id === id)?.position ?? cur;
  return { x: lerp(prev.x, cur.x, alpha), y: lerp(prev.y, cur.y, alpha), z: lerp(prev.z, cur.z, alpha) };
}

/** Camera's horizontal forward direction, written by the camera rig each frame; used to map arrow keys. */
export const cameraForward = { x: 0, z: -1 };
