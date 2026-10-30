# Testing Kitphonic

## Run it
```
npm start                 # static server on :8080 (PORT=8099 npm start for another port)
open http://localhost:8080/
```
No build step. Audio comes from `audio/manifest.json`: recorded takes in `audio/takes/` if present, otherwise browser
TTS / tone placeholders (`npm run manifest` rebuilds the manifest after adding takes).

## Automated checks
```
npm test                  # unit tests (node:test, Node 20+): sweep engine, content decodability, mastery, letters, layout math
npm run check:sizes       # headless Chrome touch-target check (needs `pip install playwright`; uses /usr/bin/google-chrome
                          # or CHROME=/path); default --base http://localhost:8099/ (pass --base for :8080)
```
`check:sizes` loads every screen (hello, word L2/L4, picture check, reveal, letter activities) at 360x780, 780x360,
820x1180 (required) plus 390x844, 844x390, 1180x820, and **fails** if any tap target is < 64 px, the slider knob < 80 px,
anything is cut off, key elements overlap, the stage leaves an empty band, or (portrait) the slider is not in the
bottom quarter. Screenshots land in `screenshots/sizes/`.

## URL params (dev)
| param | effect |
|---|---|
| `skipHello=1` | skip the hello / audio-unlock screen |
| `level=1..4` | word level (blend slider markers) |
| `word=map` | put that word first |
| `activity=float\|find\|soundTap\|hunt` | open a letter activity directly |
| `letterMode=name\|sound\|both` | letter tap mode override (default: name-only in Phase 1) |
| `mode=…` | word tile tap mode for all levels |
| `l1=bar`, `l4=blendBar` | held marker variants (defaults: dots) |
| `checkL1=1`, `check=0`, `choices=rhyme\|vowel\|minimal` | picture-check options |
| `case=lower\|upper` | tile case |
| `seed=N` | deterministic shuffles |

## What to test by hand
- Phone portrait & landscape, tablet both ways: nothing cut off, slider reachable with a thumb, no empty bands.
- Slide slowly vs. fling: sounds stretch / stagger; sliding back replays; lifting resets.
- Tap a letter / dot: hear its sound (or name in Phase 1 letter games).
- Picture check: three pictures, one differs by one sound; a quick random tap does not count as correct.
- Device silent switch: the 🔈 button on hello plays a chime and shows the tip.
- `prefers-reduced-motion`: floating letters stand still; no pulses or confetti.
