"""Synthesises the intro score (assets/intro.mp3). numpy + scipy + ffmpeg.

    python demo/tools/make_intro_sound.py

120 bpm in A minor: a pulsing synth bass and a short string figure, a low hit on every
card cut, a riser over the last card, and a soft landing on a piano chord as the page appears.

The music starts LEAD seconds before the first card. CARD_MS must match the data-ms values of
the intro cards in index.html, and LEAD the INTRO_LEAD constant in src/app.js. Card lengths
are whole beats (0.5 s), so every cut lands on the beat.
"""
import subprocess
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
BEAT = 0.5
LEAD = 1.0
CARD_MS = [2500, 2000, 2000, 2000, 3000, 3500, 3000]
CUTS = LEAD + np.cumsum(CARD_MS) / 1000.0     # in audio time
END = float(CUTS[-1])
TAIL = 3.2
N = int((END + TAIL) * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(3)


def filt(x, kind, hz, order=2):
    return sosfilt(butter(order, hz, kind, fs=SR, output="sos"), x)


def place(buf, sig, at, gain=1.0):
    i = int(at * SR)
    n = min(len(sig), len(buf) - i)
    if i >= 0 and n > 0:
        buf[i:i + n] += sig[:n] * gain


def saw(f, n, det=0.0):
    tt = np.arange(n) / SR
    return 2 * ((f * (1 + det) * tt) % 1.0) - 1


def hit(strength=1.0, dur=2.6):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = 34 + 62 * np.exp(-tt * 9)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 2.4)
    thud = filt(rng.standard_normal(n), "low", 420) * np.exp(-tt * 16) * 0.5
    return strength * (boom + thud)


def piano(f, dur=2.6, vel=1.0):
    """Additive piano: stretched partials that die faster the higher they are, plus a hammer tick."""
    n = int(dur * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 10):
        fk = f * k * np.sqrt(1 + 0.0004 * k * k)
        if fk > 9000:
            break
        out += np.sin(2 * np.pi * fk * tt + 0.3 * k) * np.exp(-tt * (1.1 + 0.75 * k)) / k ** (1.9 - 0.7 * vel)
    out *= 1 - np.exp(-tt * 600)
    tick = filt(rng.standard_normal(n), "band", [1500, 5000]) * np.exp(-tt * 260) * 0.05
    return (out + tick) * vel


def build_at(x):
    return float(np.clip(x / END, 0, 1))


# harmony: two-second bars, Am Am F G, then E under the riser so the last hit resolves to A
R0 = float(CUTS[-2])
BARS = {"Am": (55.0, (220.0, 261.63, 329.63)), "F": (43.65, (220.0, 261.63, 349.23)),
        "G": (49.0, (196.0, 246.94, 293.66)), "E": (41.2, (207.65, 246.94, 329.63))}


def chord(at):
    if at >= R0:
        return BARS["E"]
    return BARS[("Am", "Am", "F", "G")[int(at // (4 * BEAT)) % 4]]


bass = np.zeros(N)
arp = np.zeros(N)
kick = np.zeros(N)
tick = np.zeros(N)
step = BEAT / 4                                   # sixteenth
k = 0
while k * step < END - 0.02:
    at = k * step
    b = build_at(at)
    root, notes = chord(at)
    if k % 2 == 0:                                # eighth-note bass pulse, accent on the beat
        n = int(0.26 * SR)
        tt = np.arange(n) / SR
        note = filt(saw(root, n) + 0.6 * saw(root * 2, n, 0.004), "low", 180 + 1100 * b ** 1.5)
        place(bass, note * np.exp(-tt * 8), at, (0.55 if k % 4 == 0 else 0.36) * (0.75 + 0.25 * b))
    if at >= LEAD:                                # string figure in sixteenths, from the first card
        f = notes[(0, 1, 2, 1, 0, 2, 1, 2)[k % 8]] * (2 if b > 0.6 and k % 8 in (2, 5) else 1)
        n = int(0.14 * SR)
        tt = np.arange(n) / SR
        note = filt(saw(f, n, 0.003) + saw(f, n, -0.004), "low", 1400 + 2600 * b)
        place(arp, note * np.exp(-tt * 20) * (1 - np.exp(-tt * 900)), at,
              0.2 * np.clip((at - LEAD) / 5.0, 0.45, 1) * (1.0 if k % 4 == 0 else 0.7))
    if at >= LEAD and k % 4 == 0:                 # soft kick on every beat
        n = int(0.3 * SR)
        tt = np.arange(n) / SR
        thump = np.sin(2 * np.pi * np.cumsum(45 + 70 * np.exp(-tt * 40)) / SR) * np.exp(-tt * 15)
        place(kick, thump, at, 0.42 + 0.28 * b)
    if at >= 6.0:                                 # quiet ticking, louder off the beat
        n = int(0.05 * SR)
        tt = np.arange(n) / SR
        place(tick, filt(rng.standard_normal(n), "high", 6500) * np.exp(-tt * 110), at,
              (0.05 if k % 2 == 0 else 0.1) * b)
    k += 1

build = np.clip(t / END, 0, 1)
alive = (t < END).astype(float)

pad = np.zeros(N)                                 # sustained chord tones under the figure
for bar in range(int(END // (4 * BEAT)) + 1):
    at = bar * 4 * BEAT
    _, notes = chord(at + 0.01)
    n = int((4 * BEAT + 0.6) * SR)
    tt = np.arange(n) / SR
    env = np.minimum(tt / 0.5, 1) * np.minimum((tt[-1] - tt) / 0.6, 1)
    tone = sum(np.sin(2 * np.pi * (f + d) * tt + rng.random() * 6.28)
               for f in notes for d in (-0.5, 0.6))
    place(pad, tone * env, at, 0.03 * (0.7 + 0.3 * build_at(at)))

riser = np.zeros(N)                               # noise swept upward over the last card
seg = (t >= R0) & (t < END)
x = (t[seg] - R0) / (END - R0)
noise = rng.standard_normal(seg.sum())
swept = np.zeros(seg.sum())
edges = np.linspace(0, 1, 9)
for a, b in zip(edges[:-1], edges[1:]):
    m = (x >= a) & (x <= b)
    c = 300 * (9000 / 300) ** ((a + b) / 2)
    swept[m] = filt(noise, "band", [c * 0.7, min(c * 1.4, 18000)])[m]
tone = np.sin(2 * np.pi * np.cumsum(165 * (4.0 ** x)) / SR)
riser[seg] = (swept * 0.26 + tone * 0.08) * x ** 2.4

hits = np.zeros(N)
place(hits, hit(0.95), 0.0)                       # the music opens on a hit, before any picture
for i, c in enumerate([LEAD, *CUTS[:-1]]):
    place(hits, hit(0.42 + 0.06 * i), c)

body = (bass * 0.6 + arp + kick * 0.7 + tick + pad + riser) * alive
d0, d1 = int((END - 0.03) * SR), int(END * SR)    # a breath of silence before the last hit
body[d0:d1] *= np.linspace(1, 0, d1 - d0)

final = np.zeros(N)                               # landing: a warm low hit under an A minor piano chord
place(final, hit(0.7, 3.0), END)
for f, g in ((110.0, 0.9), (220.0, 0.8), (261.63, 0.6), (329.63, 0.6), (440.0, 0.5), (659.26, 0.3)):
    place(final, piano(f, TAIL, 0.75), END, 0.5 * g)

dry = body + hits + final
out = []
for ch in range(2):                               # short hall, a different impulse per channel
    n = int(1.8 * SR)
    ir = filt(rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.6), "low", 5200)
    wet = fftconvolve(dry, ir)[:N]
    out.append(dry / (np.max(np.abs(dry)) + 1e-9) * 0.82 + wet / (np.max(np.abs(wet)) + 1e-9) * 0.3)
mix = np.stack(out, 1)
mix[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))[:, None]
mix[-int(0.8 * SR):] *= np.linspace(1, 0, int(0.8 * SR))[:, None]
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
mix *= 0.89 / np.max(np.abs(mix))

dst = Path(__file__).resolve().parents[1] / "assets" / "intro.mp3"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-",
                "-c:a", "libmp3lame", "-b:a", "160k", str(dst)],
               input=(mix * 32767).astype("<i2").tobytes(), check=True)
print(f"wrote {dst} ({dst.stat().st_size / 1e3:.0f} kB, {N / SR:.1f} s; first card at {LEAD:.1f} s, "
      f"page appears at {END:.1f} s)")
