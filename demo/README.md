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

## Bench Pressure pages

`bench-pressure.html` shows the Bench Pressure game from `../bench-pressure/index.html` as a
3D lab: the Microduck robot carries plates between the freezer, design bench, incubators, reader and
journal hatch, with one card per open question and one line saying what the robot is doing and
why. `bench-pressure-2d.html` is the original flat view in the 3σ look.

How it is put together:

- `python demo/tools/wrap_bench_pressure.py` builds both pages. The game's script is copied
  unchanged, so rules, random numbers, the bot and the recorded model runs are the published
  ones. Run it again after the upstream page changes.
- Driving the duck yourself shows an action panel: what the device in front of you does and
  which key does it. `G` turns on Bayes goggles: expected information gain per experiment at
  the design bench, and a marker on the next device a greedy guide would visit (most urgent
  open question, highest-EIG experiment, publish at 80% sure or under 25 s left). The guide is
  a heuristic, not a proven optimum.
- `src/lab3d.js` (bundled to `lab3d.js` by `npm run build`) only reads the game's state each
  frame through `window.__bp`, a read-only accessor the wrapper adds, and draws it. The
  original page keeps running out of sight; its charts open from the "Charts" button.
- Camera: drag to turn, scroll or pinch to zoom, right-drag to pan; buttons for zoom, "Follow
  robot" and "Whole lab".
- Look: image-based lighting, soft shadows, ambient occlusion, a mirror pass on the floor and
  bloom. Ambient occlusion and then resolution are dropped if frames get slow.
- The robot is the Microduck model (`assets/models/microduck.glb`, 4.9 MB, optimised from the
  87 MB source with `gltf-transform optimize --texture-size 1024 --texture-compress webp
  --compress meshopt`). `npm run duck` writes `duck-data.js` so it loads from `file://`.
  Its one 10 s clip is cut into a standing loop and one stride; the game decides where the
  duck is. The model is "Microduck" by william.rodrigo on Sketchfab
  (https://sketchfab.com/3d-models/microduck-1579de821da94e1e819619869cb0093c), CC BY 4.0; the
  credit is on the page's start card and must stay. If `duck-data.js` is missing the page
  falls back to a simple drawn robot. The page wraps the static game, not `bench-pressure/deploy/` (the
  live-partner server).

## Phones

On a phone the Begin screen asks for landscape (with a "Continue upright" way out), and after
the intro a short prompt asks for upright again. Below 900 px the page shows one sea at a time
with a switch ("Your board" / "Watch the agent"), a closer and steeper camera so cells are big
enough to tap, and a lighter render (fewer fog steps, lower pixel ratio).

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
a pulsing synth bass and string figure that build, a low hit on each card cut, a riser, and a final
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

## Putting it online

Everything under `demo/` is static and uses relative paths, so any static host works, also
under a sub-path. `.github/workflows/demo-pages.yml` publishes it to GitHub Pages: set
Settings > Pages > Source to "GitHub Actions" once, then push to `main` (or run the workflow by
hand). The workflow reruns `tools/wrap_bench_pressure.py`, so the lab page follows
`bench-pressure/index.html`; `app.js` and `lab3d.js` are committed bundles and are not rebuilt
there. Pages on a private repository needs a paid GitHub plan; otherwise point Cloudflare
Pages or Netlify at the repo with `demo` as the output folder and no build command.

Before the link goes public: check the photo licences in `assets/`, and keep the AI-generated
note in the footer and the Microduck credit on the lab's start card.
