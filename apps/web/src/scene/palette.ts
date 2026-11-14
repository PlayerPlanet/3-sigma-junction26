/** Limited palette for the semi low-poly look. Keep new colours here, not inline. */
export const palette = {
  background: "#1d2230",
  floor: "#cdd1d8",
  wall: "#e9e4da",
  tableTop: "#f3eee4",
  tableBase: "#8d99ae",
  cabinet: "#b8c2cf",
  hoodShell: "#e3e8ee",
  glass: "#cfe8f5",
  rail: "#5b6270",
  railSlot: "#9aa1ad",
  station: "#f2c14e",
  metal: "#a7adb7",
  dark: "#3b4252",
  screen: "#24313f",
  screenGlow: "#7bd389",
  heat: "#d9734e",
  hazard: "#f2c14e",
  bottles: ["#e07a5f", "#3d85c6", "#81b29a", "#f2cc8f", "#9c89b8"],
} as const;

/** Liquid colour from the dominant reagent; a stable pick from the bottle colours. */
export function liquidColor(contents: Record<string, number>): string {
  const top = Object.entries(contents).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
  if (!top) return palette.bottles[1];
  let h = 0;
  for (const ch of top) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette.bottles[h % palette.bottles.length]!;
}
