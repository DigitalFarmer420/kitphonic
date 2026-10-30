#!/usr/bin/env python3
"""v2 V1 acceptance: in a scored trial no audio of the target word / sentence plays between the first sweep and the
first pick; the word plays after the pick. Word screen (picture + word-card checks), sentence, story.
v2 V2 ladder cases: S2 = silent dots (no phoneme audio while sweeping), S1 = no slider, check at once, 🔊 help brings the
slider back (logged helpUsed), S4 = model (word spoken, logged modelled).
  /workspace/pwvenv/bin/python tools/check-scored-audio.py [--base http://localhost:8099/]"""
import argparse, sys
from playwright.sync_api import sync_playwright

def sweep(pg, handle, last_tile, steps=40, pause=40):
    hb = pg.locator(handle).bounding_box(); tb = pg.locator(last_tile).last.bounding_box()
    y = hb['y'] + hb['height'] / 2; x0 = hb['x'] + hb['width'] / 2; x1 = tb['x'] + tb['width'] + 8
    pg.mouse.move(x0, y); pg.mouse.down()
    for k in range(1, steps + 1): pg.mouse.move(x0 + (x1 - x0) * k / steps, y); pg.wait_for_timeout(pause)
    pg.mouse.up()

def clips(pg, since): return pg.evaluate(f"__kitAudioLog.filter(e => e.t >= {since}).map(e => e.id)")
def now(pg): return pg.evaluate("Math.round(performance.now())")

def word_case(pg, base, word, level):
    pg.goto(f"{base}?skipHello=1&seed=1&level={level}&word={word}"); pg.wait_for_timeout(1500)
    t0 = now(pg); sweep(pg, '#handle', '#tiles .tile')
    pg.wait_for_selector('#check:not([hidden])', timeout=8000); pg.wait_for_timeout(1500)
    before = clips(pg, t0); bad = [c for c in before if c in (f'word-{word}', f'reveal-{word}')]
    t1 = now(pg); pg.locator(f"#choices .choice[data-w='{word}']").click(); pg.wait_for_timeout(2500)
    after = clips(pg, t1); rs = pg.evaluate("kitphonic.store.all().filter(r => r.skill.startsWith('blend:')).map(r => [r.scored, !!r.modelled])")
    ok = not bad and any(c in (f'word-{word}', f'reveal-{word}') for c in after) and rs and rs[0] == [True, False]
    return ok, f"word {word}: before-pick {bad or 'clean'}, after {[c for c in after if word in c]}, logged {rs}"

def sentence_case(pg, base, q, label):
    pg.goto(f"{base}?skipHello=1&seed=1&{q}"); pg.wait_for_timeout(1200); t0 = now(pg); bad = []
    for _ in range(300):
        st = pg.evaluate("() => { const r = kitphonic.sentenceScreen.run; return r ? { i: r.i, kind: r.tokens[r.i]?.kind, blend: !!r.ms, reading: !!r.reading, choose: !document.getElementById('sn-choices').hidden } : null }")
        if not st: break
        if st['choose'] and not st['reading']:
            bad = [c for c in clips(pg, t0) if c.startswith(('word-', 'sent-'))]
            r = pg.evaluate("kitphonic.sentenceScreen.run"); ans = pg.evaluate("() => { const r = kitphonic.sentenceScreen.run; return r.story ? r.story.ask.answer : r.sent.pic }")
            pg.locator(f"#sn-choices .pc[data-pic='{ans}']").click(); pg.wait_for_timeout(500); break
        if st['reading']: pg.wait_for_timeout(300); continue
        if st['kind'] == 'star': pg.wait_for_timeout(300); pg.locator('#sn-strip .wd').nth(st['i']).click(); pg.wait_for_timeout(900); continue
        if st['blend'] and pg.locator('#sn-handle').is_visible(): sweep(pg, '#sn-handle', '#sn-tiles .tile'); pg.wait_for_timeout(900); continue
        pg.wait_for_timeout(300)
    rs = pg.evaluate("kitphonic.store.all().filter(r => /^(sentence|story):/.test(r.skill)).map(r => [r.scored, !!r.modelled])")
    return (not bad and rs[:1] == [[True, False]]), f"{label}: before-pick {bad or 'clean'}, logged {rs}"

def ladder_case(pg, base, word, support):
    pg.goto(f"{base}?skipHello=1&seed=1&level=2&word={word}&support={support}"); pg.wait_for_timeout(1500); t0 = now(pg)
    slider = pg.locator('#slider').is_visible(); msg = f"S{support} {word}: slider {'shown' if slider else 'hidden'}"
    if support == 1:
        ok = not slider and pg.locator('#check').is_visible() and pg.locator('#check-help').is_visible()
        pg.locator('#check-help').click(); pg.wait_for_timeout(400); ok = ok and pg.locator('#slider').is_visible()
        sweep(pg, '#handle', '#tiles .tile'); pg.wait_for_selector('#check:not([hidden])', timeout=8000); pg.wait_for_timeout(800)
    else:
        sweep(pg, '#handle', '#tiles .tile'); pg.wait_for_selector('#check:not([hidden])', timeout=8000); pg.wait_for_timeout(1500); ok = slider
    before = clips(pg, t0); snd = [c for c in before if c.startswith(('snd-', 'rime-'))]; said = [c for c in before if c == f'word-{word}' or c.startswith('blend-')]
    pg.locator(f"#choices .choice[data-w='{word}']").click(); pg.wait_for_timeout(1200)
    r = pg.evaluate("kitphonic.store.all().filter(r => r.skill.startsWith('blend:'))[0]")
    if support in (1, 2): ok = ok and not snd and not said and r['support'] == support and r['scored'] and (r['helpUsed'] if support == 1 else True)
    if support == 4: ok = ok and bool(said) and r.get('modelled') and not r['scored']
    return ok, f"{msg}, phoneme clips before pick {len(snd)}, word said {bool(said)}, logged support={r['support']} scored={r['scored']} helpUsed={r['helpUsed']} modelled={r.get('modelled', False)}"

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8099/'); a = ap.parse_args()
    fails = 0
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for fn, args in [(word_case, ('mat', 2)), (word_case, ('cat', 3)), (sentence_case, ('activity=sentence&sentence=bug-hat', 'sentence bug-hat')),
                         (sentence_case, ('activity=story&story=lunch', 'story lunch')),
                         (ladder_case, ('mat', 2)), (ladder_case, ('mat', 1)), (ladder_case, ('mat', 4))]:
            pg = b.new_page(viewport={'width': 390, 'height': 844}); ok, msg = fn(pg, a.base, *args); pg.close()
            print(('OK   ' if ok else 'FAIL ') + msg); fails += not ok
        b.close()
    sys.exit(1 if fails else 0)
