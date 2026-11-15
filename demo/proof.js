// Fills proof.html from window.DEMO_DATA.measured (written by scripts/build_demo_data.py from
// results/blackbox_v2/trials.csv and results/battleship_harbor/). Nothing here is typed by hand.
(function () {
  const M = window.DEMO_DATA && window.DEMO_DATA.measured;
  if (!M) return;
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const desk = M.desk;
  $('#desk').innerHTML = desk.rows.map((r) => {
    const cls = r.reference ? 'ref' : r.name === 'Claude Opus 5.5' ? 'hi' : '';
    const meta = r.harness === '-' || r.harness === 'oracle' ? `n=${r.n}` : `${esc(r.harness)}, n=${r.n}`;
    return `<div class="hbar ${cls}"><span>${esc(r.name)} <small>${meta}</small></span>` +
      `<u style="--v:${Math.max(r.mean, 0.004)}"></u><b>${r.mean.toFixed(2)}</b></div>`;
  }).join('');
  $('#desk-note').textContent = desk.opus;
  $('#desk-src').textContent = `Source: ${desk.source} (${desk.trials} graded trials); ${desk.opus_source}.`;

  const bs = M.battleship;
  $('#stated').textContent = `${M.stated.count} stated-model environments: agents with a shell (Claude Code with Opus 5.5) wrote exact inference and matched the reference in every one. The last was Rulebound Battleship, where Opus scored ${bs.opus.toFixed(2)} against the reference's ${bs.reference.toFixed(2)} (Battleship reward, ${bs.opus_n} Harbor trials on all five boards).`;
  $('#stated-src').textContent = `Source: ${M.stated.source}; ${bs.source}.`;

  $('#integrity').innerHTML = M.integrity.map((f) =>
    `<div class="fact" title="Source: ${esc(f.source)}"><b>${esc(f.value)}${f.versus != null ? `<small>vs ${esc(f.versus)}</small>` : ''}</b>` +
    `<p>${esc(f.text)}</p><p class="small">Source: ${esc(f.source)}</p></div>`).join('');

  const T = M.training;
  $('#training-num').innerHTML = `${T.after}<small>from ${T.before}</small>`;
  $('#training').textContent = T.text;
  $('#training-src').textContent = `Source: ${T.source}.`;
})();
