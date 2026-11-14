// Checks the JavaScript engine against the Python engine's test vectors and recorded games.
//   node demo/src/verify.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from './engine.js';

const path = fileURLToPath(new URL('../data.js', import.meta.url));
const window = {};
new Function('window', readFileSync(path, 'utf8'))(window);
const D = window.DEMO_DATA;

let worst = 0, checks = 0;
const close = (a, b, what) => {
  const d = Math.abs(a - b);
  worst = Math.max(worst, d);
  checks++;
  if (!(d < 1e-9)) throw new Error(`${what}: js ${a} vs python ${b}`);
};
const eq = (a, b, what) => {
  checks++;
  if (a !== b) throw new Error(`${what}: js ${a} vs python ${b}`);
};

const g = E.geometry();
eq(g.L, D.constants.L, 'layout count');
g.nRule.forEach((n, k) => eq(n, D.constants.n_rule[k], `layouts for ${E.NAMES[k]}`));
close(g.cellNorm, D.constants.cell_norm, 'cell_norm');
D.constants.p0.forEach((p, c) => close(g.p0[c], p, `p0[${c}]`));

for (const [t, T] of D.tests.entries()) {
  const b = new E.Belief();
  T.actions.forEach((a, i) => {
    const y = E.outcome(T.layout, a, i, T.u);
    eq(y, T.results[i], `test ${t} outcome ${i}`);
    b.update(a, y);
  });
  b.rules().forEach((v, k) => close(v, T.rules[k], `test ${t} rule ${k}`));
  b.occupancy().forEach((v, c) => close(v, T.occ[c], `test ${t} occ ${c}`));
  b.eig().forEach((v, a) => close(v, T.eig[a], `test ${t} eig ${a}`));
  eq(E.greedyAction(b, 2), T.greedy, `test ${t} greedy`);
  const s = E.score(b.rules(), b.occupancy(), T.rule, T.layout);
  close(s.score_raw, T.score_exact.score_raw, `test ${t} exact score`);
  const sq = E.score(T.q, b.occupancy(), T.rule, T.layout);
  close(sq.rule_part, T.score_q.rule_part, `test ${t} rule part`);
  close(sq.score_raw, T.score_q.score_raw, `test ${t} q score`);
}

// The recorded reference games: replaying the greedy rule in JS must give the same game.
for (const B of D.boards) {
  const run = B.runs.reference;
  const b = new E.Belief();
  let remaining = E.BUDGET, i = 0;
  // (ties between symmetric actions are broken by rounding, so compare values, not indices)
  while (remaining > 0) {
    const eig = b.eig();
    const val = (a) => (E.actionCost(a) <= remaining ? eig[a] / E.actionCost(a) : -Infinity);
    const a = run.actions[i];
    close(val(a), val(E.greedyAction(b, remaining)), `board ${B.seed} reference action ${i}`);
    const y = E.outcome(B.layout, a, i, B.u);
    eq(y, run.results[i], `board ${B.seed} reference result ${i}`);
    b.update(a, y);
    remaining -= E.actionCost(a);
    i++;
  }
  const s = E.score(b.rules(), b.occupancy(), B.rule, B.layout);
  if (Math.abs(s.score_raw - run.score.score_raw) > 1e-4)
    throw new Error(`board ${B.seed} reference score ${s.score_raw} vs ${run.score.score_raw}`);
  checks++;
  // recorded submissions score the same in JS (stored rounded to 5 decimals)
  for (const [name, r] of Object.entries(B.runs)) {
    const sj = E.score(r.submitted_rules, r.submitted_occ, B.rule, B.layout);
    if (Math.abs(sj.score_raw - r.score.score_raw) > 2e-2)
      throw new Error(`board ${B.seed} ${name} score ${sj.score_raw} vs ${r.score.score_raw}`);
    checks++;
  }
}
console.log(`engine OK: ${checks} checks, largest difference ${worst.toExponential(2)}`);
