import { describe, expect, it } from "vitest";
import { nextUint32, noise, randInt, seedRng } from "../src/index";
import { takeUnits, volume } from "../src/chemistry/contents";

describe("seeded rng", () => {
  it("is reproducible from a seed and differs between seeds", () => {
    const run = (seed: number) => {
      const h = { rng: seedRng(seed) };
      return Array.from({ length: 20 }, () => nextUint32(h));
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it("randInt and noise stay in range and cover it", () => {
    const h = { rng: seedRng(7) };
    const ints = Array.from({ length: 2000 }, () => randInt(h, -3, 3));
    expect(Math.min(...ints)).toBe(-3);
    expect(Math.max(...ints)).toBe(3);
    const n = Array.from({ length: 2000 }, () => noise(h, 5));
    expect(n.every((x) => Number.isInteger(x) && Math.abs(x) <= 5)).toBe(true);
    expect(Math.abs(n.reduce((a, b) => a + b, 0) / n.length)).toBeLessThan(0.3);
  });
});

describe("integer liquid transfer", () => {
  it("removes exactly min(n, volume) units, proportionally, for many random mixtures", () => {
    const h = { rng: seedRng(99) };
    for (let i = 0; i < 500; i++) {
      const c: Record<string, number> = {};
      for (const k of ["x", "y", "z"]) if (randInt(h, 0, 2)) c[k] = randInt(h, 1, 80);
      const before = { ...c };
      const total = volume(c);
      const n = randInt(h, 0, 120);
      const removed = takeUnits(c, n);
      expect(volume(removed)).toBe(Math.min(n, total));
      expect(volume(removed) + volume(c)).toBe(total);
      for (const k of Object.keys(removed)) expect(Math.abs(removed[k]! - (before[k]! * Math.min(n, total)) / total)).toBeLessThan(1);
    }
  });
});
