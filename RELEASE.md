# Kitphonic 1.0.0-rc1 — release readiness

Version: `1.0.0-rc1` (`VERSION`, `js/version.js`, shown in the grown-ups footer). Local-only static web app (vanilla ES
modules, no network calls, progress in `localStorage`). Spec: *Phonics Reader App — Combined Spec v1.0*, §3.
Reviews folded in: literacy review v1 (R1–R11) and v2 (V1–V10), Uiux r1–r8.

**Gate status at rc1:** `npm test` 150/150 · `tools/check-sizes.py` all scenes at 6 phone / tablet viewports
(child targets ≥ 64 px, knob ≥ 80, grown-ups ≥ 44, no overlaps, no blank buttons) · `tools/check-scored-audio.py`
7/7 (no target audio before a scored pick; S1/S2/S4 behave) · `tools/play-session.py` end-to-end sessions.

> ⚠️ **Do not playtest with children on this build's audio.** `audio/takes/` holds **0 recorded clips**; every sound,
> word and line is a browser text-to-speech placeholder (v2 V3). Clipped / held phonemes (spec §3.2) cannot be judged
> until a voice is recorded (`npm run manifest` lists all 826 clips).
>
> ⚠️ **Pictures are placeholder emoji** (plus 3 drawn SVGs: mat, cat, hat). They must pass the v2 V6 rule (≥ 80 % of
> 5+ children in the target region name each picture with its target word, unprompted) before release.

## Content at rc1
38 sounds in 8 sets (m s a t · p i n · o d f · c k u · g e r h b l · ck ff ll ss s=/z/ · j v x y w z zz qu ·
sh ch th th ng nk) · 56 map stops (38 sounds, 7 word levels L1–L7, 6 "new words" stops, 5 stories) · 253 words
(61 pictured) · 14 star words · 30 picture-checked sentences · 5 decodable stories (from stop 19) · tracing paths
for every grapheme.

## Done vs spec §3

| Spec | Requirement | Status |
|---|---|---|
| 3.1 | Playable touch-first loop: names, sounds, decoding with the Blend Slider + hidden-picture reward | ✅ |
| 3.2 | Letter = name / dot = sound (switch after L1 mastery) | ✅ per-child switch + one-time demo; floating letters setting in grown-ups |
| 3.2 | Clipped vs held sounds | ⚠️ modelled in data (`heldTts`, stretch on slow sweeps); real recordings missing |
| 3.2 | No failure states | ✅ no X / buzzer / timer; wrong pick → "Let's slide it again", replay, reshuffle |
| 3.2 | Picture = reward, not hint | ✅ picture hidden until after the pick; v2 V1: the target word is never spoken before a scored pick |
| 3.2 | Audio first | ✅ every prompt spoken; letters, dots, bars, buttons tappable (sentence words: only the current one) |
| 3.3.1 | Stretchy letters first; b/d (and look-alikes) apart | ✅ m s a t first; b 3 sets after d; confusable pairs gapped (v/w gap 3) |
| 3.3.1 | Uppercase first, lowercase within each set | ❌ lowercase-first (held decision: tile case) |
| 3.3.2 | Floating Letters, Find the Letter | ✅ (float, find, soundTap, hunt) |
| 3.3.2 | Match Up (upper ↔ lower drag) | ❌ not built |
| 3.3.3 | Floating speed, ~80 pt tap radius, pause on tap, 3–6 letters | ✅ |
| 3.4.1 | Dot with sound-wave icon, different colour | ✅ (rime bar carries the same icon, r8) |
| 3.4.2 | Sound Tap, Sound Hunt | ✅ |
| 3.4.2 | First Sound, Name or Sound? | ❌ not built (letter intro shows start-sound pictures instead) |
| 3.4.3 | Blending unlocks after 4–6 sounds incl. a vowel | ✅ 4 secure incl. a vowel |
| 3.5.1–2 | Word screen layout; sweep + 2–3 picture check; reveal + mascot says the word | ✅ printed word cards when a word has no good picture |
| 3.5.3 | Dots + bars, lights, speed-aware, drift 60 pt, lift pauses, backward replays, unlimited replays | ✅ |
| 3.5.3 | Onset + rime early, all phonemes later, each blend consonant its own dot | ✅ L2 onset + rime (held), L3+ all phonemes |
| 3.5.3+ | Slider support fades with mastery (v2 V2 ladder S4 → S1) | ✅ per child, per pattern; `?support=`, `?ladder=0` |
| 3.6 | Star words: shown, spoken, sentence, find among cards, tricky part marked, 1–2 per level, spaced review | ✅ 14 words (list held) |
| 3.6 | Digraphs deferred past prototype | ➕ built (sh ch th th ng nk, ck ff ll ss zz qu) |
| 3.7 | Level ladder L1–L5 | ✅ plus L6 digraph words, L7 -s suffix; levels only use secure sounds |
| 3.7.1 | Mastery ≈ 90 % across 2 sessions on different days; spaced review 1/3/7/14(/30) days | ✅ |
| 3.7.1 | Adaptive pacing (< 60 % two sessions → step back) | ⚠️ pacing computed (`core.pacing`) but the planner does not act on it; the slider ladder steps support back up on misses |
| 3.7.1 | Error patterns tracked → extra practice | ⚠️ tracked (contrast position, letter picks) and shown to grown-ups; no targeted minimal-pair sessions yet (v2 V2 rule 5) |
| 3.8.1 | Targets ≥ 64 pt, tap / drag only, landscape + portrait | ✅ automated at 6 viewports; ~100 ms audio latency not instrumented |
| 3.8.2 | Calm mascot; 5–10 min sessions with "all done"; quiet rewards (stickers); speech recognition optional / off | ✅ (speech recognition not built — out of scope) |
| 3.8.3 | Kid font (single-storey a/g), warm palette, subtle animation, reduced motion, shape-coded markers, captions, audio speed | ✅ Andika; captions on taps + speech bubbles |
| 3.8.4 | Parent view: sounds, star words, words read, current level, trouble spots, settings, parental gate, no ads / links | ✅ press-and-hold gate; trouble spots + letter mode (rc1); words read alone vs with Kit |
| 3.8.4 | Letter names known; recent sessions list | ⚠️ sessions/minutes this week only; letter names not shown separately |
| 3.9 | Local saves only | ✅ no network, no accounts |

## Known issues
1. **Placeholder audio** (above) — blocks child playtests (V3).
2. **Placeholder emoji art** — 192 of 253 words have no picture (they get printed word cards). Sentence scenes show two
   pictures side by side, so "in" vs "on" is not depicted; some stand-ins are weak (🟤 mud, 👑 the king, 🧺 lunch).
3. Picture-naming validation (≥ 80 % rule) not run.
4. Adaptive pacing "step back" and error-pattern practice not wired into the planner (see 3.7.1).
5. Not built: Match Up, First Sound, Name or Sound?, uppercase letters, story re-reads (V9 rule 5), S1 "at a glance" per
   word (V2), story validator rules on star-word ratio / recycling / new-GPC-per-page (V9 rules 2, 5, 6).
6. Word pools: L1 (at, am) and L2 (6 CVC) open with only 4–5 letters known; every later words stop has ≥ 12 words
   (tested). ≥ 5 pictured words per stop is not met at L6 (4) and L7 (0, plurals).
7. Sentence words at S1 auto-advance after ~1 s (no tap needed); digraph tracing is the two letters side by side.
8. Progress lives in this browser's storage only; clearing site data erases it (by design, spec §3.9).

## Held user decisions (configurable, current defaults)
| Decision | Default | Switch |
|---|---|---|
| Accent UK / US (z = "zee"; o in no/go; a in was; BATH / cot–caught vowels; tap/tin/bin/chip/vest/jam vocabulary) | US "zee"; accent-dependent words flagged ⚠️ in `js/content.js` | data |
| L2 blend style (and L1 / L4 marker style) | L2 onset + rime (s + at), L1 and L4 all dots | L2: fixed in `markersFor` (`js/core.js`); `?l1=bar`, `?l4=blendBar` |
| Letter taps per level | sound at L1, name + dot from L2 | `?mode=` (`tapMode`) |
| Tile / print case (capitals, names like Kit) | lowercase | `?case=upper` |
| Star-word list | I the is to no into a he go of she you we was | `js/content.js` |
| Picture check at L1 | off (printed word cards instead) | `?checkL1=1`, `?cards=0` |
| Voice (recorded actor vs synthesized; accents) | placeholder TTS | `audio/takes/` |
| Phase 1 / 2 overlap — floating letters say | sounds | grown-ups setting |
| Speak the word before the check (old model) | off (scored reads) | `?speakBeforeCheck=1` |
| Slider fade-out ladder | on | `?ladder=0`, `?support=1..4` |

## Release steps after rc1
Record the voice (all clips in `audio/manifest.json`), replace emoji with drawn art and run the naming test, playtest
8–12 children (spec §3.9) and tune thresholds (`RULES`, `SUPPORT_RULES`), then tag 1.0.0.
