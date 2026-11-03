# Intro video (v0.1, D-040)

Everything here is ours: the page that draws the video, the narration text, and the music,
composed in code (`compose.py`, no samples). Nothing third-party is copied.

- `page/index.html` — the animation; `render(t)` draws the frame at time *t* (122.1 s, 9 scenes).
  It needs the app's font files in `page/fonts/` (copy from
  `frontend/node_modules/@fontsource/ibm-plex-sans-arabic/files/`, the arabic and latin 400–700 woff2).
- `narration.txt` — one line per scene, in simple Arabic with full vowel marks, read by
  espeak-ng (`-v ar -s 148 -p 42`); the owner chose a computer voice (2026-11-03).
- `compose.py <seconds> <out.wav>` — the backing track (C major, 112 bpm).
- `render.cjs <page url> <out dir> <workers>` — one H.264 file per scene (1920×1080, 30 fps).
- `mix.py <work dir>` — places each line at its scene + 0.7 s and lowers the music under the voice.

Build: voice lines (espeak-ng → ffmpeg loudnorm), `compose.py 122.1`, `render.cjs`, `mix.py`,
then concat the scene files with `-c copy` and add the sound with `-c:v copy`.
