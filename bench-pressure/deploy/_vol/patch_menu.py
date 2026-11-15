import sys
from pathlib import Path

f = Path(sys.argv[1])
s = f.read_text(encoding="utf-8")
js = (Path(__file__).parent / "partner.js").read_text(encoding="utf-8")
a = "// ---------- live charts ----------"
assert s.count(a) == 1
s = s.replace(a, js + a)
a = '''          <label class="seed" for="seedIn">Seed <input id="seedIn" type="text" inputmode="numeric" maxlength="9"></label>
        </div>'''
b = a + '''
        <div class="partner" id="partnerRow">
          <label for="partnerSel">Lab partner</label>
          <select id="partnerSel">
            <option value="">None</option>
            <option value="gemini" disabled>Gemini (Google DeepMind, live)</option>
            <option value="gemma" disabled>Gemma (ours, RL-trained)</option>
            <option value="nemotron" disabled>Nemotron (NVIDIA, live)</option>
          </select>
          <p class="note" id="partnerNote">Checking whether AI lab partners are reachable…</p>
        </div>'''
assert s.count(a) == 1
s = s.replace(a, b)
a = "</style>"
b = """.partner { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 12px; }
.partner label { font-weight: 600; font-size: 13px; color: var(--ink); }
.partner select { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); }
.partner .note { flex: 1 1 100%; margin: 0; }
</style>"""
assert s.count(a) == 1
s = s.replace(a, b)
f.write_text(s, encoding="utf-8")
print("ok")
