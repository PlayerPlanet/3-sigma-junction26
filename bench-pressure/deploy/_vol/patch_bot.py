import sys
f = sys.argv[1]; s = open(f, encoding="utf-8").read()
rep = [
("""  function bfs(from, to) {
    const prev = new Map([[from.join(), null]]), q = [from];""",
"""  // Tiles where other scientists stand (none in a solo or replay game, so the search there is unchanged).
  const others = () => new Set(G.players.filter(o => o !== P()).map(o => tileOf(o).join()));
  function bfs(from, to) {
    const block = others();
    const prev = new Map([[from.join(), null]]), q = [from];"""),
("""        if (solidAt(n[0], n[1]) || prev.has(n.join())) continue;""",
"""        if (solidAt(n[0], n[1]) || prev.has(n.join()) || (block.has(n.join()) && !(n[0] === to[0] && n[1] === to[1]))) continue;"""),
("""  function* goTo(k) {
    const sd = STAND[k];
    for (let tries = 0; tries < 3; tries++) {
      for (const [c, r] of bfs(tileOf(P()), [sd.c, sd.r])) {
        const tx = c * T + T / 2, ty = FY + r * T + T / 2;
        for (let g = 0; g < 240; g++) {
          const dx = tx - P().x, dy = ty - P().y;
          if (Math.abs(dx) > 2.5) b.axis = [Math.sign(dx), 0];
          else if (Math.abs(dy) > 2.5) b.axis = [0, Math.sign(dy)];
          else break;
          yield;
        }
      }
      b.axis = [sd.fx, sd.fy]; yield; b.axis = [0, 0];""",
"""  function* goTo(k) {
    const sd = STAND[k];
    // multi: another scientist shares the lab (a human P1 with an AI partner). Then a blocked walk is
    // re-planned around them after 1/3 s instead of pushing for 4 s per tile. Solo and replays: unchanged.
    const multi = G.players.length > 1;
    for (let tries = 0; tries < (multi ? 8 : 3); tries++) {
      let stuck = false;
      for (const [c, r] of bfs(tileOf(P()), [sd.c, sd.r])) {
        const tx = c * T + T / 2, ty = FY + r * T + T / 2;
        let still = 0, lx = P().x, ly = P().y;
        for (let g = 0; g < 240; g++) {
          const dx = tx - P().x, dy = ty - P().y;
          if (Math.abs(dx) > 2.5) b.axis = [Math.sign(dx), 0];
          else if (Math.abs(dy) > 2.5) b.axis = [0, Math.sign(dy)];
          else break;
          yield;
          if (multi) {
            if (Math.abs(P().x - lx) + Math.abs(P().y - ly) < 0.01) { if (++still > 20) { stuck = true; break; } } else still = 0;
            lx = P().x; ly = P().y;
          }
        }
        if (stuck) break;
      }
      if (stuck) { b.axis = [0, 0]; for (let w = 0; w < 20; w++) yield; continue; }
      b.axis = [sd.fx, sd.fy]; yield; b.axis = [0, 0];"""),
]
for a, b2 in rep:
    assert s.count(a) == 1, a[:60]
    s = s.replace(a, b2)
open(f, "w", encoding="utf-8").write(s)
print("ok")
