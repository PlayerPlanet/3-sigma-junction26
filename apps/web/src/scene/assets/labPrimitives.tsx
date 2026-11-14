import { useMemo, type FC } from "react";
import { Shape } from "three";
import { palette } from "../palette";
import { Box, Cyl, GlassMat, Mat, backSide } from "./Parts";
import type { AssetProps } from "./primitives";

/** Room shell: walls render inside-only (back faces), so the near walls vanish from an outside camera. */
const Room: FC<AssetProps> = ({ size = [16, 3, 10] }) => {
  const [w, h, d] = size;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <Mat color={palette.floor} />
      </mesh>
      <mesh position={[0, h / 2 - 0.02, 0]} receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={palette.wall} side={backSide} flatShading roughness={0.9} />
      </mesh>
    </group>
  );
};

function stadium(a: number, r: number): Shape {
  const s = new Shape();
  s.moveTo(-a, -r);
  s.lineTo(a, -r);
  s.absarc(a, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-a, r);
  s.absarc(-a, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  return s;
}

/** Pill-shaped table. size = [total length, height, width]; straight part = length - width. */
const StadiumTable: FC<AssetProps> = ({ size = [7.4, 0.9, 2.4] }) => {
  const [w, h, d] = size;
  const r = d / 2;
  const a = (w - d) / 2;
  const top = 0.07;
  const inset = 0.35;
  const topShape = useMemo(() => stadium(a, r - 0.015), [a, r]);
  const baseShape = useMemo(() => stadium(a, r - inset), [a, r]);
  return (
    <group>
      <mesh position={[0, h - top, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[topShape, { depth: top - 0.015, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 14 }]} />
        <Mat color={palette.tableTop} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[baseShape, { depth: h - top, bevelEnabled: false, curveSegments: 12 }]} />
        <Mat color={palette.tableBase} />
      </mesh>
    </group>
  );
};

/** Fume hood: cabinet, worktop, open front with a raised glass sash, exhaust duct. Front faces -z. */
const Hood: FC<AssetProps> = ({ size = [1.6, 3, 0.9] }) => {
  const [w, h, d] = size;
  const work = 0.9;
  const t = 0.05;
  const topY = Math.min(2.35, h - 0.4);
  return (
    <group>
      <Box size={[w, work - 0.05, d]} position={[0, (work - 0.05) / 2, 0]} color={palette.cabinet} />
      <Box size={[w, 0.05, d]} position={[0, work - 0.025, 0]} color={palette.tableTop} />
      {[-1, 1].map((s) => <Box key={s} size={[t, topY - work, d]} position={[(s * (w - t)) / 2, (work + topY) / 2, 0]} color={palette.hoodShell} />)}
      <Box size={[w, topY - work, t]} position={[0, (work + topY) / 2, (d - t) / 2]} color={palette.hoodShell} />
      <Box size={[w, 0.35, d]} position={[0, topY + 0.175, 0]} color={palette.hoodShell} />
      <mesh position={[0, topY - 0.3, -d / 2 + 0.03]}>
        <boxGeometry args={[w - 2 * t, 0.55, 0.02]} />
        <GlassMat />
      </mesh>
      <Box size={[w - 2 * t, 0.04, 0.04]} position={[0, topY - 0.58, -d / 2 + 0.03]} color={palette.dark} />
      <Cyl r={0.16} h={h - topY - 0.35} position={[0, topY + 0.35, 0.1]} color={palette.metal} segments={10} />
    </group>
  );
};

export const LAB_PRIMITIVES: Record<string, FC<AssetProps>> = {
  "lab.room": Room,
  "lab.table.stadium": StadiumTable,
  "lab.hood": Hood,
};
