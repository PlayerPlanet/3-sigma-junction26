/**
 * Seeded PRNG (mulberry32). The whole generator state is one uint32 stored in SimState.rng,
 * so state stays serializable and replay is exact. The only source of randomness in the sim.
 */
export interface RngHolder {
  rng: number;
}

/** Spreads an arbitrary integer seed into a well-mixed uint32 starting state (splitmix32). */
export function seedRng(seed: number): number {
  let z = (seed >>> 0) + 0x9e3779b9;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

export function nextUint32(h: RngHolder): number {
  let t = (h.rng = (h.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Integer in [lo, hi] inclusive. */
export function randInt(h: RngHolder, lo: number, hi: number): number {
  return lo + (nextUint32(h) % (hi - lo + 1));
}

/** Integer noise centred on 0, roughly bell-shaped, within [-spread, spread]. */
export function noise(h: RngHolder, spread: number): number {
  if (spread <= 0) return 0;
  const sum = randInt(h, -spread, spread) + randInt(h, -spread, spread) + randInt(h, -spread, spread);
  return Math.round(sum / 3);
}
