import { Suspense, useMemo, type FC } from "react";
import { Box3, Vector3 } from "three";
import { useGLTF } from "@react-three/drei";
import manifestMd from "../../../../../assets/MANIFEST.md?raw";
import { parseManifest } from "./manifest";
import { FALLBACK, PRIMITIVES, type AssetProps } from "./primitives";

/** id -> file, from assets/MANIFEST.md. Files are served from assets/ (Vite publicDir). */
const FILES = parseManifest(manifestMd);

/** A .glb scaled to fit `size` (if given), base at y = 0. */
const GltfAsset: FC<{ src: string } & AssetProps> = ({ src, size }) => {
  const { scene } = useGLTF(src);
  const obj = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => ((o.castShadow = true), (o.receiveShadow = true)));
    if (size) {
      const box = new Box3().setFromObject(clone);
      const dims = box.getSize(new Vector3());
      clone.scale.setScalar(Math.min(size[0] / dims.x, size[1] / dims.y, size[2] / dims.z));
      const fitted = new Box3().setFromObject(clone);
      clone.position.y -= fitted.min.y;
    }
    return clone;
  }, [scene, size]);
  return <primitive object={obj} />;
};

/**
 * Renders an asset by id. Scene code only ever uses this, so swapping a primitive for a model
 * means adding a file and filling in its row in assets/MANIFEST.md.
 */
export function Asset({ id, ...props }: { id: string } & AssetProps) {
  const Primitive = PRIMITIVES[id] ?? FALLBACK;
  const file = FILES[id];
  if (!file) return <Primitive {...props} />;
  return (
    <Suspense fallback={<Primitive {...props} />}>
      <GltfAsset src={`/${file}`} {...props} />
    </Suspense>
  );
}
