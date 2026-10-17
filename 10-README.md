# Shinobi — hand sign recognition

A live Naruto-style jutsu cam for the browser. Do the hand seals at your webcam,
chain them into a jutsu sequence, and the effect fires on screen with sound.

**Live demo:** hosted on GitHub Pages (link in the repo About section).

## Run it

Any static host works (camera requires HTTPS or `localhost`):

```bash
python -m http.server 8000
# open http://localhost:8000 and click "Start Shinobi Cam"
```

Everything is local: the hand/face models and runtime are vendored
(``, ``). No CDN, no API keys, no build step.

## The jutsu list (all in `jutsu.js`, extend by adding an entry)

| Jutsu | Seals | Effect |
|---|---|---|
| Rasengan | hold **Open Palm** up | spinning chakra sphere on your palm |
| Shadow Clone | Ram → Serpent → Tiger | smoke + a squad of clones |
| Chidori | Ox → Hare → Monkey | lightning on your hand |
| Fireball | Serpent → Ram → Monkey → Boar → Horse → Tiger, then **blow** | fire stream (mic blow detection) |
| Summoning | Boar → Dog → Bird → Monkey → Ram, then **slap hands down** | smoke + summoning circle |
| Sharingan | Dragon | red eyes + genjutsu vignette |
| Kamui | Bird → Tiger | space-time swirl (WebGL shader) |
| Susano'o | Serpent → Ox → Ram | spectral warrior aura |
| Reaper Death Seal | Serpent → Boar → Ram | seal-script ring + specter |

The 12 zodiac seals + Open Palm + Fist are recognized by a geometric classifier
over MediaPipe's 21 hand landmarks (`seals.js`). Two-handed canon seals are
scored as practical webcam approximations — clasped hands are the hardest for the
tracker, so hold each seal about half a second, hands inside the frame.

## Testing / dev

- `node test_synth.mjs` — 15 synthetic poses verify classifier selectivity.
- `node test_reel.mjs` — runs the classifier over landmarks extracted from the reference reel.
- `?source=video` — run the full pipeline on a video file instead of the webcam.

## Sound & art

- All SFX are synthesized live with the Web Audio API (`sfx.js`). No audio files.
- The specter art (`specter.png`) is original AI-generated art made for this
  project. No anime stills, sprites, or audio were copied. Jutsu/seal names are
  used as descriptive terms; this is a fan project, not affiliated with the
  Naruto rights holders.

## Stack

Vanilla JS (ES modules) + MediaPipe Tasks Vision (HandLandmarker, FaceLandmarker,
vendored WASM) + Canvas 2D + a small WebGL shader for the Kamui swirl.
