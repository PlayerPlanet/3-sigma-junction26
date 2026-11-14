import type { LabView } from "@lab-rats/shared";
import { Asset } from "./assets/Asset";

/** Room, stadium table, fume hoods and equipment, all placed from the layout. Items are in Items.tsx. */
export function Furniture({ lab }: { lab: LabView }) {
  const { layout, equipmentTypes } = lab;
  const { room, table } = layout;
  return (
    <group>
      <Asset id="lab.room" size={[room.width, room.height, room.depth]} />
      <group position={[table.center.x, 0, table.center.z]}>
        <Asset id="lab.table.stadium" size={[table.straightLength + 2 * table.radius, table.height, 2 * table.radius]} />
      </group>
      {layout.hoods.map((h) => {
        const north = h.wall === "north";
        const z = (north ? -1 : 1) * (room.depth / 2 - h.depth / 2);
        // Front faces -z; north hoods face into the room (+z), so turn them around.
        return (
          <group key={h.id} position={[h.x, 0, z]} rotation={[0, north ? Math.PI : 0, 0]}>
            <Asset id="lab.hood" size={[h.width, room.height, h.depth]} />
          </group>
        );
      })}
      {layout.equipment.map((e) => {
        const type = equipmentTypes[e.type];
        if (!type) return null;
        const y = e.surface === "table" ? table.height : 0;
        return (
          <group key={e.id} position={[e.position.x, y, e.position.z]} rotation={[0, e.rotationY, 0]}>
            <Asset id={type.assetId} size={type.size} />
          </group>
        );
      })}
    </group>
  );
}
