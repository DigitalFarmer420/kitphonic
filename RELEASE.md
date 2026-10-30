# Kitphonic 1.0.0-rc5 — release readiness

Version: `1.0.0-rc5` (`VERSION`, `js/version.js`, shown in the grown-ups footer). Local-only static web app (vanilla ES
modules, no network calls, progress in `localStorage`). Spec: *Phonics Reader App — Combined Spec v1.0*, §3.
Reviews folded in: literacy review v1 (R1–R11) and v2 (V1–V10), Uiux r1–r8 and rc1.

**Gate status at rc5:** `npm test` 172/172 (rc4: 168) · `tools/check-sizes.py` 300/300 at rc3 (50 scenes × 6 phone / tablet viewports; ~14 min; rc4 and rc5 change no layout — rc5 only adds Kit's nod animation)
(child targets ≥ 64 px, knob ≥ 80, grown-ups ≥ 44, no overlaps, no blank buttons) · `tools/check-scored-audio.py`
10/10 (no target audio before a scored pick; S1/S2/S4 behave; a whole-word marker before the pick = help, unscored;
re-reads logged separately) · `tools/play-session.py --audio` end-to-end sessions with real takes, **0 overlapping sounds** (rc5).

> ✅ **Recorded voice (rc3).** `audio/takes/` holds **828 recorded takes** (xAI TTS, voice *Eve*, speed 1.0, the
> owner's **upbeat** style) for every spoken clip in `audio/manifest.json`; the 2 SFX stay synthesized. All takes are
> trimmed, loudness-normalized (−16 LUFS; voiceless fricatives s ss f ff th sh h at −19), mono 24 kHz 48 kbps MP3
> (5.8 MB total). Phonemes were re-cut to spec §3.2 / literacy review §5.5 + R15 (no schwa, stops clipped, held
> ≈ 1.1 s) — see *Audio QA* below. A grown-up must still **listen to the flagged phonemes** before a child playtest.
>
> ⚠️ **Pictures are placeholder emoji** (plus 3 drawn SVGs: mat, cat, hat). They must pass the v2 V6 rule (≥ 80 % of
> 5+ children in the target region name each picture with its target word, unprompted) before release.

## Content at rc3 (unchanged from rc2)
38 sounds in 8 sets (m s a t · p i n · o d f · c k u · g e r h b l · ck ff ll ss s=/z/ · j v x y w z zz qu ·
sh ch th th ng nk) · 56 map stops (38 sounds, 7 word levels L1–L7, 6 "new words" stops, 5 stories) · 254 words
(72 pictured; ≥ 5 at every words stop from L3) · 14 star words · 30 picture-checked sentences · 5 decodable stories (from stop 19) · tracing paths
for every grapheme.

## Done vs spec §3

| Spec | Requirement | Status |
|---|---|---|
| 3.1 | Playable touch-first loop: names, sounds, decoding with the Blend Slider + hidden-picture reward | ✅ |
| 3.2 | Letter = name / dot = sound (switch after L1 mastery) | ✅ per-child switch + one-time demo; floating letters setting in grown-ups |
| 3.2 | Clipped vs held sounds | ✅ rc3 recorded takes: stops are burst-only (0.1–0.2 s), continuants 0.45 s, held 1.0–1.15 s (tested); a few need a human ear (Audio QA) |
| 3.2 | No failure states | ✅ no X / buzzer / timer; wrong pick → "Let's slide it again", replay, reshuffle |
| 3.2 | Picture = reward, not hint | ✅ picture hidden until after the pick; v2 V1: the target word is never spoken before a scored pick |
| 3.2 | Audio first | ✅ every prompt spoken; letters, dots, bars, buttons tappable (sentence words: only the current one) |
| 3.3.1 | Stretchy letters first; b/d (and look-alikes) apart | ✅ m s a t first; b 3 sets after d; confusable pairs gapped (v/w gap 3) |
| 3.3.1 | Uppercase first, lowercase within each set | ❌ lowercase-first (held decision: tile case) |
| 3.3.2 | Floating Letters, Find the Letter | ✅ (float, find, soundTap, hunt) |
| 3.3.2 | Match Up (upper ↔ lower drag) | ❌ not built |
| 3.3.3 | Floating speed, ~80 pt tap radius, pause on tap, 3–6 letters | ✅ |
| 3.4.1 | Dot with sound icon, different colour | ✅ dot = speaker (one sound), bar = speaker + word shape (a chunk) — Uiux rc1 |
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
| 3.7.1 | Adaptive pacing (< 60 % two sessions → step back) | ✅ rc2: words → the last easier passed level with S3+ support and the hand demo; sounds → explore + 3-tile hunt, hint after 1 miss; 60–89 % = more practice on the same skill; no message to the child |
| 3.7.1 | Error patterns tracked → extra practice | ✅ rc2 (`js/patterns.js`, 14 days): a letter mix-up (≥ 2) → a hunt with both letters on screen; a contrast position (≥ 3: short vowels / last / first sound) → a words round whose checks lead with that contrast; also shown to grown-ups |
| 3.8.1 | Targets ≥ 64 pt, tap / drag only, landscape + portrait | ✅ automated at 6 viewports; ~100 ms audio latency not instrumented |
| 3.8.2 | Calm mascot; 5–10 min sessions with "all done"; quiet rewards (stickers); speech recognition optional / off | ✅ (speech recognition not built — out of scope) |
| 3.8.3 | Kid font (single-storey a/g), warm palette, subtle animation, reduced motion, shape-coded markers, captions, audio speed | ✅ Andika; captions on taps + speech bubbles |
| 3.8.4 | Parent view: sounds, star words, words read, current level, trouble spots, settings, parental gate, no ads / links | ✅ press-and-hold gate; trouble spots + letter mode (rc1); words read alone vs with Kit |
| 3.8.4 | Letter names known; recent sessions list | ⚠️ sessions/minutes this week only; letter names not shown separately |
| 3.9 | Local saves only | ✅ no network, no accounts |

## Known issues
1. ~~**Placeholder audio**~~ — **resolved in rc3** (828 recorded takes). Remaining audio caveats: see *Audio QA*.
2. **Placeholder emoji art** — 182 of 254 words have no picture (they get printed word cards). Sentence scenes show two
   pictures side by side, so "in" vs "on" is not depicted; some stand-ins are weak (🟤 mud, 👑 the king, 🧺 lunch). New in
   rc2 and to be checked in the naming test: plurals as two of a picture (two cats look small at 360 px because the
   drawn cat has padding), 🤫 hush, 😢 sad, 😠 mad.
3. Picture-naming validation (≥ 80 % rule) not run.
4. Not built: Match Up, First Sound, Name or Sound?, uppercase letters, S1 "at a glance" per word (V2), story validator
   rules on star-word ratio / recycling / new-GPC-per-page (V9 rules 2, 5, 6).
5. Word pools: L1 (at, am) and L2 (6 CVC, 2 pictured) open with only 4–5 letters known; every later words stop has
   ≥ 12 words and ≥ 5 pictured words (both tested).
6. Digraph tracing is the two letters side by side.
7. Pacing thresholds (step back < 60 % over two sessions, patterns ≥ 2 mix-ups / ≥ 3 contrast misses in 14 days) are
   starting values to tune in the playtest; a step-back round's own responses still count toward mastery.
8. Progress lives in this browser's storage only; clearing site data erases it (by design, spec §3.9).

Fixed in rc2: adaptive step-back and error-pattern practice in the planner (was 4); S1 sentence words wait for the
child's tap on a big arrow instead of auto-advancing after ~1 s (was 7); ≥ 5 pictured words at L6 and L7 (was 6);
story re-reads — the session after a story offers one re-read, scored separately as `reread:<id>` (V9 rule 5);
Uiux rc1 — distinct dot / bar icons, family letters in balanced centred rows (7 → 4 + 3), the tray steps aside when
a family is done, family choices capped (`familyMax`, default 4, `?familyMax=`), grown-ups sound tiles never shrink.

## Held user decisions (configurable, current defaults)
| Decision | Default | Switch |
|---|---|---|
| Accent UK / US (z = "zee"; o in no/go; a in was; BATH / cot–caught vowels; tap/tin/bin/chip/vest/jam vocabulary) | US "zee"; accent-dependent words flagged ⚠️ in `js/content.js` | data |
| L2 blend style (and L1 / L4 marker style) | L2 onset + rime (s + at), L1 and L4 all dots | L2: fixed in `markersFor` (`js/core.js`); `?l1=bar`, `?l4=blendBar` |
| Letter taps per level | sound at L1, name + dot from L2 | `?mode=` (`tapMode`) |
| Tile / print case (capitals, names like Kit) | lowercase | `?case=upper` |
| Star-word list | I the is to no into a he go of she you we was | `js/content.js` |
| Picture check at L1 | off (printed word cards instead) | `?checkL1=1`, `?cards=0` |
| Voice (recorded actor vs synthesized; accents) | xAI TTS *Eve*, US, upbeat (rc3) | `audio/takes/`, `tools/gen-tts.mjs` |
| "Let's slide it again" take | upbeat ("Ooh, so close! Let's slide it again!") — owner's pick, rc3 | `?voice=calm` |
| Phase 1 / 2 overlap — floating letters say | sounds | grown-ups setting |
| Speak the word before the check (old model) | off (scored reads) | `?speakBeforeCheck=1` |
| Slider fade-out ladder | on | `?ladder=0`, `?support=1..4` |

## Fixed in rc5 (owner + Uiux: overlapping sounds)
Owner: "on a correct tap play just the one b-bing chime… remove the 'yes' praise voice. One sound is enough." Uiux
measured ~50 ms of overlap between the chime / praise and the next prompt.

**Audit (rc4, before).** Letters Find It / Sound Hunt: chime + a spoken "Yes!" (hunt: the letter sound, then "Yes!")
started together, and the next prompt was on a 900 / 1200 ms timer, so it ran into them. Word check: chime, then the
reveal line at 650 ms (over the chime); no-picture cards chimed twice. Star word: chime, next round on a 1100 ms timer.
Sentence: chime + bubble "Yes!" (no voice), karaoke at 500 ms. Story: chime + bubble "Yes! The end.". Family: sound →
rime → word, chime, next prompt on a 1300 ms timer; "family done" praise and the chant overlapped. Trace: chime +
letter sound at 300 ms (overlap). Map level-up: chime + "Level up!" at 500 ms (overlap). Every screen chained clips with
its own `then()` chain that `audio.stop()` could not cancel, so rapid taps stacked voices.

**Now.**
1. **One voice at a time, app-wide** (`js/audio.js`). Every clip goes through one serial queue; the next sound waits
   for the previous one to end + 250 ms (`gapMs` overrides it: 0 for slider phonemes, 300 after a trace chime).
   `audio.say([...])` schedules a phrase gaplessly on the audio clock (edge silence skipped, 25 ms lookahead), so
   "Find… t" is one phrase with no gap and no overlap. `audio.stop()` (a new tap) cuts Kit off and drops the queue.
   Rapid taps can't stack (screens ignore taps while a round is resolving; any new tap stops the old audio first).
2. **Correct tap = the chime only** (`js/feedback.js`: `CORRECT = ['sfx-chime']`). The green glow + a new **Kit nod**
   carry the praise. Then ~400 ms of quiet (`CHIME_QUIET_MS`), then the next prompt as one phrase. Spec: §3.8.3
   ("short warm chime"), Find It "celebration sound and sparkle"; no spoken "Yes!" and no echo of the letter after a
   correct letter pick.
3. **Kept, but sequenced (spec-required).** The §3.5.2 reveal word (word check: chime → word, one chime only); the v2 S3
   word after the check; the v2 V1 sentence read after the picture pick; the §3.3 L1 trace sound (chime → 300 ms → sound);
   the family "made word". Each now waits in the queue — none overlaps.
4. **Spoken praise only at milestones, varied:** the end of a scored letters round and a map level-up use
   `nextPraise()`, which never repeats the last line (sentence / story ends keep the chime + a "Yes!" bubble, no voice;
   the sentence read-back is the reward). The variety is drawn from the existing takes (`m-yes`, `m-level-up`,
   `m-you-read-it`); more lines would need new recordings.
5. **Wrong tap unchanged:** Kit names what was tapped ("That's… b"), no sfx.
6. **Sentence nudge in the gap (Uiux).** A locked-word tap between words (old word done, next not yet current) now
   nudges the *upcoming* word instead of nothing / the finished one. While a sound plays, the bounce shows without the
   tap sfx (one sound at a time).

**Evidence.** `tests/audio-queue.test.mjs` (fake AudioContext, exact audio-clock intervals): chime → ≥ 240 ms → prompt,
a gapless "Find… t" joint, stop + rapid replays never stacking, and a 60-step seeded random session with peak
concurrency 1. Headless Chrome with the real takes: a letters round (wrong tap, correct tap, 3 rapid taps, correct tap)
shows 0 overlaps > 5 ms; `tools/play-session.py --audio` sessions (letters, lesson + trace, family, star, word,
level-up, sentence, story) report **0 overlapping sounds**.

## Fixed in rc4 (Uiux rc3 audio review)
- **Hello latency (medium):** Kit's hello, both SFX and the first lesson prompt (`EARLY_CLIPS` in `js/audio.js`,
  ~45 KB) plus the manifest are fetched as raw bytes at page load (`<link rel=preload as=fetch>` + reused by
  `createAudio`); the unlock tap only resumes Web Audio and decodes. The SFX are now 7 KB / 1.6 KB MP3 takes (the chime
  WAV was 70 KB; WAVs stay as fallback). Start gets an instant pressed state, Kit waves and the bubble updates on
  pointerdown. Headless Chrome, 1.6 Mbps / 150 ms RTT, cache off, tap → hello audio start: **rc3 ≈ 675 ms
  (Uiux saw 735–756 ms) → rc4 ≈ 17 ms**, also when tapped the instant the app boots; boot time unchanged (≈ 3.4 s
  locally, uncompressed manifest).
- **Locked sentence words (low):** still inert, but a tap on one makes the current word bounce once with a soft tap
  sound, pointing the child back (reduced motion: a still glow, no bounce). Counted as `run.nudges`.

## Audio QA (rc3)
Pipeline: `tools/audio_qa/process.py` (trim edges at −40 dB, phoneme cuts below, BS.1770 loudness −16 LUFS with
peak ≤ −1.5 dBFS, mono MP3). Words / sentences / prompts were checked with a local ASR (faster-whisper small.en, then
medium.en on every mismatch); phonemes by duration + voicing/frication profile.
- **All 828 trimmed + normalized** (total speech 1102 s → 883 s; 18 MB → 5.8 MB).
- **Phonemes re-cut without new credits:** stops t p d c k ck g b j (and glides w y) → burst only, schwa cut off;
  s ss z zz s=/z/ r n ll short sounds cut from their steady held takes (the 2-letter takes said letter names, "es es");
  held m n r l ll ss s=/z/ z v capped to 1.1 s (n-held was 4.5 s, r-held 3.2 s); zz-held = s=/z/-held (zz-held said
  "zee zee"); h cut from the onset of *hat* (take said "aitch"); x = /ks/ cut from the coda of *box*; i = first vowel
  only, i-held = that vowel stretched to ~1 s (take was broken); sh-held extended to 1.0 s.
- **Regenerated (28 short xAI calls in total, no full re-run):** ch ("chuh" → frication only), qu ("kwuh" → /kw/),
  th ("thhhhhhhhin" → /θ/ frication, extended), th=/ð/ short ("thuh" → onset) and held ("ðððððð"), f / ff and held
  (pooled /f/ frication from "ffffffffff"), ng and held (steady nasal from "sinnnnnnnnng"), nk (that nasal + the /k/
  burst). Words where the ASR heard the wrong vowel (pre-nasal short a): man, pan (+ pic-pan), and, ant, band, jam,
  grin, us — regenerated as "Man!" etc. and now transcribe correctly.
- **Needs a human ear before a child playtest:** snd-th_v / th_v-held (voiced th is the hardest; may sound like a
  buzz or "z"), snd-ng / ng-held vs n (isolated nasal hum), snd-nk (spliced), snd-qu (short w glide), snd-w / snd-y
  (glides cannot be fully vowel-free), snd-l / l-held / ll-held (ASR heard "Lola"), snd-r (ASR heard "uhh"), snd-h
  (quiet breath), f / th (extended frication can sound hissy), and **word-tan** (still heard as "ten" after 2
  retries — keep or re-record). ASR "mismatches" left on letter names, rimes (nonsense syllables) and homophones
  (mat/Matt, to/2, past/passed) were judged ASR noise.
- Loading: only the SFX + greeting gate the hello tap; letter sounds / names and Kit's lines (131 small clips)
  warm in the background; each words round warms its words, reveals and pictures; anything else loads on first play.
  Takes always win over browser speech (speech only if a take fails to load).

## Release steps after rc4
Listen to the flagged phonemes (above), replace emoji with drawn art and run the naming test, playtest
8–12 children (spec §3.9) and tune thresholds (`RULES`, `SUPPORT_RULES`), then tag 1.0.0.
