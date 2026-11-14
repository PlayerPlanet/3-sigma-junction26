import { Canvas } from "@react-three/fiber";
import type { LabView, Snapshot } from "@lab-rats/shared";
import { palette } from "./palette";
import { Furniture } from "./Furniture";
import { Rails } from "./Rails";
import { Robots } from "./Robots";
import { Items } from "./Items";
import { CameraRig } from "./CameraRig";
import { LabelProjector, type LabelRefs, type LabelSpec } from "./Labels";

export function LabScene({ lab, snapshot, activeRobot, labels, labelRefs }: { lab: LabView | null; snapshot: Snapshot | null; activeRobot: string | null; labels: LabelSpec[]; labelRefs: LabelRefs }) {
  const span = lab ? Math.max(lab.layout.room.width, lab.layout.room.depth) : 16;
  return (
    <Canvas shadows="percentage" flat dpr={[1, 2]} camera={{ position: [0, span * 0.9, span * 0.58], fov: 40 }}>
      <color attach="background" args={[palette.background]} />
      <hemisphereLight args={["#eef2ff", "#55596a", 1.1]} />
      <directionalLight
        position={[4, 9, 5]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-radius={4}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-span / 2 - 1}
        shadow-camera-right={span / 2 + 1}
        shadow-camera-top={span / 2 + 1}
        shadow-camera-bottom={-span / 2 - 1}
      />
      <CameraRig span={span} />
      {lab && (
        <>
          <Furniture lab={lab} />
          <Rails lab={lab} />
          {snapshot && <Robots lab={lab} snapshot={snapshot} activeRobot={activeRobot} />}
          {snapshot && <Items snapshot={snapshot} />}
          <LabelProjector specs={labels} refs={labelRefs} />
        </>
      )}
    </Canvas>
  );
}
