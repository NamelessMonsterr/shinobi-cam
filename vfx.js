// vfx.js — anime-grade procedural VFX. Shader layer (fxgl) + 2D canvas. All original art.

function rand(a,b){ return a + Math.random()*(b-a); }

// ---------- particle pool (additive) ----------
class Particles {
  constructor(){ this.ps = []; }
  spawn(p){ this.ps.push({t:0, life:1, vx:0, vy:0, size:4, color:'#fff', alpha:1, drag:0.98, gravity:0, stretch:0, ...p}); }
  update(dt){
    for (const p of this.ps){ p.t += dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vx *= p.drag; p.vy = p.vy*p.drag + p.gravity*dt; }
    this.ps = this.ps.filter(p => p.t < p.life);
  }
  draw(g){
    g.save(); g.globalCompositeOperation='lighter';
    for (const p of this.ps){
      const k = 1 - p.t/p.life;
      g.globalAlpha = Math.min(1, p.alpha * k);
      g.fillStyle = p.color;
      if (p.stretch){
        // motion-streaked particle (wind / speed lines)
        const len = Math.hypot(p.vx,p.vy)*0.045*p.stretch + 1;
        const ang = Math.atan2(p.vy,p.vx);
        g.save(); g.translate(p.x,p.y); g.rotate(ang);
        g.beginPath(); g.ellipse(0,0, p.size*k*len, p.size*k*0.4, 0, 0, 7); g.fill();
        g.restore();
      } else {
        g.beginPath(); g.arc(p.x, p.y, p.size*(0.4+0.6*k), 0, 7); g.fill();
      }
    }
    g.restore();
  }
}

// ---------- sprites ----------
function makePuff(size=160){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  for (let i=0;i<42;i++){
    const r = rand(size*0.06, size*0.2), a = rand(0, Math.PI*2), d = rand(0, size*0.26);
    const px = size/2 + Math.cos(a)*d, py = size/2 + Math.sin(a)*d;
    const g = x.createRadialGradient(px,py,0,px,py,r);
    const shade = 225 + Math.floor(rand(-25,25));
    g.addColorStop(0,`rgba(${shade},${shade},${shade+8},0.14)`); g.addColorStop(1,'rgba(235,235,240,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px,py,r,0,7); x.fill();
  }
  // denser core
  for (let i=0;i<14;i++){
    const r = rand(size*0.1, size*0.24), a = rand(0, Math.PI*2), d = rand(0, size*0.13);
    const px = size/2 + Math.cos(a)*d, py = size/2 + Math.sin(a)*d;
    const g = x.createRadialGradient(px,py,0,px,py,r);
    g.addColorStop(0,'rgba(245,245,250,0.2)'); g.addColorStop(1,'rgba(245,245,250,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px,py,r,0,7); x.fill();
  }
  return c;
}
function makeGlow(color, size=128){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0, color); g.addColorStop(0.4, color.replace('1)','0.5)')); g.addColorStop(1, color.replace('1)','0)'));
  x.fillStyle = g; x.fillRect(0,0,size,size);
  return c;
}
// pseudo-kanji glyph texture for the Reaper ring (original stroke patterns, not copied art)
function makeGlyphRing(size=640){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.translate(size/2, size/2);
  const glyphs = 16;
  for (let i=0;i<glyphs;i++){
    const a = i/glyphs * Math.PI*2;
    x.save(); x.rotate(a); x.translate(0, -size*0.44);
    x.strokeStyle = 'rgba(15,12,25,0.95)'; x.lineWidth = size*0.008; x.lineCap='round';
    // original angular talisman strokes
    const strokes = 3 + (i*7)%3;
    for (let s=0;s<strokes;s++){
      const y0 = -size*0.03 + s*size*0.02 + ((i*13+s*29)%7 - 3)*1.5;
      const w = size*0.025 * (0.6 + ((i*31+s*17)%10)/12);
      x.beginPath();
      x.moveTo(-w, y0);
      x.lineTo(w*((s%2)?1:-1)*0.8, y0 + ((i*11+s*5)%5-2)*1.6);
      if ((i+s)%3===0) x.lineTo(w*0.3, y0 + size*0.014);
      x.stroke();
    }
    // tick mark
    x.beginPath(); x.moveTo(0, size*0.028); x.lineTo(((i*19)%5-2)*2.4, size*0.042); x.stroke();
    x.restore();
  }
  // ring circles
  x.strokeStyle='rgba(15,12,25,0.9)';
  x.lineWidth = size*0.006;
  x.beginPath(); x.arc(0,0,size*0.475,0,7); x.stroke();
  x.beginPath(); x.arc(0,0,size*0.405,0,7); x.stroke();
  return c;
}

export class VFX {
  constructor(overlay, fxgl){
    this.cv = overlay; this.ctx = overlay.getContext('2d');
    this.gl = fxgl;              // FXGL instance or null
    this.parts = new Particles();
    this.puff = makePuff();
    this.glowBlue = makeGlow('rgba(90,170,255,1)');
    this.glowWhite = makeGlow('rgba(255,255,255,1)');
    this.glowOrange = makeGlow('rgba(255,150,40,1)');
    this.glowRed = makeGlow('rgba(255,60,60,1)');
    this.glyphRing = makeGlyphRing();
    this.active = [];
    this.specter = new Image(); this.specterReady = false;
    this.specter.onload = () => this.specterReady = true;
    this.specter.src = 'specter.png';
    this.swirl = { strength: 0, x: 0.5, y: 0.5 };
    this.flashA = 0; this.flashColor = '255,200,80';
    this.shake = 0;              // consumed by main loop (CSS transform)
    this.banner = null;
    this.quality = 2;            // 2 high, 1 med, 0 low
    this.sharinganA = 0;
  }
  resize(w,h){ this.cv.width=w; this.cv.height=h; }
  get oct(){ return [2,3,4][this.quality]; }
  get pmul(){ return [0.35,0.6,1][this.quality]; }

  trigger(id, anchors){
    const W = this.cv.width, H = this.cv.height;
    const palm = anchors.palm || {x:W*0.68, y:H*0.42};
    if (id==='rasengan') this.active.push(new Rasengan(this, palm));
    if (id==='chidori')  this.active.push(new Chidori(this, palm));
    if (id==='clones')   this.active.push(new Clones(this, anchors.frame));
    if (id==='fireball') this.active.push(new Fireball(this, anchors.mouth || {x:W/2, y:H*0.35}));
    if (id==='summoning')this.active.push(new Summoning(this, anchors));
    if (id==='sharingan')this.active.push(new Sharingan(this));
    if (id==='kamui')    this.active.push(new Kamui(this));
    if (id==='susano')   this.active.push(new Specter(this, [1.0,0.28,0.12], [1.0,0.65,0.25], 9));
    if (id==='reaper')   this.active.push(new Reaper(this));
  }
  setBanner(text, color){ this.banner = { text, color, t:0, life:2.0 }; }

  update(dt, anchors){
    this.parts.update(dt);
    for (const e of this.active) e.update(dt, anchors);
    this.active = this.active.filter(e => !e.done);
    if (this.banner){ this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }
    this.flashA = Math.max(0, this.flashA - dt*2.2);
    this.shake = Math.max(0, this.shake - dt*26);
    this.sharinganA = 0;
    this.swirl.strength *= Math.pow(0.2, dt);
  }
  draw(){
    const {ctx: g, cv} = this;
    g.clearRect(0,0,cv.width,cv.height);
    if (this.flashA > 0){ g.fillStyle = `rgba(${this.flashColor},${this.flashA})`; g.fillRect(0,0,cv.width,cv.height); }
    for (const e of this.active) if (e.below) e.draw(g);
    this.parts.draw(g);
    for (const e of this.active) if (!e.below) e.draw(g);
    if (this.banner){
      const b = this.banner, k = b.t/b.life;
      const pop = k<0.1 ? k/0.1 : 1;
      const size = Math.round(cv.width*0.085*pop);
      const y = cv.height*0.8;
      g.save();
      g.globalAlpha = k>0.75 ? 1-(k-0.75)/0.25 : 1;
      // impact speed lines behind the banner (brief)
      if (k < 0.12){
        g.strokeStyle = 'rgba(20,15,10,0.4)'; g.lineWidth = size*0.05;
        for (let i=0;i<7;i++){
          const ly = y - size*0.55 + i*size*0.16;
          const inset = cv.width*0.3*(1-Math.abs(ly-y+size*0.1)/(size*0.9));
          g.beginPath(); g.moveTo(0, ly); g.lineTo(Math.max(0,inset), ly); g.stroke();
          g.beginPath(); g.moveTo(cv.width, ly); g.lineTo(cv.width-Math.max(0,inset), ly); g.stroke();
        }
      }
      g.font = `900 ${size}px 'Arial Black', Arial, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = size*0.1; g.strokeStyle = 'rgba(40,20,0,0.92)';
      g.strokeText(b.text, cv.width/2, y);
      g.fillStyle = b.color; g.fillText(b.text, cv.width/2, y);
      g.restore();
    }
  }
}

// ================= RASENGAN =================
class Rasengan {
  constructor(v, palm){
    this.v=v; this.palm={...palm}; this.t=0; this.life=4.6; this.done=false; this.r=0;
    this.item = v.gl ? v.gl.spawn('rasengan', { x:palm.x, y:palm.y, r:0, alpha:0 }) : null;
    this.ang = rand(0,7);
  }
  update(dt, anchors){
    this.t+=dt;
    if (anchors.palm){ this.palm.x += (anchors.palm.x-this.palm.x)*Math.min(1,dt*14); this.palm.y += (anchors.palm.y-this.palm.y)*Math.min(1,dt*14); }
    this.r = Math.min(1, this.r + dt*2.4);
    const W=this.v.cv.width, R = W*0.085*this.r;
    if (this.item){
      this.item.x=this.palm.x; this.item.y=this.palm.y; this.item.r=R; this.item.oct=this.v.oct;
      this.item.alpha = Math.min(1, this.t*3) * (this.t>this.life-0.8 ? Math.max(0,(this.life-this.t)/0.8) : 1);
    }
    // orbiting wind streaks
    const n = Math.round(7*this.v.pmul);
    for (let i=0;i<n;i++){
      this.ang += dt*0.5;
      const a = rand(0,7), d = R*rand(1.0,1.7);
      const sp = rand(220,430);
      this.v.parts.spawn({
        x:this.palm.x+Math.cos(a)*d, y:this.palm.y+Math.sin(a)*d,
        vx:-Math.sin(a)*sp, vy:Math.cos(a)*sp,
        size:rand(1.5,3.2), life:rand(0.25,0.55),
        color: Math.random()<0.5?'#bfe0ff':'#ffffff', drag:0.97, stretch:1 });
    }
    if (this.t>this.life){ this.done=true; if (this.item) this.v.gl.remove(this.item); }
  }
  draw(){}
}

// ================= CHIDORI =================
class Chidori {
  constructor(v, palm){
    this.v=v; this.palm={...palm}; this.t=0; this.life=3.8; this.done=false;
    this.item = v.gl ? v.gl.spawn('chidori', { x:palm.x, y:palm.y, r:v.cv.width*0.17, seed:rand(0,6.28), alpha:0 }) : null;
    v.flashA = 0.4; v.flashColor='210,230,255'; v.shake = 7;
    this.flick = 0;
  }
  update(dt, anchors){
    this.t+=dt; this.flick+=dt;
    if (anchors.palm){ this.palm.x += (anchors.palm.x-this.palm.x)*Math.min(1,dt*16); this.palm.y += (anchors.palm.y-this.palm.y)*Math.min(1,dt*16); }
    if (this.item){
      // re-seed at ~12fps for crackling flicker
      if (this.flick > 0.08){ this.flick = 0; this.item.seed = rand(0,6.28); }
      this.item.x=this.palm.x; this.item.y=this.palm.y;
      this.item.alpha = Math.min(1, this.t*5) * (this.t>this.life-0.7 ? Math.max(0,(this.life-this.t)/0.7) : 1);
      this.item.r = this.v.cv.width*0.17*(1+0.06*Math.sin(this.t*31));
    }
    const n = Math.round(10*this.v.pmul);
    for (let i=0;i<n;i++){
      const a=rand(0,7), sp=rand(160,640);
      this.v.parts.spawn({ x:this.palm.x+rand(-10,10), y:this.palm.y+rand(-10,10),
        vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, size:rand(1,2.6), life:rand(0.15,0.4),
        color: Math.random()<0.6?'#cfe4ff':'#ffffff', drag:0.94, stretch:1 });
    }
    if (this.t>this.life){ this.done=true; if (this.item) this.v.gl.remove(this.item); }
  }
  draw(){}
}

// ================= SHADOW CLONES =================
class Clones {
  below = true;
  constructor(v, frame){
    this.v=v; this.frame=frame; this.t=0; this.life=5.5; this.done=false;
    const W=v.cv.width, H=v.cv.height;
    const q = [5,7,9][v.quality];
    const spots = [[-0.30,0.03,0.46],[0.28,-0.02,0.46],[-0.14,-0.07,0.54],[0.15,0.05,0.54],[0,-0.11,0.6],[-0.42,0.09,0.36],[0.42,0.07,0.36],[-0.22,0.12,0.4],[0.24,0.13,0.4]];
    this.copies = spots.slice(0,q).map(([dx,dy,s],i)=>({ x:W*(0.5+dx), y:H*(0.5+dy), s, a:0, delay:i*0.09 }));
    this.smoke = [];
    for (const c of this.copies){
      for(let i=0;i<4;i++) this.smoke.push({ x:c.x+rand(-90,90)*c.s*2, y:c.y+rand(0,150)*c.s, r:0, max:rand(80,170), a:0.9, vr:rand(140,260), delay:c.delay });
    }
  }
  update(dt){
    this.t+=dt;
    for (const c of this.copies){
      if (this.t > c.delay) c.a = Math.min(0.88, c.a + dt*3.2);
    }
    for (const s of this.smoke){ if (this.t > s.delay){ s.r += s.vr*dt; s.a = Math.max(0, 0.9 - (s.r/s.max)*0.9); } }
    if (this.t>this.life) this.done=true;
  }
  draw(g){
    if (!this.frame) return;
    const W=this.v.cv.width, H=this.v.cv.height;
    g.save();
    for (const c of this.copies){
      if (c.a<=0) continue;
      const w = W*c.s*0.62, h = H*c.s*0.62;
      g.globalAlpha = c.a;
      g.drawImage(this.frame, c.x-w/2, c.y-h/2, w, h);
    }
    g.globalAlpha = 1;
    for (const s of this.smoke){ if (s.a>0){ g.globalAlpha = Math.min(0.95,s.a); g.drawImage(this.v.puff, s.x-s.r, s.y-s.r, s.r*2, s.r*2); } }
    g.restore(); g.globalAlpha = 1;
  }
}

// ================= FIREBALL =================
class Fireball {
  constructor(v, mouth){
    this.v=v; this.mouth={...mouth}; this.t=0; this.life=2.8; this.done=false;
    this.item = v.gl ? v.gl.spawn('fireball', { x:mouth.x, y:mouth.y, grow:0.02, alpha:1 }) : null;
    v.flashA = 0.6; v.flashColor='255,170,60'; v.shake = 10;
  }
  update(dt){
    this.t+=dt;
    const H=this.v.cv.height;
    const target = H*0.62, fade = this.t>this.life-0.6 ? Math.max(0,(this.life-this.t)/0.6) : 1;
    if (this.item){
      this.item.grow = Math.min(target, this.item.grow + dt*H*2.4);
      this.item.alpha = fade*0.92;
      this.item.oct = this.v.oct;
    }
    const n = Math.round((this.t<1.6 ? 24 : 7)*this.v.pmul);
    for (let i=0;i<n;i++){
      const sp = rand(240,700), a = rand(-0.6,0.6);
      this.v.parts.spawn({ x:this.mouth.x+rand(-16,16), y:this.mouth.y+rand(-10,10),
        vx:Math.sin(a)*sp*0.5, vy:Math.cos(a)*sp - 120, size:rand(3,11), life:rand(0.5,1.2),
        color: ['#ffdd66','#ff9a33','#ff5a26','#ffe9b0'][Math.floor(rand(0,4))], drag:0.985, gravity:-200, stretch:1 });
    }
    this.v.flashA = Math.max(this.v.flashA, this.t<0.4 ? 0.4*fade : 0);
    if (this.t>this.life){ this.done=true; if (this.item) this.v.gl.remove(this.item); }
  }
  draw(){}
}

// ================= SUMMONING (blue chakra palms + smoke) =================
class Summoning {
  below = true;
  constructor(v, anchors){
    this.v=v; this.t=0; this.life=4.5; this.done=false; this.puffs=[];
    const W=v.cv.width, H=v.cv.height;
    for (let i=0;i<14;i++) this.puffs.push({x:rand(W*0.15,W*0.85), y:rand(H*0.45,H*0.95), r:0, max:rand(150,340), a:rand(0.7,1.0), vr:rand(120,240)});
    this.hands = anchors.hands || [];
  }
  update(dt){
    this.t+=dt;
    for (const p of this.puffs){ p.r = Math.min(p.max, p.r + p.vr*dt); p.a *= Math.pow(0.72,dt); }
    if (this.t>this.life) this.done=true;
  }
  draw(g){
    const W=this.v.cv.width, H=this.v.cv.height;
    const a = Math.min(1,this.t*2)*(this.t>this.life-1 ? (this.life-this.t) : 1);
    // glowing chakra hands (drawn from the user's own hand landmarks, scaled up)
    if (this.hands.length){
      g.save(); g.globalCompositeOperation='lighter';
      const pulse = 0.85 + 0.15*Math.sin(this.t*9);
      for (const hand of this.hands){
        const cx = hand.reduce((s,p)=>s+p.x,0)/hand.length, cy = hand.reduce((s,p)=>s+p.y,0)/hand.length;
        const k = (2.2 + 0.4*Math.sin(this.t*3));
        const layer = (scale, style, alpha) => {
          g.globalAlpha = alpha*a*pulse;
          g.fillStyle = style;
          g.beginPath();
          hand.forEach((p,i)=>{ const x=cx+(p.x-cx)*k*scale, y=cy+(p.y-cy)*k*scale; i?g.lineTo(x,y):g.moveTo(x,y); });
          g.closePath(); g.fill();
        };
        g.shadowColor = '#3f8dff'; g.shadowBlur = 55;
        layer(1.15, 'rgba(40,110,255,0.4)', 0.5);
        g.shadowBlur = 28;
        layer(0.9, 'rgba(90,160,255,0.55)', 0.65);
        g.shadowBlur = 12;
        layer(0.66, 'rgba(190,225,255,0.75)', 0.85);
        g.shadowBlur = 0;
      }
      g.restore();
    }
    g.save();
    for (const p of this.puffs){ g.globalAlpha = Math.min(0.9,p.a); g.drawImage(this.v.puff, p.x-p.r, p.y-p.r, p.r*2, p.r*2); }
    g.restore(); g.globalAlpha=1;
  }
}

// ================= SHARINGAN =================
class Sharingan {
  constructor(v){ this.v=v; this.t=0; this.life=6; this.done=false; }
  update(dt){ this.t+=dt; if (this.t>this.life) this.done=true; }
  draw(g){
    const W=this.v.cv.width, H=this.v.cv.height, a=Math.min(1,this.t*2)*(this.t>this.life-1 ? this.life-this.t : 1);
    g.save();
    const grad = g.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.75);
    grad.addColorStop(0,'rgba(120,0,0,0)'); grad.addColorStop(1,`rgba(160,10,10,${0.5*a})`);
    g.fillStyle=grad; g.fillRect(0,0,W,H);
    g.restore();
    this.v.sharinganA = a;
  }
}

// ================= KAMUI =================
class Kamui {
  constructor(v){ this.v=v; this.t=0; this.life=3.6; this.done=false; }
  update(dt, anchors){
    this.t+=dt;
    const p = anchors.face || anchors.palm || {x:this.v.cv.width/2, y:this.v.cv.height/2};
    this.v.swirl.x = p.x/this.v.cv.width; this.v.swirl.y = p.y/this.v.cv.height;
    const env = this.t<0.35 ? this.t/0.35 : (this.t>this.life-0.9 ? Math.max(0,(this.life-this.t)/0.9) : 1);
    this.v.swirl.strength = 26*env;   // much tighter spiral than before
    if (this.t>this.life) this.done=true;
  }
  draw(){}
}

// ================= SUSANO'O / spectral giant =================
class Specter {
  below = true;
  constructor(v, colA, colB, life, hue){
    this.v=v; this.t=0; this.life=life; this.done=false; this.hue = hue || null;
    this.aura = v.gl ? v.gl.spawn('aura', { colA, colB, alpha:0, centerX:0.5, width:0.62 }) : null;
    this.colA = colA;
  }
  update(dt){
    this.t+=dt;
    if (this.aura){
      this.aura.alpha = Math.min(0.75, this.t*1.2) * (this.t>this.life-1.2 ? Math.max(0,(this.life-this.t)/1.2) : 1) * 0.75;
      this.aura.oct = this.v.oct;
    }
    // rising embers
    const W=this.v.cv.width, H=this.v.cv.height, n=Math.round(3*this.v.pmul);
    for (let i=0;i<n;i++) this.v.parts.spawn({ x:rand(W*0.15,W*0.85), y:rand(H*0.6,H), vx:rand(-25,25), vy:rand(-160,-60),
      size:rand(1.5,4), life:rand(0.7,1.6), color: this.colA[0]>0.9?'#ff9a55':'#9db8ff', drag:0.99, stretch:0 });
    if (this.t>this.life){ this.done=true; if (this.aura) this.v.gl.remove(this.aura); }
  }
  draw(g){
    const W=this.v.cv.width, H=this.v.cv.height;
    const a = Math.min(1,this.t*1.4) * (this.t>this.life-1.2 ? Math.max(0,(this.life-this.t)/1.2) : 1);
    g.save();
    g.globalAlpha = 0.92*a;
    if (this.v.specterReady){
      const h = H*1.18, w = h*(this.v.specter.width/this.v.specter.height);
      if (this.hue) g.filter = this.hue;
      g.drawImage(this.v.specter, W/2-w/2, H-h+40, w, h);
      g.filter = 'none';
      // hot edge glow pass
      g.globalCompositeOperation='lighter'; g.globalAlpha = 0.22*a;
      g.drawImage(this.v.specter, W/2-w/2, H-h+40, w, h);
    }
    g.restore();
  }
}

// ================= REAPER DEATH SEAL =================
class Reaper {
  constructor(v){
    this.v=v; this.t=0; this.life=7; this.done=false;
    this.specter = new Specter(v, [0.25,0.5,0.6], [0.6,0.85,0.9], 7, 'hue-rotate(150deg) brightness(0.85)');
    this.smoke = [];
    const W=v.cv.width, H=v.cv.height;
    for (let i=0;i<16;i++) this.smoke.push({x:rand(W*0.1,W*0.9), y:rand(H*0.1,H*0.9), r:0, max:rand(140,320), a:rand(0.7,1.0), vr:rand(120,260)});
  }
  update(dt){
    this.t+=dt; this.specter.update(dt);
    for (const s of this.smoke){ s.r=Math.min(s.max, s.r+s.vr*dt); s.a*=Math.pow(0.7,dt); }
    if (this.t>this.life) this.done=true;
  }
  draw(g){
    const W=this.v.cv.width, H=this.v.cv.height;
    const a = Math.min(1,this.t*1.6)*(this.t>this.life-1 ? this.life-this.t : 1);
    // rotating talisman ring
    g.save();
    g.globalAlpha = 0.95*a;
    const cx=W/2, cy=H*0.42, R=H*0.95*Math.min(1,this.t*1.4);
    g.translate(cx,cy); g.rotate(this.t*0.35);
    g.drawImage(this.v.glyphRing, -R/2, -R/2, R, R);
    g.restore();
    // smoke
    g.save();
    for (const s of this.smoke){ g.globalAlpha = Math.min(0.85,s.a)*a; g.drawImage(this.v.puff, s.x-s.r, s.y-s.r, s.r*2, s.r*2); }
    g.restore(); g.globalAlpha=1;
    this.specter.draw(g);
  }
}
