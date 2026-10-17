// fxgl.js — WebGL shader layer for energy VFX. All effects are original procedural shaders.
const VERT = 'attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x*0.5+0.5, p.y*0.5+0.5); gl_Position = vec4(p,0.,1.); }';

const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y); }
float fbm(vec2 p, float oct){
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ if(float(i)>=oct) break; v+=a*noise(p); p*=2.03; a*=0.5; }
  return v;
}`;

// Rasengan: layered spiraling energy sphere
const FRAG_RASENGAN = `precision mediump float; varying vec2 v;
uniform vec2 uC; uniform float uR; uniform float uT; uniform float uAspect; uniform float uAlpha; uniform float uOct;
${NOISE}
void main(){
  vec2 d = v - uC; d.x *= uAspect;
  float r = length(d) / uR;
  float a = atan(d.y, d.x);
  float sw = a*3.0 + uT*8.0 - r*8.0;
  float streak = fbm(vec2(sw, r*5.5 - uT*3.0), uOct);
  streak = pow(streak, 1.4);
  float streak2 = fbm(vec2(sw*0.5 + 3.7, r*9.0 + uT*4.0), uOct);
  streak2 = pow(streak2, 2.0);
  float core = smoothstep(0.62, 0.05, r);
  float body = smoothstep(1.0, 0.3, r);
  float rim  = smoothstep(1.28, 0.95, r) * (1.0 - body);
  float flick = 0.92 + 0.08*sin(uT*43.0);
  vec3 col = vec3(1.15,1.2,1.25)*core
           + vec3(0.55,0.8,1.2) * streak * body * 1.7
           + vec3(0.75,0.95,1.3) * streak2 * body * 0.9
           + vec3(0.2,0.5,1.05) * rim * 0.55;
  float alpha = clamp(core*1.3 + (streak*1.3 + streak2*0.8)*body + rim*0.9, 0.0, 1.0);
  gl_FragColor = vec4(col*flick, alpha) * uAlpha;
}`;

// Chidori: branching lightning arcs + white core
const FRAG_CHIDORI = `precision mediump float; varying vec2 v;
uniform vec2 uC; uniform float uR; uniform float uT; uniform float uAspect; uniform float uAlpha; uniform float uSeed;
${NOISE}
float arc(vec2 d, float baseA, float seed, float t, float len){
  float r = length(d);
  float a = atan(d.y, d.x);
  float da = mod(a - baseA + 3.14159265, 6.2831853) - 3.14159265;
  float wob = (noise(vec2(r*7.0 - t*26.0, seed*17.3)) - 0.5) * (0.5 + r*2.6);
  wob += (noise(vec2(r*16.0 - t*34.0, seed*29.1)) - 0.5) * 0.35;
  float dist = abs(da - wob*0.30) * (r*8.0 + 0.4);
  return exp(-dist*dist*5.5) * smoothstep(len, len*0.25, r);
}
void main(){
  vec2 d = v - uC; d.x *= uAspect;
  float r = length(d) / uR;
  float t = uT;
  float s = 0.0;
  for (int i=0;i<9;i++){
    float fi = float(i);
    s += arc(d/uR, uSeed + fi*0.698, uSeed + fi*3.1, t, 1.3);
  }
  for (int i=0;i<5;i++){
    float fi = float(i);
    s += 0.55 * arc(d/uR, uSeed*1.7 + fi*1.256 + 0.3, uSeed + fi*7.7 + 11.0, t*1.3, 0.62);
  }
  float core = smoothstep(0.34, 0.0, r);
  float halo = smoothstep(1.15, 0.2, r) * 0.4;
  vec3 col = vec3(0.65,0.8,1.25) * s * 1.35
           + vec3(1.25,1.28,1.3) * core * 1.6
           + vec3(0.5,0.65,1.15) * halo;
  float alpha = clamp(s*1.1 + core*1.5 + halo, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha) * uAlpha;
}`;

// Fireball: layered turbulent flame ball with blackbody palette
const FRAG_FIREBALL = `precision mediump float; varying vec2 v;
uniform vec2 uC; uniform float uGrow; uniform float uT; uniform float uAspect; uniform float uAlpha; uniform float uOct;
${NOISE}
void main(){
  vec2 d = v - uC; d.x *= uAspect;
  float rr = length(d);
  float r = rr / uGrow;
  float a = atan(d.y, d.x);
  // billowing edge: radius modulated by angular noise scrolling fast
  float edge = fbm(vec2(a*2.2, uT*2.6), uOct) * 0.45;
  float body = smoothstep(1.0 + edge, 0.35 + edge*0.5, r);
  // internal turbulence scrolling outward
  vec2 p = vec2(a*2.6, r*3.2 - uT*3.4);
  float warp = fbm(p + vec2(0.0, -uT*2.2), uOct);
  float f1 = fbm(p*1.8 + warp*2.0, uOct);
  float f2 = fbm(p*4.2 - vec2(0.0, uT*5.0), uOct);
  float flame = pow(clamp(f1*0.8 + f2*0.5, 0.0, 1.3), 1.25);
  float heat = flame * body;
  float hotCore = smoothstep(0.45, 0.0, r) * (0.65 + 0.35*flame);
  vec3 col = vec3(0.8,0.1,0.01) * heat * 0.9
           + vec3(1.1,0.52,0.05) * heat * flame * 1.6
           + vec3(1.25,1.0,0.5) * hotCore
           + vec3(1.3,1.2,0.9) * smoothstep(0.16,0.0,r);
  float alpha = clamp(heat*1.6 + hotCore*1.2, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha) * uAlpha;
}`;

// Aura: rising chakra flames (Susano / Reaper dark version)
const FRAG_AURA = `precision mediump float; varying vec2 v;
uniform float uT; uniform float uAlpha; uniform float uOct; uniform vec3 uColA; uniform vec3 uColB; uniform float uCenter; uniform float uWidth;
${NOISE}
void main(){
  float cx = (v.x - uCenter) / uWidth; // 0 at center
  float rise = fbm(vec2(v.x*5.0, v.y*3.0 - uT*1.8), uOct);
  float lick = fbm(vec2(v.x*11.0 + 7.0, v.y*5.0 - uT*3.2), uOct);
  float f = rise*0.7 + lick*0.5;
  float body = smoothstep(1.0, 0.2, abs(cx)) * smoothstep(1.05, 0.25, v.y + f*0.35);
  float flame = clamp(f*body*1.6 - 0.12, 0.0, 1.0);
  vec3 col = mix(uColA, uColB, flame) * flame * 1.7;
  gl_FragColor = vec4(col, flame) * uAlpha;
}`;

const PROGS = { rasengan: FRAG_RASENGAN, chidori: FRAG_CHIDORI, fireball: FRAG_FIREBALL, aura: FRAG_AURA };

export class FXGL {
  constructor(canvas){
    this.cv = canvas;
    this.ok = false;
    this.progs = {};
    try {
      const gl = this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
      if (!gl) return;
      const mk = (t, src) => { const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn('shader:', gl.getShaderInfoLog(sh));
        return sh; };
      const vs = mk(gl.VERTEX_SHADER, VERT);
      for (const [name, fs] of Object.entries(PROGS)){
        const p = gl.createProgram();
        gl.attachShader(p, vs); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn('link:', gl.getProgramInfoLog(p));
        this.progs[name] = { p, u: {} };
      }
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      this.buf = buf;
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied additive-ish
      this.ok = true;
    } catch(e){ console.warn('FXGL unavailable', e); }
    this.items = [];
  }
  resize(w,h){ this.cv.width=w; this.cv.height=h; }
  spawn(type, params){ const it = { type, t:0, ...params }; this.items.push(it); return it; }
  remove(it){ const i=this.items.indexOf(it); if (i>=0) this.items.splice(i,1); }
  draw(dt){
    if (!this.ok) return;
    const gl = this.gl, W=this.cv.width, H=this.cv.height;
    if (this.cv.width===0) return;
    gl.viewport(0,0,W,H);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    for (const it of this.items){
      it.t += dt;
      const pr = this.progs[it.type]; if (!pr) continue;
      gl.useProgram(pr.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      const loc = gl.getAttribLocation(pr.p,'p');
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
      const U = (n,x,y,z) => { const l=gl.getUniformLocation(pr.p,n); if(!l) return;
        if (z!==undefined) gl.uniform3f(l,x,y,z); else if (y!==undefined) gl.uniform2f(l,x,y); else gl.uniform1f(l,x); };
      U('uT', it.t + (it.t0||0));
      U('uAspect', W/H);
      U('uAlpha', it.alpha!==undefined ? it.alpha : 1);
      U('uOct', it.oct||4);
      if (it.type==='rasengan' || it.type==='chidori'){
        U('uC', it.x/W, 1 - it.y/H);
        U('uR', it.r/H * (H/W) * (W/H)); // radius relative to height, aspect-corrected below
        U('uR', it.r / H);
        U('uSeed', it.seed||0);
      } else if (it.type==='fireball'){
        U('uC', it.x/W, 1 - it.y/H);
        U('uGrow', it.grow / H);
      } else if (it.type==='aura'){
        U('uColA', it.colA[0], it.colA[1], it.colA[2]);
        U('uColB', it.colB[0], it.colB[1], it.colB[2]);
        U('uCenter', it.centerX!==undefined?it.centerX:0.5);
        U('uWidth', it.width||0.5);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
}
