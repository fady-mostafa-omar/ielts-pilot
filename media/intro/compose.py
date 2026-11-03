"""An original, cheerful backing track for the intro video (no samples, no third-party
material): I–V–vi–IV in C major at 112 bpm, plucked arpeggios, a marimba motif, bass,
soft drums and a pad. Written from scratch here, so it carries no outside rights."""
import sys
import numpy as np
from scipy.signal import butter, fftconvolve, lfilter

SR = 44100
LENGTH = float(sys.argv[1]) if len(sys.argv) > 1 else 122.0
OUT = sys.argv[2] if len(sys.argv) > 2 else "music.wav"
BPM = 112
BEAT = 60 / BPM
BAR = 4 * BEAT
INTRO = 5.0  # the logo scene: pad and bells only
rng = np.random.default_rng(7)

N = int(SR * (LENGTH + 3))
L = np.zeros(N)
R = np.zeros(N)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i:i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def pluck(freq, dur=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for k in range(1, 9):
        s += np.sin(2 * np.pi * freq * k * t) * (0.9 ** k) / k * np.exp(-t * (3 + 2.2 * k))
    return s * env(n, 0.002, 0.5)


def marimba(freq, dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * t) * np.exp(-t * 4.5)
         + 0.35 * np.sin(2 * np.pi * freq * 3.93 * t) * np.exp(-t * 14)
         + 0.12 * np.sin(2 * np.pi * freq * 9.2 * t) * np.exp(-t * 30))
    return s * env(n, 0.003, 10)


def bell(freq, dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t * d)
            for r, a, d in ((1, 1, 1.6), (2.76, 0.45, 3.2), (5.4, 0.25, 6), (8.93, 0.12, 9)))
    return s * env(n, 0.002, 10)


def bass(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t)
    e = np.clip(t / 0.005, 0, 1) * np.exp(-t * 2.2) * np.clip((dur - t) / 0.03, 0, 1)
    return s * e


def pad(freqs, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.12):
            ff = f * 2 ** (det / 12)
            for k in range(1, 7):
                s += np.sin(2 * np.pi * ff * k * t + rng.uniform(0, 6.28)) / k
    b, a = butter(2, 1800 / (SR / 2))
    s = lfilter(b, a, s)
    e = np.clip(t / 0.6, 0, 1) * np.clip((dur - t) / 0.6, 0, 1)
    return s * e / (len(freqs) * 4)


def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 80 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9)


def clap():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    b, a = butter(2, [900 / (SR / 2), 4000 / (SR / 2)], btype="band")
    noise = lfilter(b, a, noise)
    e = np.zeros(n)
    for off in (0, 0.011, 0.022):
        e += np.where(t >= off, np.exp(-(t - off) * 60), 0) * 0.5
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) * 18), 0)
    return noise * e * 0.6


def shaker():
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    b, a = butter(2, 6000 / (SR / 2), btype="high")
    return lfilter(b, a, noise) * np.exp(-t * 70) * 0.5


# I–V–vi–IV in C: chord tones (MIDI) and bass roots
CHORDS = [([60, 64, 67], 48), ([59, 62, 67], 43), ([60, 64, 69], 45), ([60, 65, 69], 41)]
MOTIF = [  # (beat offset in a 2-bar phrase, MIDI note, length in beats)
    (0, 76, 1), (1, 79, 1), (2, 81, 0.5), (2.5, 79, 0.5), (3, 76, 1),
    (4, 74, 1), (5, 76, 0.5), (5.5, 79, 0.5), (6, 72, 2),
]
KICK, CLAP, SHAK = kick(), clap(), shaker()

# intro: a pad, a bell arpeggio going up, a chime when the dot lands (1.9 s)
add(pad([midi(n) for n in (48, 55, 60, 64)], INTRO + 0.8), 0, 0.5)
for i, n in enumerate((72, 76, 79, 84)):
    add(bell(midi(n), 2.2), 0.35 + i * 0.32, 0.16, pan=-0.3 + 0.2 * i)
add(bell(midi(91), 3.0), 1.9, 0.22, pan=0.2)

end = LENGTH - 2.5
t0 = INTRO
bar = 0
while t0 + BAR <= end + 0.01:
    chord, root = CHORDS[bar % 4]
    add(pad([midi(n) for n in chord], BAR + 0.3), t0, 0.35)
    for b in range(4):
        tb = t0 + b * BEAT
        add(bass(midi(root if b % 2 == 0 else root + 7), BEAT * 0.9), tb, 0.55)
        if b in (0, 2):
            add(KICK, tb, 0.55)
        if b in (1, 3):
            add(CLAP, tb, 0.28, pan=0.1)
        for h in range(2):
            add(SHAK, tb + h * BEAT / 2, 0.10 if h else 0.06, pan=0.4)
    arp = chord + [chord[1] + 12]
    for e in range(8):
        add(pluck(midi(arp[e % 4] + 12), 0.6), t0 + e * BEAT / 2, 0.13, pan=-0.35)
    if bar % 2 == 0 and bar >= 2:  # the marimba motif from the third bar on
        for off, note, ln in MOTIF:
            add(marimba(midi(note), ln * BEAT + 0.4), t0 + off * BEAT, 0.20, pan=0.3)
    t0 += BAR
    bar += 1

# ending: a C chord with bells
for n in (48, 60, 64, 67, 72):
    add(pluck(midi(n), 2.5), t0, 0.16)
add(pad([midi(n) for n in (48, 55, 60, 64)], 3.0), t0, 0.5)
add(bell(midi(84), 3.0), t0, 0.2)

# a light room: exponentially decaying noise as the impulse response
ir_n = int(1.3 * SR)
irt = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-irt * 4.2)
irR = rng.standard_normal(ir_n) * np.exp(-irt * 4.2)
wetL = fftconvolve(L, irL)[:N]
wetR = fftconvolve(R, irR)[:N]
L = L + 0.10 * wetL / np.max(np.abs(wetL)) * np.max(np.abs(L))
R = R + 0.10 * wetR / np.max(np.abs(wetR)) * np.max(np.abs(R))

n_out = int(LENGTH * SR)
st = np.stack([L[:n_out], R[:n_out]], axis=1)
fade = int(2.0 * SR)
st[-fade:] *= np.linspace(1, 0, fade)[:, None]
st[: int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))[:, None]
st /= np.max(np.abs(st)) / 0.89
pcm = (st * 32767).astype(np.int16)
import wave
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", OUT, LENGTH, "s")
