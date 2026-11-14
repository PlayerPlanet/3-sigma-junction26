import { describe, expect, it } from "vitest";
import type { LabLayout } from "@lab-rats/shared";
import { LabView } from "@lab-rats/shared";
import { buildLabView, buildRailGraph, compileWorld, createInitialState, handHeight, layoutProblems, reachableNodes, samplePolyline, snapshot, stationTarget } from "../src/index";
import { loadDefaultLayout, loadTypes } from "./content";

const types = loadTypes();
const layout = loadDefaultLayout();
const clone = (): LabLayout => structuredClone(layout);
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("default lab content", () => {
  it("passes cross-reference validation", () => {
    expect(layoutProblems(layout, types)).toEqual([]);
  });

  it("has the MVP pieces: 3 robots, hoods on both long walls, every equipment type placed", () => {
    expect(layout.robots).toHaveLength(3);
    expect(new Set(layout.hoods.map((h) => h.wall))).toEqual(new Set(["north", "south"]));
    expect(new Set(layout.equipment.map((e) => e.type))).toEqual(new Set(Object.keys(types)));
    expect(layout.items.some((i) => i.type === "flask") && layout.items.some((i) => i.type === "beaker")).toBe(true);
  });

  it("builds a view that matches the wire schema", () => {
    const view = buildLabView(layout, types);
    expect(() => LabView.parse(view)).not.toThrow();
    expect(view.rails).toHaveLength(layout.rails.segments.length);
  });
});

describe("rail graph", () => {
  const graph = buildRailGraph(layout);

  it("is connected", () => {
    expect(reachableNodes(graph, "loop_n").size).toBe(layout.rails.nodes.length);
  });

  it("samples every segment from its start node to its end node", () => {
    for (const geo of graph.segments.values()) {
      const pts = samplePolyline(geo);
      expect(close(pts[0]!.x, geo.from.x) && close(pts[0]!.z, geo.from.z)).toBe(true);
      expect(close(pts.at(-1)!.x, geo.to.x, 1e-6) && close(pts.at(-1)!.z, geo.to.z, 1e-6)).toBe(true);
    }
  });

  it("gives a quarter-circle arc the right length and keeps it on the circle", () => {
    const arc = graph.segments.get("loop_ne_arc")!;
    const { cx, cz } = arc.segment.arc!;
    expect(close(arc.length, (Math.PI / 2) * 2, 1e-9)).toBe(true);
    for (const p of samplePolyline(arc)) expect(close(Math.hypot(p.x - cx, p.z - cz), 2, 1e-9)).toBe(true);
    // Mid-point of a ccw arc from (2.5,-2) to (4.5,0) about (2.5,0) bulges outward to +x,-z.
    const mid = arc.pointAt(0.5);
    expect(mid.x).toBeGreaterThan(3.9);
    expect(mid.z).toBeLessThan(-1.3);
  });
});

describe("robot poses", () => {
  const world = compileWorld(layout, types);
  const snap = snapshot(world, createInitialState(world, 1));

  it("start at their station nodes, facing what the station serves", () => {
    for (const pose of snap.robots) {
      const placement = layout.robots.find((r) => r.id === pose.id)!;
      const station = layout.stations.find((s) => s.id === placement.start);
      const node = layout.rails.nodes.find((n) => n.id === (station?.node ?? placement.start))!;
      expect([pose.x, pose.z]).toEqual([node.x, node.z]);
      if (!station) continue;
      const target = stationTarget(layout, station.id)!;
      const dir = { x: Math.cos(pose.heading), z: Math.sin(pose.heading) };
      expect(dir.x * (target.x - node.x) + dir.z * (target.z - node.z)).toBeGreaterThan(0);
    }
  });

  it("puts rack items on the rack and within the room", () => {
    for (const it of snap.items) {
      expect(it.location.kind).toBe("place");
      expect(Math.abs(it.position!.x)).toBeLessThan(layout.room.width / 2);
      expect(it.position!.y).toBeGreaterThan(layout.table.height);
    }
  });

  it("spaces hand levels evenly up the mast", () => {
    const spec = layout.robotSpec;
    const heights = Array.from({ length: spec.handLevels }, (_, l) => handHeight(spec, l));
    const steps = heights.slice(1).map((h, i) => h - heights[i]!);
    expect(steps.every((s) => close(s, steps[0]!))).toBe(true);
    expect(heights.at(-1)!).toBeLessThanOrEqual(spec.mastHeight + 0.28);
  });
});

describe("layout validation catches bad content", () => {
  const cases: [string, (l: LabLayout) => void, RegExp][] = [
    ["unknown segment node", (l) => (l.rails.segments[0]!.to = "nowhere"), /unknown node "nowhere"/],
    ["off-circle arc", (l) => (l.rails.segments.find((s) => s.arc)!.arc!.cx += 0.5), /not equidistant/],
    ["unknown station", (l) => (l.equipment[0]!.station = "st_missing"), /unknown station "st_missing"/],
    ["unknown equipment type", (l) => (l.equipment[0]!.type = "flux_capacitor"), /unknown type/],
    ["two robots on one node", (l) => (l.robots[1]!.start = l.robots[0]!.start), /duplicate robot start node/],
    ["slot out of range", (l) => (l.items[0]!.slot = 99), /out of range/],
    [
      "disconnected rail",
      (l) => {
        l.rails.nodes.push({ id: "island", x: 7, z: 4 }, { id: "island_b", x: 7.5, z: 4 });
        l.rails.segments.push({ id: "island_seg", from: "island", to: "island_b" });
      },
      /disconnected/,
    ],
  ];
  for (const [name, mutate, expected] of cases) {
    it(name, () => {
      const l = clone();
      mutate(l);
      expect(layoutProblems(l, types).join("\n")).toMatch(expected);
    });
  }
});
