# 3σ design guide

For the pitch deck. It should look like the same object as the landing page in `demo/index.html`,
so open that first and keep it next to you.

## The idea in one line

Quiet, editorial, lots of empty space. One thought per slide. The only loud thing is the sea.

## The one rule that organises everything

| Mode | Use it for | Background | Text |
|---|---|---|---|
| **Dark** | Before: how science was done, the problem, the hook | `#0B0C0E` | `#F4F2ED` |
| **Light** | Now: what we built, results, the ask | `#F4F2ED` | `#0B0C0E` |
| **Sea** | The demo: Battleship replays and screenshots | full-bleed render | white |

Never mix dark and light on one slide. A switch from dark to light is the "now" moment; use it once.

## The mark

The name is written **3σ**, set the way LaTeX sets `$3\sigma$`: an upright 3 and an italic sigma in
Computer Modern (`demo/assets/tex-main.woff2` and `tex-math.woff2`, the KaTeX fonts; in slides,
"Latin Modern Math" or a pasted LaTeX render). No hyphen, no word "Sigma", nothing else in that
font.

## Colour

| Name | Hex | Where |
|---|---|---|
| Ink | `#0B0C0E` | dark background, text on light |
| Paper | `#F4F2ED` | light background, text on dark |
| Paper 2 | `#EBE8E1` | cards and panels on light |
| Muted text | Ink at 58% | secondary lines on light |
| Hairline | Ink at 12% | dividers, chart axes |
| Signal orange | `#F0591C` | one thing per slide at most: the number or bar that matters |
| Deep sea | `#0C1A22` | frame around sea renders |

Orange means "look here" or "not yet measured". Do not use it for decoration or for body text.
No gradients, no drop shadows, no other colours.

## Type

One family: **Inter** (the variable font is in `demo/assets/inter.woff2`; Google Slides and
Keynote both have Inter).

| Role | Weight | Size on a 1920 × 1080 slide | Tracking | Line height |
|---|---|---|---|---|
| Headline | 400 | 96 to 120 px | -3.5% | 1.03 |
| Big number | 300 | 200 to 280 px | -4% | 1.0 |
| Body | 400 | 34 to 40 px | 0 | 1.45 |
| Label on a chart or panel | 500 | 24 px minimum | 0 | 1.3 |

- Sentence case everywhere. No all caps, no bold headlines, no italics.
- Headlines end with a full stop and break by hand into two or three short lines.
- Nothing smaller than 24 px on a slide. If it does not fit, cut it.
- No numbered tags (01, 02), no pills, no icons, no emoji.

## Layout

- 16:9. Margins: 120 px left and right, 100 px top and bottom.
- Text sits bottom-left on image slides and top-left on text slides. Do not centre, except a
  single question on a black slide.
- Maximum per slide: one headline plus one supporting line, or one number plus one line, or one
  chart plus one line.
- Three things in a row are separated by hairlines, not boxes.
- Corners: 6 px on panels, fully round on buttons. Nothing else is rounded.

## Imagery

- **Before (dark):** the stills in `demo/assets/` (`still1` to `still6`). Full bleed, black and
  white where possible, darkened to 50 to 62% brightness so white text holds. Hard cuts
  between them, no fades or slide transitions.
- **Photos on light slides:** black and white, cropped square, 6 px corners, at natural
  brightness, sitting in the text column beside the headline (as AfterQuery's own site does).
  Never full bleed on a light slide.
- **Now (light):** `dish.mp4`, `sea.jpg` (a render of our own sea), or nothing. White space is fine.
- **Demo:** screenshots or screen recordings of the sea from the landing page. Two panels side
  by side, the agent always on the right. Do not draw a cartoon grid when the sea exists.
- Check the licence of each still before the deck is shared outside the room.
- `tubes.mp4` and `dish.mp4` are AI-generated (Google Gemini). Wherever one appears, credit it
  as AI-generated on the same slide or in the closing credits, as the landing page footer does.

## Charts

- Black bars on Paper, a single orange bar for the one we want read. Hairline axis, no grid
  lines, no legend box: label the bars directly.
- Always show the two anchors: 0 (do nothing) and the reference.
- A result that has not been run is a dashed empty bar labelled "not yet measured". Never an
  estimated bar.
- Scores to two decimals. Use a real minus sign (−), not a hyphen.

## Voice

- Short declarative sentences. Present tense. No adjectives doing the work of evidence.
- Good: "The agent chose good experiments. Then it believed the wrong thing."
- Bad: "Our revolutionary platform unlocks trustworthy AI science."
- Say "proxy" or "not yet measured" plainly wherever it applies.

## Slide map (about 4 minutes, from the pitch plan)

| # | Mode | Slide | On screen |
|---|---|---|---|
| 1 | Dark | Hook | Sea replay: the agent's fog clearing in the wrong place, the reference beside it. No title. |
| 2 | Dark | The question | "Can they choose the experiment? Can they believe the result?" |
| 3 | Light | What we built | "A lab where the right answer is known exactly." Hide, experiment, believe. |
| 4 | Light | The gap | Bar chart: models, reference, humans, same boards, intervals. |
| 5 | Light | Why it is real | Do nothing scores 0. Gambling scores below 0. The leak test catches cheats. "Try to break it." |
| 6 | Sea | Why it is hard | Score split: experiments vs beliefs, from one board. |
| 7 | Light | Trainable | Base, control, RL on Battleship. Then the wet-lab transfer bars. |
| 8 | Dark | Vision | One still, one line: the same grader for any lab whose truth can be simulated. |

Sound: `demo/assets/intro.mp3` (22 s, 120 bpm, pulsing synth bass and strings, a hit on every
cut, soft landing on a piano chord at 19 s) fits slides 1 and 2 if the deck opens with the card
sequence. The music starts 1 s before the first picture, and every card lasts a whole number of
beats (0.5 s). `demo/tools/make_intro_sound.py` regenerates it with different timings.

## Claims to keep off the slides

These come from the pitch plan and the prior-work check. A slide that looks this clean gets read
literally, so the wording matters.

- Not "provably optimal": inference is exact, the experiment choice is one step ahead.
- Not "first Battleship benchmark", "first noisy Battleship" or "first to train on information gain".
- No Battleship model number, human number, training number or transfer number until that run
  exists. Use the dashed bar.
- The agent on the landing page is a proxy (the reference's shots, noise ignored), not a
  language model. Label it wherever a screenshot of it appears.
