import { useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import type { LabView, Vec2 } from "@lab-rats/shared";
import { Mat } from "./assets/Parts";
import { palette } from "./palette";

/** Flat strip of `width` following a polyline, lying at height y. */
function ribbon(points: Vec2[], width: number, y: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len;
    const nz = (b.x - a.x) / len;
    pos.push(p.x + (nx * width) / 2, y, p.z + (nz * width) / 2, p.x - (nx * width) / 2, y, p.z - (nz * width) / 2);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function Rails({ lab }: { lab: LabView }) {
  const strips = useMemo(
    () => lab.rails.map((r) => ({ id: r.id, bed: ribbon(r.points, 0.2, 0.006), slot: ribbon(r.points, 0.035, 0.009) })),
    [lab.rails],
  );
  const stationNodes = useMemo(() => new Set(lab.layout.stations.map((s) => s.node)), [lab.layout.stations]);
  return (
    <group>
      {strips.map((s) => (
        <group key={s.id}>
          <mesh geometry={s.bed} receiveShadow>
            <Mat color={palette.rail} />
          </mesh>
          <mesh geometry={s.slot}>
            <Mat color={palette.railSlot} />
          </mesh>
        </group>
      ))}
      {lab.layout.rails.nodes.map((n) => (
        <mesh key={n.id} position={[n.x, 0.008, n.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[0.13, stationNodes.has(n.id) ? 0.2 : 0.15, 16]} />
          <Mat color={stationNodes.has(n.id) ? palette.station : palette.rail} />
        </mesh>
      ))}
    </group>
  );
}
