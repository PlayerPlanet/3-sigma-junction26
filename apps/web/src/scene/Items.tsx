import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { ItemPose, Snapshot } from "@lab-rats/shared";
import { Asset } from "./assets/Asset";
import { liquidColor } from "./palette";
import { itemFrame } from "../state/interpolate";

function Item({ it }: { it: ItemPose }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const p = itemFrame(it.id);
    if (p && ref.current) ref.current.position.set(p.x, p.y, p.z);
  });
  const p = it.position!;
  return (
    <group ref={ref} position={[p.x, p.y, p.z]}>
      <Asset id={`equip.${it.type}`} fill={it.volume / it.capacity} liquid={liquidColor(it.contents)} />
    </group>
  );
}

/** Flasks and beakers at their snapshot positions, with liquid levels from their contents. */
export function Items({ snapshot }: { snapshot: Snapshot }) {
  return <group>{snapshot.items.map((it) => (it.position ? <Item key={it.id} it={it} /> : null))}</group>;
}
