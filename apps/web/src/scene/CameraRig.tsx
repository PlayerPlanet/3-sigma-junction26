import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import { Vector3 } from "three";
import { cameraForward } from "../state/interpolate";

/** Orbit overview camera. Publishes its horizontal forward direction so arrow keys follow the view. */
export function CameraRig({ span }: { span: number }) {
  const { camera } = useThree();
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    camera.getWorldDirection(v);
    const len = Math.hypot(v.x, v.z) || 1;
    cameraForward.x = v.x / len;
    cameraForward.z = v.z / len;
  });
  return <OrbitControls target={[0, 0.6, 0]} maxPolarAngle={1.4} minDistance={3} maxDistance={span * 1.8} enableDamping />;
}
