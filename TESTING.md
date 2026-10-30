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

## Flow
Hello ▶ -> **map** (home) -> ▶ (or tap the glowing stop) -> planned 5–10 min session (due review, the current stop,
practice, mixed review) -> level-up moment if a stop was passed (➜ locked 1.5 s; path draws forward) or all-done -> map.
Grown-up gear on the map: press and hold 2 s.

`python3 tools/play-session.py --q 'progress=3&seed=4'` plays a whole session headless like a child and prints the
plan, screens and logged responses (exit 1 if it never reaches the end).

## URL params (dev)
| param | effect |
|---|---|
| `skipHello=1` | skip the hello / audio-unlock screen (opens the map) |
| `progress=N` | dev: start with N map stops passed (seeded **in-memory** log; real progress untouched) |
| `due=1` | with `progress`: the passed stops' spaced review is due today |
| `levelup=1` | with `progress`: show the level-up moment for the last passed stop |
| `activity=star&word=the` | Star Word screen (meet the word, then 3 scored "find it" rounds) |
| `activity=sentence&sentence=map-mat` | star word in a sentence: tap star chips, slide decodable words, then "Read it all" |
| `parent=1` | open the Grown-ups area directly (in the app: press and hold the map gear for 2 s) |
| `activity=family&rime=ap` | word family: tap-to-place or drag onsets in front of a fixed rime |
| `speakBeforeCheck=1` | old model: Kit says the blended word / reads the sentence before the check (logged `modelled`, never scored) |
| `support=1..4` / `ladder=0` | v2 V2 slider fade-out: force S1 read it, S2 silent dots, S3 you blend, S4 model; `ladder=0` = always S3 (sessions use js/support.js) |
| `activity=story&story=fox` | tiny decodable story (pot / hat / fox / king / lunch; mid-map after their `after` stop): pages read like sentences, picture question at the end |
| `activity=hunt&pool=x,y,zz,qu,sh,ck` | letter game with any GPC ids (digraph tiles; same-sound tiles are never shown together) |
| `level=5&word=sand` | L5 final-blend word (CVCC) |
| `progress=47` | map at the L6 digraph-words stop (56 stops: 38 sounds, L1–L7, 6 new-words stops, 5 stories) |
| `level=6&word=ship` | digraph word: one joined sky "sh" tile, one slider stop per sound |
| `activity=intro&gpc=sh` | digraph fusion intro: s + h slide together into one sky tile |
| `reducedMotion=1` | act as if the device asks for reduced motion (grown-ups setting On/Off still wins) |
| `minutes=5..10` | session length target (default 7) |
| `direct=1` | word screen only (implied by `level=` / `word=`) |
| `cards=0` | no printed word-card check for words without a picture check |
| `floatMode=name` | Floating Letters say names (default: sounds) |
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

`tools/check-scored-audio.py` (v2 V1 acceptance): sweeps a word, a sentence and a story in headless Chrome and fails if the target word or sentence audio plays before the first pick, or if the read is not logged as scored.
