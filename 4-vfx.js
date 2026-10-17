// vfx.js — procedural canvas VFX. All original generated art; no copyrighted assets.
// Effects draw into a 2D overlay canvas stacked above the (possibly WebGL-distorted) video.

function rand(a,b){ return a + Math.random()*(b-a); }

// ---------- particle pool ----------
class Particles {
  constructor(){ this.ps = []; }
  spawn(p){ this.ps.push({t:0, life:1, vx:0, vy:0, size:4, color:'#fff', alpha:1, drag:0.98, gravity:0, ...p}); }
  update(dt){
    for (const p of this.ps){ p.t += dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vx *= p.drag; p.vy = p.vy*p.drag + p.gravity*dt; }
    this.ps = this.ps.filter(p => p.t < p.life);
  }
  draw(ctx){
    for (const p of this.ps){
      const k = 1 - p.t/p.life;
      ctx.globalAlpha = p.alpha * k;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size*(0.5+0.5*k), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- smoke puff sprite (pre-rendered) ----------
function makePuff(size=128){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  for (let i=0;i<26;i++){
    const r = rand(size*0.08, size*0.22), a = rand(0, Math.PI*2), d = rand(0, size*0.25);
    const px = size/2 + Math.cos(a)*d, py = size/2 + Math.sin(a)*d;
    const g = x.createRadialGradient(px,py,0,px,py,r);
    g.addColorStop(0,'rgba(235,235,240,0.16)'); g.addColorStop(1,'rgba(235,235,240,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px,py,r,0,7); x.fill();
  }
  return c;
}

// ---------- glow sprite ----------
function makeGlow(color, size=128){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0, color); g.addColorStop(0.4, color.replace('1)','0.5)')); g.addColorStop(1, color.replace('1)','0)'));
  x.fillStyle = g; x.fillRect(0,0,size,size);
  return c;
}

export class VFX {
  constructor(overlay){
    this.cv = overlay; this.ctx = overlay.getContext('2d');
    this.parts = new Particles();
    this.puff = makePuff();
    this.glowBlue = makeGlow('rgba(90,170,255,1)');
    this.glowWhite = makeGlow('rgba(255,255,255,1)');
    this.glowOrange = makeGlow('rgba(255,150,40,1)');
    this.glowRed = makeGlow('rgba(255,60,60,1)');
    this.glowPurple = makeGlow('rgba(190,90,255,1)');
    this.active = [];       // running effect instances
    this.specter = new Image(); this.specterReady = false;
    this.specter.onload = () => this.specterReady = true;
    this.specter.src = 'specter.png';
    this.swirl = { strength: 0, x: 0.5, y: 0.5 }; // consumed by the WebGL layer
    this.flashA = 0; this.flashColor = '255,200,80';
    this.banner = null;     // {text,color,t,life}
  }
  resize(w,h){ this.cv.width=w; this.cv.height=h; }

  trigger(id, anchors){
    const W = this.cv.width, H = this.cv.height;
    const palm = anchors.palm || {x:W*0.7, y:H*0.45};
    if (id==='rasengan') this.active.push(new Rasengan(this, palm));
    if (id==='chidori')  this.active.push(new Chidori(this, palm));
    if (id==='clones')   this.active.push(new Clones(this, anchors.frame));
    if (id==='fireball') this.active.push(new Fireball(this, anchors.mouth || {x:W/2, y:H*0.35}));
    if (id==='summoning')this.active.push(new Summoning(this));
    if (id==='sharingan')this.active.push(new Sharingan(this));
    if (id==='kamui')    this.active.push(new Kamui(this));
    if (id==='susano')   this.active.push(new Specter(this, 'rgba(255,70,70,', 9));
    if (id==='reaper')   this.active.push(new Reaper(this));
  }
  setBanner(text, color){ this.banner = { text, color, t:0, life:1.8 }; }

  update(dt, anchors){
    this.parts.update(dt);
    for (const e of this.active) e.update(dt, anchors);
    this.active = this.active.filter(e => !e.done);
    if (this.banner){ this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }
    this.flashA = Math.max(0, this.flashA - dt*1.8);
    this.sharinganA = 0;
    this.swirl.strength *= Math.pow(0.25, dt); // decay; Kamui re-drives it
  }
  draw(){
    const {ctx: g, cv} = this;
    g.clearRect(0,0,cv.width,cv.height);
    if (this.flashA > 0){ g.fillStyle = `rgba(${this.flashColor},${this.flashA})`; g.fillRect(0,0,cv.width,cv.height); }
    for (const e of this.active) if (e.below) e.draw(g);
    this.parts.draw(g);
    for (const e of this.active) if (!e.below) e.draw(g);
    if (this.banner){
      const b = this.banner, k = b.t/b.life, pop = k<0.15 ? k/0.15 : 1;
      const size = Math.round(cv.width*0.075*pop);
      g.save();
      g.globalAlpha = k>0.7 ? 1-(k-0.7)/0.3 : 1;
      g.font = `900 ${size}px 'Arial Black', Arial, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = size*0.09; g.strokeStyle = 'rgba(40,20,0,0.9)';
      g.strokeText(b.text, cv.width/2, cv.height*0.82);
      g.fillStyle = b.color; g.fillText(b.text, cv.width/2, cv.height*0.82);
      g.restore();
    }
  }
}

class Rasengan {
  constructor(v, palm){ this.v=v; this.palm={...palm}; this.t=0; this.life=4.2; this.done=false; this.r=0; }
  update(dt, anchors){ this.t+=dt; if (anchors.palm){ this.palm.x += (anchors.palm.x-this.palm.x)*Math.min(1,dt*12); this.palm.y += (anchors.palm.y-this.palm.y)*Math.min(1,dt*12);} this.r = Math.min(1, this.r + dt*2.2);
    const W=this.v.cv.width, R = W*0.075*this.r;
    for (let i=0;i<6;i++){ const a=rand(0,7), d=rand(R*0.4,R);
      this.v.parts.spawn({x:this.palm.x+Math.cos(a)*d, y:this.palm.y+Math.sin(a)*d, vx:Math.cos(a+2.4)*180, vy:Math.sin(a+2.4)*180, size:rand(1.5,3.5), life:rand(0.2,0.5), color: Math.random()<0.5?'#9fd0ff':'#ffffff', drag:0.9}); }
    if (this.t>this.life) this.done=true;
  }
  draw(g){
    const R = this.v.cv.width*0.075*this.r, x=this.palm.x, y=this.palm.y;
    const spin = this.t*14;
    g.save(); g.globalCompositeOperation='lighter';
    g.drawImage(this.v.glowBlue, x-R*2.6, y-R*2.6, R*5.2, R*5.2);
    // swirling streaks
    for (let i=0;i<9;i++){
      const a0 = spin + i*0.7, r0 = R*(0.35+0.65*((i*37)%10)/10);
      g.strokeStyle = i%2 ? 'rgba(190,225,255,0.85)' : 'rgba(90,160,255,0.8)';
      g.lineWidth = R*0.13;
      g.beginPath(); g.arc(x, y, r0, a0, a0+rand(1.2,2.2)); g.stroke();
    }
    const core = g.createRadialGradient(x,y,0,x,y,R*0.85);
    core.addColorStop(0,'rgba(255,255,255,0.98)'); core.addColorStop(0.55,'rgba(150,205,255,0.75)'); core.addColorStop(1,'rgba(60,120,255,0)');
    g.fillStyle = core; g.beginPath(); g.arc(x,y,R*0.85,0,7); g.fill();
    g.restore();
  }
}

class Chidori {
  constructor(v, palm){ this.v=v; this.palm={...palm}; this.t=0; this.life=3.6; this.done=false; this.bolts=[]; }
  update(dt, anchors){ this.t+=dt; if (anchors.palm){ this.palm.x += (anchors.palm.x-this.palm.x)*Math.min(1,dt*14); this.palm.y += (anchors.palm.y-this.palm.y)*Math.min(1,dt*14);} 
    this.bolts = [];
    const R = this.v.cv.width*0.16;
    for (let i=0;i<7;i++){ const a=rand(0,7), pts=[{x:this.palm.x,y:this.palm.y}];
      let px=this.palm.x, py=this.palm.y;
      for (let s=0;s<5;s++){ px += Math.cos(a)*R/5 + rand(-R,R)*0.09; py += Math.sin(a)*R/5 + rand(-R,R)*0.09; pts.push({x:px,y:py}); }
      this.bolts.push(pts);
    }
    if (this.t>this.life) this.done=true;
  }
  draw(g){
    g.save(); g.globalCompositeOperation='lighter';
    g.drawImage(this.v.glowWhite, this.palm.x-140, this.palm.y-140, 280, 280);
    for (const pts of this.bolts){
      g.strokeStyle='rgba(160,210,255,0.9)'; g.lineWidth=5; g.shadowColor='#7ec8ff'; g.shadowBlur=18;
      g.beginPath(); g.moveTo(pts[0].x,pts[0].y); for(const p of pts.slice(1)) g.lineTo(p.x,p.y); g.stroke();
      g.strokeStyle='rgba(255,255,255,0.95)'; g.lineWidth=1.6;
      g.beginPath(); g.moveTo(pts[0].x,pts[0].y); for(const p of pts.slice(1)) g.lineTo(p.x,p.y); g.stroke();
    }
    g.restore();
  }
}

class Clones {
  below = true;
  constructor(v, frame){ this.v=v; this.frame=frame; this.t=0; this.life=5; this.done=false;
    this.copies = []; const W=v.cv.width, H=v.cv.height;
    const spots = [[-0.28,0.02,0.42],[0.26,-0.02,0.42],[-0.13,-0.06,0.5],[0.13,0.05,0.5],[0,-0.1,0.55],[-0.38,0.08,0.34],[0.4,0.06,0.34]];
    for (const [dx,dy,s] of spots) this.copies.push({x:W*(0.5+dx), y:H*(0.5+dy), s, a:0});
    this.smoke = [];
    for (const c of this.copies) for(let i=0;i<3;i++) this.smoke.push({x:c.x+rand(-80,80)*c.s*2, y:c.y+rand(0,140)*c.s, r:0, max:rand(70,150), a:0.85, vr:rand(120,220)});
  }
  update(dt){ this.t+=dt;
    for (const c of this.copies) c.a = Math.min(0.55, c.a + dt*0.8);
    for (const s of this.smoke){ s.r += s.vr*dt; s.a = Math.max(0, 0.85 - s.t*0 - (s.r/s.max)*0.85); }
    if (this.t>this.life) this.done=true;
  }
  draw(g){
    if (!this.frame) return;
    const W=this.v.cv.width, H=this.v.cv.height;
    g.save();
    for (const c of this.copies){
      const w = W*c.s*0.62, h = H*c.s*0.62;
      g.globalAlpha = c.a;
      g.drawImage(this.frame, c.x-w/2, c.y-h/2, w, h);
    }
    g.globalAlpha = 1;
    for (const s of this.smoke){ g.globalAlpha = s.a*0.7; g.drawImage(this.v.puff, s.x-s.r, s.y-s.r, s.r*2, s.r*2); }
    g.restore(); g.globalAlpha = 1;
  }
}

class Fireball {
  constructor(v, mouth){ this.v=v; this.mouth={...mouth}; this.t=0; this.life=2.6; this.done=false; v.flashA=0.55; v.flashColor='255,170,60'; }
  update(dt){ this.t+=dt;
    const n = this.t<1.8 ? 26 : 6;
    for (let i=0;i<n;i++){
      const sp = rand(200, 620), a = rand(-0.5,0.5);
      this.v.parts.spawn({x:this.mouth.x+rand(-14,14), y:this.mouth.y+rand(-8,8),
        vx:Math.sin(a)*sp*0.4, vy:Math.cos(a)*sp, size:rand(4,13), life:rand(0.5,1.1),
        color: ['#ffdd66','#ff9a33','#ff5a26','#ffe9b0'][Math.floor(rand(0,4))], drag:0.985, gravity:-160});
    }
    this.v.flashA = Math.max(this.v.flashA, this.t<0.5 ? 0.5 : 0);
    if (this.t>this.life) this.done=true;
  }
  draw(){}
}

class Summoning {
  below = true;
  constructor(v){ this.v=v; this.t=0; this.life=4.5; this.done=false; this.puffs=[];
    const W=v.cv.width, H=v.cv.height;
    for (let i=0;i<12;i++) this.puffs.push({x:rand(W*0.2,W*0.8), y:rand(H*0.55,H*0.95), r:0, max:rand(120,300), a:rand(0.5,0.95), vr:rand(140,300)});
  }
  update(dt){ this.t+=dt; for (const p of this.puffs){ p.r = Math.min(p.max, p.r + p.vr*dt); p.a *= Math.pow(0.4,dt); } if (this.t>this.life) this.done=true; }
  draw(g){
    const W=this.v.cv.width, H=this.v.cv.height;
    // summoning circle with runes on the ground
    const cx=W/2, cy=H*0.8, R=W*0.22*Math.min(1,this.t*2);
    g.save(); g.globalAlpha = Math.min(0.9, this.t*1.5) * (this.t>this.life-1 ? (this.life-this.t) : 1);
    g.strokeStyle='rgba(140,220,255,0.9)'; g.lineWidth=3; g.shadowColor='#5ab2ff'; g.shadowBlur=22;
    g.beginPath(); g.ellipse(cx,cy,R,R*0.32,0,0,7); g.stroke();
    g.beginPath(); g.ellipse(cx,cy,R*0.72,R*0.23,0,0,7); g.stroke();
    for (let i=0;i<10;i++){ const a=this.t*0.8+i/10*Math.PI*2;
      const x=cx+Math.cos(a)*R*0.86, y=cy+Math.sin(a)*R*0.27;
      g.save(); g.translate(x,y); g.rotate(a*0.4);
      g.fillStyle='rgba(170,230,255,0.95)'; g.fillRect(-6,-3,12,6); g.fillRect(-2,-7,4,14); g.restore();
    }
    g.restore();
    g.save();
    for (const p of this.puffs){ g.globalAlpha = Math.min(0.85,p.a); g.drawImage(this.v.puff, p.x-p.r, p.y-p.r, p.r*2, p.r*2); }
    g.restore(); g.globalAlpha=1;
  }
}

class Sharingan {
  constructor(v){ this.v=v; this.t=0; this.life=6; this.done=false; }
  update(dt){ this.t+=dt; if (this.t>this.life) this.done=true; }
  draw(g){
    const W=this.v.cv.width, H=this.v.cv.height, a=Math.min(1,this.t*2)*(this.t>this.life-1 ? this.life-this.t : 1);
    g.save();
    const grad = g.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.75);
    grad.addColorStop(0,'rgba(120,0,0,0)'); grad.addColorStop(1,`rgba(160,10,10,${0.55*a})`);
    g.fillStyle=grad; g.fillRect(0,0,W,H);
    g.restore();
    this.v.sharinganA = a; // main loop draws the eyes at face landmarks
  }
}

class Kamui {
  constructor(v){ this.v=v; this.t=0; this.life=3.4; this.done=false; }
  update(dt, anchors){ this.t+=dt;
    const p = anchors.face || anchors.palm || {x:this.v.cv.width/2, y:this.v.cv.height/2};
    this.v.swirl.x = p.x/this.v.cv.width; this.v.swirl.y = p.y/this.v.cv.height;
    const env = this.t<0.4 ? this.t/0.4 : (this.t>this.life-0.8 ? Math.max(0,(this.life-this.t)/0.8) : 1);
    this.v.swirl.strength = 14*env;
    if (this.t>this.life) this.done=true;
  }
  draw(){}
}

class Specter {
  below = true;
  constructor(v, tint, life){ this.v=v; this.t=0; this.life=life; this.done=false; this.tint=tint; }
  update(dt){ this.t+=dt; if (this.t>this.life) this.done=true; }
  draw(g){
    const W=this.v.cv.width, H=this.v.cv.height;
    const a = Math.min(1,this.t*1.4) * (this.t>this.life-1.2 ? Math.max(0,(this.life-this.t)/1.2) : 1);
    g.save();
    g.globalCompositeOperation='screen';
    g.globalAlpha = 0.85*a;
    if (this.v.specterReady){
      const h = H*1.15, w = h*(this.v.specter.width/this.v.specter.height);
      g.drawImage(this.v.specter, W/2-w/2, H-h+40, w, h);
    } else {
      // fallback aura (only until art loads)
      g.drawImage(this.v.glowRed, W/2-H*0.6, H*0.05, H*1.2, H*1.2);
    }
    g.restore();
    g.save(); g.globalCompositeOperation='lighter'; g.globalAlpha=0.35*a;
    g.drawImage(this.v.glowRed, 0, 0, W, H);
    g.restore();
  }
}

class Reaper {
  constructor(v){ this.v=v; this.t=0; this.life=7; this.done=false; this.specter = new Specter(v,'rgba(220,220,255,', 7); }
  update(dt){ this.t+=dt; this.specter.update(dt); if (this.t>this.life) this.done=true; }
  draw(g){
    const W=this.v.cv.width, H=this.v.cv.height;
    const a = Math.min(1,this.t*1.6)*(this.t>this.life-1 ? this.life-this.t : 1);
    // seal-script ring behind
    g.save(); g.globalAlpha=0.9*a;
    const cx=W/2, cy=H*0.42, R=H*0.36*Math.min(1,this.t);
    g.strokeStyle='rgba(235,235,255,0.9)'; g.lineWidth=4; g.shadowColor='#cfd8ff'; g.shadowBlur=26;
    g.beginPath(); g.arc(cx,cy,R,0,7); g.stroke();
    g.beginPath(); g.arc(cx,cy,R*0.78,0,7); g.stroke();
    for (let i=0;i<14;i++){ const ang = -this.t*0.5 + i/14*Math.PI*2;
      const x=cx+Math.cos(ang)*R*0.89, y=cy+Math.sin(ang)*R*0.89;
      g.save(); g.translate(x,y); g.rotate(ang+Math.PI/2);
      g.fillStyle='rgba(30,30,60,0.9)'; g.fillRect(-8,-14,16,28);
      g.strokeStyle='rgba(235,235,255,0.9)'; g.lineWidth=2; g.strokeRect(-8,-14,16,28);
      g.restore();
    }
    g.restore();
    this.specter.draw(g);
  }
}
