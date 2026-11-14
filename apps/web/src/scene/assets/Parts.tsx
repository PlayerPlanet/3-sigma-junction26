import { BackSide, DoubleSide } from "three";
import { palette } from "../palette";

type V3 = [number, number, number];

/** Flat-shaded material used by every primitive. */
export function Mat({ color, glow = 0 }: { color: string; glow?: number }) {
  return <meshStandardMaterial color={color} flatShading roughness={0.8} metalness={0.05} emissive={color} emissiveIntensity={glow} />;
}

export function GlassMat() {
  return <meshStandardMaterial color={palette.glass} transparent opacity={0.35} roughness={0.1} depthWrite={false} side={DoubleSide} />;
}

/** Box whose position is its centre. */
export function Box({ size, position = [0, 0, 0], color, glow, rotation }: { size: V3; position?: V3; color: string; glow?: number; rotation?: V3 }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <Mat color={color} glow={glow} />
    </mesh>
  );
}

/** Cylinder standing on `y` (position is the base centre). */
export function Cyl({ r, rTop, h, position = [0, 0, 0], color, segments = 10, glass, rotation }: { r: number; rTop?: number; h: number; position?: V3; color?: string; segments?: number; glass?: boolean; rotation?: V3 }) {
  const [x, y, z] = position;
  return (
    <mesh position={[x, y + h / 2, z]} rotation={rotation} castShadow={!glass} receiveShadow={!glass}>
      <cylinderGeometry args={[rTop ?? r, r, h, segments, 1, glass]} />
      {glass ? <GlassMat /> : <Mat color={color ?? palette.metal} />}
    </mesh>
  );
}

export const backSide = BackSide;
