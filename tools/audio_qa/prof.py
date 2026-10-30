import numpy as np,subprocess,sys,json
def load(f,sr=16000):
    b=subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','1','-ar',str(sr),'-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(b,np.float32)
def frames(x,sr=16000,hop=0.01,win=0.03):
    h=int(sr*hop);w=int(sr*win);out=[]
    for i in range(0,max(1,len(x)-w),h):
        f=x[i:i+w]; r=np.sqrt(np.mean(f**2))+1e-9
        z=np.mean(np.abs(np.diff(np.sign(f))))/2
        f0=f-f.mean(); ac=np.correlate(f0,f0,'full')[w-1:]; 
        v=ac[int(sr/400):int(sr/70)].max()/(ac[0]+1e-9)
        out.append((20*np.log10(r),z,v))
    return np.array(out)
def profile(f):
    x=load(f); F=frames(x); db=F[:,0]; pk=db.max()
    act=np.where(db>pk-35)[0]
    if len(act)==0: return None
    s,e=act[0],act[-1]
    seg=F[s:e+1]
    # per-frame class: V voiced (v>.5 & zcr<.15), F fricative (zcr>.25), else '.'
    cls=''.join('V' if (v>0.5 and z<0.15) else ('F' if z>0.25 else '.') for d,z,v in seg)
    return dict(start=s*0.01,end=(e+1)*0.01+0.02,dur=(e-s+1)*0.01,cls=cls)
if __name__=='__main__':
    m=json.load(open('/workspace/kitphonic/audio/manifest.json'))
    for c in m['clips']:
        if c['id'].startswith('snd-'):
            p=profile('/workspace/kp-takes-raw-backup/'+c['take'].split('/')[-1])
            print(f"{c['id']:16} {c['tts']:8} {p['start']:.2f}-{p['end']:.2f} d={p['dur']:.2f} {p['cls']}")
