import type { FC } from "react";
import { palette } from "../palette";
import { Box, Cyl, GlassMat } from "./Parts";
import { LAB_PRIMITIVES } from "./labPrimitives";

/**
 * Code-built stand-ins for every asset id in assets/MANIFEST.md.
 * Conventions: origin at the base centre, `size` = [width x, height y, depth z], front faces local -z.
 */
export interface AssetProps {
  size?: [number, number, number];
  color?: string;
  /** Robot hand only. */
  extend?: number;
  reach?: number;
  gripping?: boolean;
  /** Robot mast only. */
  height?: number;
  /** Vessels only: liquid level 0..1 and colour. */
  fill?: number;
  liquid?: string;
}

/** Coloured liquid volume inside a vessel; `r` is the inner radius at the base, `h` the vessel body height. */
function Liquid({ fill = 0, color = "#3d85c6", r, rTop, h }: { fill?: number; color?: string; r: number; rTop?: number; h: number }) {
  if (fill <= 0) return null;
  const level = Math.min(1, fill) * h;
  const topR = rTop === undefined ? r : r + (rTop - r) * Math.min(1, fill);
  return (
    <mesh position={[0, level / 2 + 0.003, 0]}>
      <cylinderGeometry args={[topR, r, level, 12]} />
      <meshStandardMaterial color={color} flatShading transparent opacity={0.85} />
    </mesh>
  );
}

const ReagentShelf: FC<AssetProps> = ({ size = [0.9, 0.7, 0.35] }) => {
  const [w, h, d] = size;
  const t = 0.025;
  const shelves = [0, h * 0.48, h - t];
  return (
    <group>
      {[-1, 1].map((s) => <Box key={s} size={[t, h, d]} position={[(s * (w - t)) / 2, h / 2, 0]} color={palette.cabinet} />)}
      <Box size={[w, h, t]} position={[0, h / 2, (d - t) / 2]} color={palette.cabinet} />
      {shelves.map((y) => <Box key={y} size={[w, t, d]} position={[0, y + t / 2, 0]} color={palette.tableBase} />)}
      {shelves.slice(0, 2).flatMap((y, row) =>
        palette.bottles.map((c, i) => (
          <Cyl key={`${row}-${i}`} r={0.045} h={h * 0.3} position={[-w / 2 + 0.1 + i * ((w - 0.2) / 4), y + t, -0.02]} color={palette.bottles[(i + row * 2) % 5]} segments={8} />
        )),
      )}
    </group>
  );
};

const Dispenser: FC<AssetProps> = ({ size = [0.4, 0.5, 0.35] }) => {
  const [w, h, d] = size;
  return (
    <group>
      <Box size={[w, h * 0.7, d * 0.55]} position={[0, h * 0.35, d * 0.2]} color={palette.cabinet} />
      <Cyl r={w * 0.3} h={h * 0.3} position={[0, h * 0.7, d * 0.2]} glass />
      <Cyl r={w * 0.26} h={h * 0.18} position={[0, h * 0.7, d * 0.2]} color={palette.bottles[1]} />
      <Box size={[0.06, 0.06, d * 0.5]} position={[0, h * 0.6, -d * 0.2]} color={palette.dark} />
      <Cyl r={0.015} h={0.06} position={[0, h * 0.6 - 0.09, -d * 0.4]} color={palette.dark} />
      <Box size={[w * 0.7, 0.02, d * 0.35]} position={[0, 0.01, -d * 0.3]} color={palette.metal} />
    </group>
  );
};

const Balance: FC<AssetProps> = ({ size = [0.35, 0.15, 0.35] }) => {
  const [w, h, d] = size;
  return (
    <group>
      <Box size={[w, h * 0.55, d]} position={[0, h * 0.275, 0]} color={palette.hoodShell} />
      <Cyl r={0.012} h={h * 0.25} position={[0, h * 0.55, 0.03]} color={palette.metal} />
      <Cyl r={w * 0.36} h={0.012} position={[0, h * 0.8, 0.03]} color={palette.metal} segments={16} />
      <Box size={[w * 0.5, h * 0.3, 0.01]} position={[0, h * 0.3, -d / 2 - 0.005]} color={palette.screen} />
    </group>
  );
};

const HotplateStirrer: FC<AssetProps> = ({ size = [0.35, 0.14, 0.35] }) => {
  const [w, h, d] = size;
  return (
    <group>
      <Box size={[w, h * 0.75, d]} position={[0, h * 0.375, 0]} color={palette.hoodShell} />
      <Cyl r={w * 0.4} h={h * 0.25} position={[0, h * 0.75, 0]} color={palette.heat} segments={16} />
      {[-1, 1].map((s) => <Cyl key={s} r={0.022} h={0.025} position={[s * w * 0.25, h * 0.35, -d / 2 - 0.0125]} rotation={[Math.PI / 2, 0, 0]} color={palette.dark} segments={8} />)}
    </group>
  );
};

const Analyzer: FC<AssetProps> = ({ size = [0.6, 0.45, 0.4] }) => {
  const [w, h, d] = size;
  return (
    <group>
      <Box size={[w, h, d]} position={[0, h / 2, 0]} color={palette.cabinet} />
      <Box size={[w * 0.6, h * 0.4, 0.01]} position={[-w * 0.1, h * 0.65, -d / 2 - 0.005]} color={palette.screen} />
      <Box size={[w * 0.5, h * 0.08, 0.012]} position={[-w * 0.1, h * 0.6, -d / 2 - 0.01]} color={palette.screenGlow} glow={0.6} />
      <Box size={[w * 0.18, 0.02, d * 0.4]} position={[w * 0.3, h + 0.01, -d * 0.1]} color={palette.dark} />
      <Cyl r={0.015} h={0.01} position={[w * 0.35, h * 0.85, -d / 2 - 0.01]} rotation={[Math.PI / 2, 0, 0]} color={palette.screenGlow} />
    </group>
  );
};

const FilterStation: FC<AssetProps> = ({ size = [0.3, 0.55, 0.3] }) => {
  const [w, h, d] = size;
  return (
    <group>
      <Box size={[w, 0.02, d]} position={[0, 0.01, 0]} color={palette.dark} />
      <Cyl r={0.012} h={h} position={[0, 0, d * 0.35]} color={palette.metal} />
      <Box size={[0.02, 0.02, d * 0.35]} position={[0, h * 0.72, d * 0.17]} color={palette.metal} />
      <Cyl r={0.015} rTop={w * 0.32} h={h * 0.22} position={[0, h * 0.62, 0]} glass segments={12} />
      <Cyl r={w * 0.25} rTop={0.03} h={h * 0.3} position={[0, 0.02, 0]} glass segments={12} />
    </group>
  );
};

const GlasswareRack: FC<AssetProps> = ({ size = [1, 0.04, 0.3] }) => {
  const [w, h, d] = size;
  return (
    <group>
      <Box size={[w, h, d]} position={[0, h / 2, 0]} color={palette.tableBase} />
      <Box size={[w, h, 0.02]} position={[0, h * 1.25, d / 2 - 0.01]} color={palette.tableBase} />
    </group>
  );
};

const WasteBin: FC<AssetProps> = ({ size = [0.3, 0.35, 0.3] }) => {
  const [w, h] = size;
  const r = w / 2;
  return (
    <group>
      <Cyl r={r * 0.85} rTop={r} h={h * 0.88} color={palette.hazard} segments={12} />
      <Cyl r={r * 1.02} h={h * 0.06} position={[0, h * 0.3, 0]} color={palette.dark} segments={12} />
      <Cyl r={r * 1.04} h={h * 0.08} position={[0, h * 0.88, 0]} color={palette.dark} segments={12} />
    </group>
  );
};

const Flask: FC<AssetProps> = ({ fill, liquid }) => (
  <group>
    <Liquid fill={fill} color={liquid} r={0.055} rTop={0.02} h={0.12} />
    <Cyl r={0.06} rTop={0.022} h={0.12} glass segments={12} />
    <Cyl r={0.022} h={0.07} position={[0, 0.12, 0]} glass segments={10} />
  </group>
);

const Beaker: FC<AssetProps> = ({ fill, liquid }) => (
  <group>
    <Liquid fill={fill} color={liquid} r={0.041} h={0.1} />
    <Cyl r={0.045} h={0.11} glass segments={12} />
    <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.045, 12]} />
      <GlassMat />
    </mesh>
  </group>
);

const Carriage: FC<AssetProps> = ({ color = palette.metal }) => (
  <group>
    <Box size={[0.46, 0.05, 0.46]} position={[0, 0.045, 0]} color={palette.dark} />
    <Box size={[0.42, 0.16, 0.42]} position={[0, 0.15, 0]} color={color} />
    <Box size={[0.3, 0.04, 0.3]} position={[0, 0.25, 0]} color={palette.hoodShell} />
    {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => (
      <Cyl key={`${sx}${sz}`} r={0.04} h={0.04} position={[sx! * 0.2, 0.04, sz! * 0.17]} rotation={[0, 0, Math.PI / 2]} color={palette.dark} segments={8} />
    ))}
  </group>
);

const Mast: FC<AssetProps> = ({ height = 1.5, color = palette.metal }) => (
  <group>
    <Cyl r={0.035} h={height} color={palette.metal} segments={8} />
    <Box size={[0.1, 0.06, 0.1]} position={[0, height + 0.03, 0]} color={color} />
  </group>
);

/** One hand: collar on the mast, telescoping arm along -z, two-finger gripper. Origin = mast centre at hand height. */
const Hand: FC<AssetProps> = ({ extend = 0, reach = 1, gripping = false, color = palette.metal }) => {
  const sleeve = 0.16;
  const arm = 0.04 + extend * reach;
  const tip = -(sleeve + arm);
  const gap = gripping ? 0.035 : 0.06;
  return (
    <group>
      <Box size={[0.11, 0.07, 0.11]} color={color} />
      <Box size={[0.06, 0.05, sleeve]} position={[0, 0, -sleeve / 2]} color={palette.hoodShell} />
      <Box size={[0.035, 0.03, arm]} position={[0, 0, -sleeve - arm / 2]} color={palette.metal} />
      <Box size={[0.1, 0.035, 0.03]} position={[0, 0, tip]} color={palette.dark} />
      {[-1, 1].map((s) => <Box key={s} size={[0.015, 0.03, 0.07]} position={[s * gap, -0.01, tip - 0.045]} color={palette.dark} />)}
    </group>
  );
};

const Fallback: FC<AssetProps> = ({ size = [0.3, 0.3, 0.3] }) => <Box size={size} position={[0, size[1] / 2, 0]} color="#ff00ff" />;

export const PRIMITIVES: Record<string, FC<AssetProps>> = {
  ...LAB_PRIMITIVES,
  "equip.reagent_shelf": ReagentShelf,
  "equip.dispenser": Dispenser,
  "equip.balance": Balance,
  "equip.hotplate_stirrer": HotplateStirrer,
  "equip.analyzer": Analyzer,
  "equip.filter_station": FilterStation,
  "equip.glassware_rack": GlasswareRack,
  "equip.waste_bin": WasteBin,
  "equip.flask": Flask,
  "equip.beaker": Beaker,
  "robot.carriage": Carriage,
  "robot.mast": Mast,
  "robot.hand": Hand,
};

export const FALLBACK = Fallback;
