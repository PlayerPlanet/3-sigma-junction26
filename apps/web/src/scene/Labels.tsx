import { useMemo, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { LabView, Snapshot } from "@lab-rats/shared";
import { robotFrame } from "../state/interpolate";

export interface LabelSpec {
  id: string;
  /** Robot labels follow this robot's interpolated position. */
  robot?: string;
  /** Station labels: clicking drives the active robot there. */
  station?: string;
  text: string;
  kind: "station" | "robot";
  color?: string;
  position: [number, number, number];
}

/** Map of label id -> DOM element, shared by the overlay (outside the canvas) and the projector (inside). */
export type LabelRefs = MutableRefObject<Map<string, HTMLDivElement>>;

export function labelSpecs(lab: LabView, snap: Snapshot | null): LabelSpec[] {
  const nodes = new Map(lab.layout.rails.nodes.map((n) => [n.id, n]));
  const placements = new Map(lab.layout.robots.map((r) => [r.id, r]));
  const top = lab.layout.robotSpec.mastHeight + 0.55;
  const stations = lab.layout.stations.flatMap((s): LabelSpec[] => {
    const n = nodes.get(s.node);
    return n ? [{ id: `station:${s.id}`, station: s.id, text: s.label, kind: "station", position: [n.x, 0.05, n.z] }] : [];
  });
  const robots = (snap?.robots ?? []).map((r): LabelSpec => {
    const p = placements.get(r.id);
    return { id: `robot:${r.id}`, robot: r.id, text: p?.label ?? r.id, kind: "robot", color: p?.color, position: [r.x, top, r.z] };
  });
  return [...stations, ...robots];
}

/** Plain DOM overlay: one div per label, moved by <LabelProjector>. No extra React roots. */
export function LabelLayer({ specs, refs, visible, onStation }: { specs: LabelSpec[]; refs: LabelRefs; visible: boolean; onStation?: (station: string) => void }) {
  return (
    <div className="labels" style={{ display: visible ? undefined : "none" }}>
      {specs.map((s) => (
        <div
          key={s.id}
          className={`label ${s.kind}-label`}
          onClick={s.station && onStation ? () => onStation(s.station!) : undefined}
          title={s.station ? "Click to drive the active robot here" : undefined}
          ref={(el) => {
            if (el) refs.current.set(s.id, el);
            else refs.current.delete(s.id);
          }}
        >
          <span style={s.color ? { background: s.color } : undefined}>{s.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Inside the canvas: projects each label's world position to screen space every frame. */
export function LabelProjector({ specs, refs }: { specs: LabelSpec[]; refs: LabelRefs }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    for (const s of specs) {
      const el = refs.current.get(s.id);
      if (!el) continue;
      const f = s.robot ? robotFrame(s.robot) : null;
      if (f) v.set(f.x, s.position[1], f.z).project(camera);
      else v.set(...s.position).project(camera);
      if (v.z > 1) {
        el.style.visibility = "hidden";
        continue;
      }
      el.style.visibility = "visible";
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }
  });
  return null;
}
