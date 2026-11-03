"""Places each narration line at its scene (start + 0.7 s), lowers the music under the voice,
and writes the final stereo track."""
import json, wave, sys
import numpy as np
from scipy.signal import resample_poly

V = sys.argv[1]
SR = 44100
TOTAL = 122.1
STARTS = {"s2": 5, "s3": 20, "s4": 37, "s5": 53, "s6": 69, "s7": 85.5, "s8": 101.1, "s9": 112.1}

def read(path):
    with wave.open(path) as w:
        n, ch, sr = w.getnframes(), w.getnchannels(), w.getframerate()
        a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64) / 32768
    a = a.reshape(-1, ch)
    if sr != SR:
        a = resample_poly(a, SR, sr, axis=0)
    return a

music = read(f"{V}/music/music.wav")
N = int(TOTAL * SR)
music = music[:N]
voice = np.zeros(N)
for sid, st in STARTS.items():
    v = read(f"{V}/voice/{sid}.wav")[:, 0]
    i = int((st + 0.7) * SR)
    v = v[: N - i]
    voice[i:i + len(v)] += v
# the voice's envelope (20 ms windows, smoothed) lowers the music by up to ~10 dB
win = int(0.02 * SR)
env = np.sqrt(np.convolve(voice ** 2, np.ones(win) / win, mode="same"))
env = np.clip(env / (np.percentile(env[env > 1e-4], 60) + 1e-9), 0, 1)
k = int(0.25 * SR)
env = np.convolve(env, np.hanning(k) / np.hanning(k).sum(), mode="same")
gain = 1 - 0.68 * np.clip(env * 1.6, 0, 1)
mix = music * (0.55 * gain)[:, None] + voice[:, None] * 0.95
mix /= max(1.0, np.max(np.abs(mix)) / 0.95)
with wave.open(f"{V}/out/mix.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("mixed", mix.shape[0] / SR, "s")
