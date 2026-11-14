# Demo page

A static pitch page: flash-card intro, the idea, a playable Rulebound Battleship on a 3D sea
next to a recorded agent, the agent against an RL-tuned agent, and the wet-lab transfer test.

Open `demo/index.html` in Chrome or Edge. No server, no network: everything is in this folder.

## What is real and what is a placeholder

| Part | Status |
|---|---|
| Game engine in the browser (`src/engine.js`) | A port of `bayesenv/battleship.py`. `npm run verify` checks it against Python test vectors (posterior, information gain, scores) to 1e-9. |
| Boards, noise, recorded games, scores (`data.js`) | Written by `scripts/build_demo_data.py` from the real engine. |
| "Agent" in the game | A **proxy**, labelled as such: the reference's shots with every report treated as exact (`noise_ignoring_coder` in `docs/BATTLESHIP.md`). No language model has played yet. |
| "RL-tuned agent" | **Not measured.** The right-hand panel shows the exact-Bayes reference and says so. |
| Wet-lab curves | Simulated with `bayesenv.wetlab.simulate_trajectories`. |
| Transfer bars | **Empty on purpose** until the pre-registered comparison has been run. |
| Headline numbers | Quoted from `README.md` (see `HEADLINE` in the export script). |

Your own score in the game: your shots are scored with exact inference on the cells, and your
rule pick with its confidence is scored as the rule belief (`conf` on the pick, the rest spread
evenly). "Experiments" is the score of the exact posterior given your shots; "beliefs" is what
your rule call added or lost on top of it.

## Putting measured model runs in

Edit the `llm` block at the end of `main()` in `scripts/build_demo_data.py` (or post-process
`data.js`). The page switches from proxy to model as soon as a block is not null.

```jsonc
"llm": {
  "base":  { "label": "Gemma 4 E4B, base",
             "games": { "39": { "actions": [42, 14, ...],        // 0-35 fire row*6+col, 36-41 scan row, 42-47 scan column
                                "results": [2, 1, ...],
                                "beliefs": [ {"rules": [6 numbers], "occ": [36 numbers]}, ... ],  // one more than actions; the model's own belief, or the exact posterior of its shots
                                "score": {"score_raw": 0.1, "design": 0.4, "inference": -0.3} } } },
  "tuned": { "label": "Gemma 4 E4B + GRPO", "games": { "39": { ... } } },
  "transfer": { "rows": 200, "note": "95% bootstrap intervals.",
                "arms": [ {"name": "Base model", "mean": 0.55}, {"name": "Control", "mean": 0.56},
                          {"name": "RL on Battleship", "mean": 0.63} ] }
}
```

Games are keyed by board seed; the page uses the boards chosen in `pick_boards()` with salt
`demo-<seed>`, so model runs must use the same seeds and salt to be on the same hidden boards.

## Ship models

The ships are built in code by default (`src/ships.js`). To use downloaded models, put
uncompressed `.glb` files (no Draco) in `assets/ships/` and embed them:

```
assets/ships/battleship.glb   length-4 ship
assets/ships/cruiser.glb      length-3 ship
assets/ships/destroyer.glb    length-2 ship
```
```bash
cd demo && npm run models      # writes ships-data.js; the page picks them up on reload
```

Models are scaled to their cells, turned so the long axis follows the ship, and sunk by 22% of
their height (`window.SHIP_WATERLINE` changes that). Keep each file under a few MB: they are
embedded as text so the page still opens from `file://`. Check each model's licence.

## Rendering

Sky: three.js `Sky` (Preetham scattering). Water: Gerstner swell plus a drifting normal map
(`waternormals.jpg` from the three.js examples, MIT, embedded in `src/gen/assets.js`), sky and
ship reflections, sun glitter. Fog: ray-marched volume lit by the sun, density taken from the
belief. Bloom, vignette and grain on top. Frame rate is protected by lowering fog steps and
then resolution when frames get slow.

## Intro sound

`assets/intro.mp3` is synthesised by `tools/make_intro_sound.py` (numpy, scipy, ffmpeg): 120 bpm,
a pulsing bass and string figure that build, a low hit on each card cut, a riser, and a final
impact as the page appears. The music starts 1 s before the first card (`INTRO_LEAD` in
`src/app.js`, `LEAD` in the script). Browsers
block sound until a click, so the page opens on a "Begin" screen. If you change the cards'
`data-ms` timings in `index.html`, change `CARD_MS` in the script and run it again.

## Rebuild

```bash
python scripts/build_demo_data.py     # from the repo root: writes demo/data.js
cd demo && npm install
npm run verify                        # JS engine against the Python test vectors
npm run build                         # src/*.js -> app.js
```

## Media

`assets/` holds the photos supplied by the team (`still1` to `still6`), two AI-generated clips
(`tubes.mp4` in the hero, `dish.mp4` in the idea section, made with Google Gemini), `sea.jpg`
(a render of our own sea, currently unused) and the intro score. The clip files are unedited;
the page frames them from the top-left and credits them as AI-generated in the footer. Keep
that credit wherever the clips are shown. Check the licence of each photo before this folder is
pushed to a public repository or hosted.
