// Uiux two-finger repro (rc6 regression), kept as-is apart from BASE / SHOT env. Needs puppeteer-core (e.g. /tmp/pp/node_modules).
// Pass = 'with palm' shows done:1 and one more star.   BASE=http://127.0.0.1:8099/ node tools/trace-palm-tr2.cjs
const p=require('puppeteer-core');
(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const pg=await b.newPage();await pg.setViewport({width:820,height:1180,isMobile:true,hasTouch:true});
await pg.goto((process.env.BASE||'https://digitalfarmer420.github.io/kitphonic/')+'?activity=trace&skipHello=1&_='+Date.now(),{waitUntil:'networkidle2'});await new Promise(r=>setTimeout(r,3000));
const cdp=await pg.target().createCDPSession();
const pts=await pg.evaluate(()=>{const g=document.querySelector('#tr-svg path.guide');const m=g.getScreenCTM();const L=g.getTotalLength();const o=[];for(let i=0;i<=40;i++){const q=g.getPointAtLength(L*i/40);const s=new DOMPoint(q.x,q.y).matrixTransform(m);o.push([s.x,s.y])}return o});
const R=await pg.evaluate(()=>{const r=document.getElementById('tr-svg').getBoundingClientRect();return [r.right-15,r.bottom-15]});console.log('svg corner',R);const T=(type,tps)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:tps});
const run=async(second)=>{
 await T('touchStart',[{x:pts[0][0],y:pts[0][1],id:1}]);
 for(let i=1;i<=40;i++){const tps=[{x:pts[i][0],y:pts[i][1],id:1}];
   if(second&&i===10){await T('touchStart',[{x:pts[i][0],y:pts[i][1],id:1},{x:R[0],y:R[1],id:2}]);}
   if(second&&i>=10)tps.push({x:R[0],y:R[1],id:2});
   await T('touchMove',tps);await new Promise(r=>setTimeout(r,16));}
 await T('touchEnd',[]);await new Promise(r=>setTimeout(r,400));
 return pg.evaluate(()=>({ink:document.querySelectorAll('#tr-svg .ink').length,done:document.querySelectorAll('#tr-svg .doneink').length,stars:document.querySelectorAll('#tr-tray .emoji:not(.off)').length}));};
console.log('one finger',JSON.stringify(await run(false)));await new Promise(r=>setTimeout(r,3500));
const pts2=pts; console.log('with palm',JSON.stringify(await run(true)));
await pg.screenshot({path:''+(process.env.SHOT||'/tmp/tr-palm.png')+''});
await b.close()})();
