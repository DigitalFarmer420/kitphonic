# Kitphonic rc3 audio QA: trim, phoneme surgery, loudness-normalize (-16 LUFS, peak <= -1.5 dBFS), mono 24 kHz 48 kbps MP3.
import json, subprocess, sys, os, numpy as np, pyloudnorm as pyln
from prof import frames
SR = 24000
RAW = '/workspace/kp-takes-raw-backup'; CAND = '/workspace/kp-audioqa/cand'; OUT = '/workspace/kitphonic/audio/takes'
M = json.load(open('/workspace/kitphonic/audio/manifest.json'))
rng = np.random.default_rng(7); meter = pyln.Meter(SR)
def load(f): return np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True,check=True).stdout,np.float32).astype(np.float64)
raw = lambda i: load(f'{RAW}/{i}.mp3'); cand = lambda i: load(f'{CAND}/{i}.mp3')
S = lambda t: int(round(t*SR))
def F(x): return frames(x.astype(np.float32), sr=SR)
def act(x, rel=40):
    db = F(x)[:,0]; a = np.where(db > db.max()-rel)[0]; return a[0]*0.01, (a[-1]+3)*0.01
def fade(x, fi=0.005, fo=0.02):
    x = x.copy(); n=min(S(fi),len(x)//2); m=min(S(fo),len(x)//2)
    if n: x[:n] *= np.linspace(0,1,n)
    if m: x[-m:] *= np.linspace(1,0,m)
    return x
def seg(x, t0, t1, fi=0.005, fo=0.02): return fade(x[S(t0):S(t1)], fi, fo)
def pad(x, pre=0.01, post=0.02): return np.concatenate([np.zeros(S(pre)), x, np.zeros(S(post))])
def trim(x, rel=40, pre=0.03, post=0.08):
    a,b = act(x, rel); return fade(x[max(0,S(a-pre)):min(len(x),S(b+post))], 0.005, 0.03)
def granular(src, dur, grain=0.06):  # stationary-noise extension (fricatives): random Hann grains, 50% overlap
    g=S(grain); h=g//2; w=np.hanning(g); n=S(dur); y=np.zeros(n+g); norm=np.zeros(n+g)
    for p in range(0, n, h):
        o = rng.integers(0, len(src)-g); y[p:p+g] += src[o:o+g]*w; norm[p:p+g] += w
    return fade((y/np.maximum(norm,1e-3))[:n], 0.03, 0.08)
def atempo(x, factor):  # factor < 1 = slower (WSOLA); chained in 0.5 steps
    fs=[]; f=factor
    while f < 0.5: fs.append(0.5); f/=0.5
    fs.append(f); flt=','.join(f'atempo={v:.4f}' for v in fs)
    p = subprocess.run(['ffmpeg','-v','error','-f','f64le','-ar',str(SR),'-ac','1','-i','-','-af',flt,'-f','f64le','-'],input=x.astype(np.float64).tobytes(),capture_output=True,check=True)
    return np.frombuffer(p.stdout,np.float64)
def frun(x, t0, t1): return x[S(t0):S(t1)]
def head(x, dur, fo=0.08):  # from onset, `dur` seconds of a steady sound
    a,_ = act(x, 35); return fade(x[S(a):S(a+dur)], 0.01, fo)

def phoneme(i):
    STOP = {  # id: (source, onset s, cut s)  -> burst (+ a hair of voicing for b d g j), schwa cut off
      't': ('snd-t',.08,.21), 'p': ('snd-p',.06,.165), 'd': ('snd-d',.10,.17), 'c': ('snd-c',.08,.205), 'k': ('snd-k',.08,.195),
      'ck': ('snd-ck',.07,.225), 'g': ('snd-g',.05,.18), 'b': ('snd-b',.02,.20), 'j': ('snd-j',.05,.21), 'w': ('snd-w',.07,.24), 'y': ('snd-y',.06,.22)}
    g = i[4:]; held = g.endswith('-held'); b = g[:-5] if held else g
    if b in STOP and not held:
        s,t0,t1 = STOP[b]; return seg(raw(s), t0-0.005, t1, 0.003, 0.05 if b in 'wy' else 0.015), f'stop: burst only, cut at {t1:.3f}s (was "{b}uh")'
    if b == 'ch' : return seg(cand('snd-ch-c1'), .075, .24, .003, .015), 'regen "chuh" -> frication only'
    if b == 'qu' : return seg(cand('snd-qu-c1'), .105, .36, .003, .05), 'regen "kwuh" -> /kw/ with a short w glide'
    if b == 'th_v':
        if held: return head(cand('snd-th_v-held-c1'), 1.1), 'regen "ðððððð" (voiced buzz), capped 1.1 s'
        return seg(cand('snd-th_v-c1'), .115, .24, .003, .03), 'regen "thuh" -> /ð/ onset only (was the word "the")'
    if b == 'th':
        src = frun(cand('snd-th-held-c2'), .08, .23)
        return (granular(src, 1.0), 'from regen "thhhhhhhhin": /θ/ frication, grain-extended to 1.0 s') if held else (granular(src, 0.32, 0.04), 'from regen "thhhhhhhhin": /θ/ frication, 0.32 s')
    if b in ('f','ff'):
        x = cand('snd-f-held-c1'); fr = F(x); runs = [k for k,(d,z,v) in enumerate(fr) if z > 0.25 and d > fr[:,0].max()-35]
        src = np.concatenate([x[S(k*0.01+0.005):S(k*0.01+0.015)] for k in runs])  # pooled /f/ frames (10 ms each)
        src = np.concatenate([x[S(.07):S(.22)], src])
        return (granular(src, 1.0), 'from regen "ffffffffff" (stuttered): pooled /f/ frication, 1.0 s') if held else (granular(src, 0.32, 0.04), 'pooled /f/ frication, 0.32 s (was "ef ef")')
    if b == 'h': return seg(raw('word-hat'), .035, .185, .01, .03), 'cut from word-hat onset: breath /h/ only (was letter name "aitch")'
    if b == 'x':
        x = raw('word-box'); db = F(x)[:,0]; pk = db.max(); top = int(np.argmax(db)); lo = [k for k in range(top, len(db)) if db[k] < pk-45]
        k0 = next(k for k in range(lo[0], len(db)) if db[k] > pk-30); _,e = act(x, 35)
        return seg(x, k0*0.01, e, .003, .04), f'cut from word-box coda at {k0*0.01:.2f}s: /ks/ (was "eks"/"kay-es")'
    if b in ('ng','nk'):
        x = cand('snd-ng-held-c2'); _,e = act(x, 35)
        if b == 'ng': return (fade(x[S(e-1.35):S(e-0.2)], .03, .1), 'regen "sinnnnnnnnng": steady nasal tail, 1.15 s') if held else (fade(x[S(e-0.65):S(e-0.2)], .02, .06), 'regen "sinnnnnnnnng": nasal tail 0.45 s (was "en-gee")')
        k = seg(raw('snd-k'), .075, .185, .003, .015)
        return np.concatenate([fade(x[S(e-0.5):S(e-0.2)], .02, .04), np.zeros(S(.035)), k]), 'nasal (from regen "sinnnng") + /k/ burst (from snd-k), was "en-kay"'
    if b == 'i':
        x = raw('snd-i'); src = seg(x, .08, .29, .005, .02)
        return (fade(atempo(x[S(.09):S(.28)], 0.19/1.0), .03, .1), 'snd-i vowel time-stretched to 1.0 s (held take was broken "ih-ih-eah")') if held else (src, 'first vowel only (take had a second "ih")')
    # continuants: short versions cut from the steady held take where the 2-letter take spelled letter names
    SHORT_FROM = {'s':'snd-s-held','ss':'snd-ss-held','s_z':'snd-s_z-held','z':'snd-z-held','zz':'snd-s_z-held','r':'snd-r-held','n':'snd-n-held','ll':'snd-ll-held'}
    HELD_FROM = {'zz':'snd-s_z-held'}
    if held:
        if b == 'sh':
            x = raw('snd-sh-held'); a,e = act(x,35); return granular(x[S(a+.05):S(e-.05)], 1.0), 'sh held 0.65 s -> grain-extended to 1.0 s'
        src = HELD_FROM.get(b, i); x = raw(src); a,e = act(x, 35)
        note = f'from {src}' if src != i else ''
        if e - a > 1.15: return head(x, 1.1), (f'capped {e-a:.2f}s -> 1.1 s ' + note).strip()
        return trim(x, 40, .01, .03), ('trimmed ' + note).strip()
    if b in SHORT_FROM: return head(raw(SHORT_FROM[b]), 0.45, 0.06), f'cut 0.45 s from {SHORT_FROM[b]} (2-letter take said the letter name twice)'
    x = trim(raw(i), 40, .01, .03)
    if len(x)/SR > 0.6: x = fade(x[:S(0.6)], 0, 0.06); return x, 'capped 0.6 s'
    return x, 'trimmed'

def loud(x, target=-16.0, peak_db=-1.5):
    t = np.tile(x, max(1, int(np.ceil(0.8*SR/len(x)))+1))  # short clips: measure a tiled copy (BS.1770 needs >= 400 ms)
    L = meter.integrated_loudness(t); gdb = target - L
    pk = 20*np.log10(np.abs(x).max()+1e-9); gdb = min(gdb, peak_db - pk)
    return x * 10**(gdb/20), L, gdb
def enc(x, out):
    subprocess.run(['ffmpeg','-v','error','-y','-f','f64le','-ar',str(SR),'-ac','1','-i','-','-c:a','libmp3lame','-b:a','48k','-ar',str(SR),'-ac','1',out], input=x.tobytes(), check=True)

if __name__ == '__main__':
    only = sys.argv[1].split(',') if len(sys.argv) > 1 else None
    log = {}
    for c in M['clips']:
        if not c.get('take') or not c.get('tts'): continue
        i = c['id']
        if only and i not in only: continue
        x0 = raw(i)
        if i.startswith('snd-'): x, note = phoneme(i); x = pad(x, .01, .02)
        else: x, note = trim(x0), 'trimmed'
        soft = i.startswith('snd-') and i[4:].replace('-held','') in ('s','ss','f','ff','th','sh','h')
        y, L, g = loud(x, -19.0 if soft else -16.0)  # voiceless fricatives sit ~3 LU lighter (less hiss, still clear)
        enc(y, f'{OUT}/{i}.mp3')
        log[i] = dict(kind=c['kind'], before=round(len(x0)/SR,3), after=round(len(x)/SR,3), lufs_in=round(L,1), gain_db=round(g,1), note=note)
    json.dump(log, open('/workspace/kp-audioqa/process-log.json','w'), indent=1)
    print(len(log), 'processed')
