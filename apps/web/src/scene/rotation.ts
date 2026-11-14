/** Converts a sim heading (radians, 0 = +x, measured toward +z) to a three.js y-rotation for an object whose front is -z. */
export function headingToRotationY(heading: number): number {
  return -heading - Math.PI / 2;
}
