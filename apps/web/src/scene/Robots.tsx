import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { LabView, RobotPose, Snapshot } from "@lab-rats/shared";
import { Asset } from "./assets/Asset";
import { headingToRotationY } from "./rotation";
import { robotFrame } from "../state/interpolate";
import { palette } from "./palette";

const CARRIAGE_TOP = 0.28;
/** Hands sit either side of the mast so they never overlap at the same level. */
const HAND_OFFSET = { a: -0.07, b: 0.07 } as const;

function Robot({ pose, color, mastHeight, reach, active }: { pose: RobotPose; color: string; mastHeight: number; reach: number; active: boolean }) {
  const group = useRef<Group>(null);
  const hands = useRef<(Group | null)[]>([]);
  // Smooth motion between 10 Hz snapshots: transforms are set per frame, not per React render.
  useFrame(() => {
    const f = robotFrame(pose.id);
    if (!f || !group.current) return;
    group.current.position.set(f.x, 0, f.z);
    group.current.rotation.y = headingToRotationY(f.heading);
    hands.current.forEach((h, i) => h && (h.position.y = f.handHeights[i]!));
  });
  return (
    <group ref={group} position={[pose.x, 0, pose.z]} rotation={[0, headingToRotationY(pose.heading), 0]}>
      {active && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.36, 0.44, 24]} />
          <meshBasicMaterial color={palette.station} />
        </mesh>
      )}
      <Asset id="robot.carriage" color={color} />
      <group position={[0, CARRIAGE_TOP, 0]}>
        <Asset id="robot.mast" height={mastHeight} color={color} />
      </group>
      {pose.hands.map((h, i) => (
        <group key={h.id} ref={(g) => void (hands.current[i] = g)} position={[HAND_OFFSET[h.id], h.height, 0]}>
          <Asset id="robot.hand" extend={h.extend} reach={reach} gripping={h.gripping} color={h.spot ? palette.screenGlow : color} />
        </group>
      ))}
    </group>
  );
}

export function Robots({ lab, snapshot, activeRobot }: { lab: LabView; snapshot: Snapshot; activeRobot: string | null }) {
  const placements = new Map(lab.layout.robots.map((r) => [r.id, r]));
  return (
    <group>
      {snapshot.robots.map((pose) => (
        <Robot
          key={pose.id}
          pose={pose}
          color={placements.get(pose.id)?.color ?? "#888"}
          mastHeight={lab.layout.robotSpec.mastHeight}
          reach={lab.layout.robotSpec.maxReach}
          active={pose.id === activeRobot}
        />
      ))}
    </group>
  );
}
