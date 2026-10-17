// main.js — Shinobi hand-sign recognition. Live webcam -> seals -> jutsu VFX+SFX.
import { classifySeals, SealSmoother, NO_SEAL } from './seals.js';
import { JutsuEngine, JUTSU } from './jutsu.js';
import { VFX } from './vfx.js';
import { initAudio, playSfx, initMic, blowLevel, setSound, audioReady } from './sfx.js';
import { createTrackers, drawSkeleton } from './tracker.js';
import { drawHUD } from './hud.js';

const MIRROR = true;
const video = document.getElementById('cam');
const glc = document.getElementById('gl');
const overlay = document.getElementById('fx');
const octx = overlay.getContext('2d');
const statusEl = document.getElementById('status');
const setStatus = (t) => statusEl.textContent = t;

let trackers = null, vfx = null, engine = new JutsuEngine(), smoother = new SealSmoother(7, 250);
let lastT = 0, fps = 0, fpsAcc = 0, fpsN = 0, fpsShow = 0;
let lastVideoTime = -1;
let faceCache = null, faceFrame = 0;
let pending = null;      // jutsu waiting for blow/slap: {jutsu, since}
let palmTrail = [];      // for slap velocity
let sharinganEyes = null;

// ---------- WebGL video + swirl ----------
let gl = null, glProg = null, glTex = null, glOK = false;
const VERT = 'attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.,1.); }';
const FRAG = `precision mediump float; varying vec2 v; uniform sampler2D t; uniform vec2 c; uniform float s; uniform float aspect;
void main(){
  vec2 uv = v; vec2 d = uv - c; d.x *= aspect; float r = length(d);
  float ang = s * exp(-r*3.0);
  float ca = cos(ang), sa = sin(ang);
  d = vec2(d.x*ca - d.y*sa, d.x*sa + d.y*ca); d.x /= aspect;
  gl_FragColor = texture2D(t, c + d);
}`;
function initGL(){
  try {
    gl = glc.getContext('webgl', { preserveDrawingBuffer: false });
    if (!gl) return;
    const mk = (t,src) => { const sh = gl.createShader(t); gl.shaderSource(sh,src); gl.compileShader(sh); return sh; };
    glProg = gl.createProgram();
    gl.attachShader(glProg, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(glProg, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(glProg); gl.useProgram(glProg);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(glProg,'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    glTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    glOK = true;
  } catch(e){ console.warn('WebGL unavailable, Kamui swirl disabled', e); }
}
function drawVideo(swirl){
  const w = glc.width, h = glc.height;
  if (glOK){
    gl.viewport(0,0,w,h);
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.uniform2f(gl.getUniformLocation(glProg,'c'), MIRROR ? 1-swirl.x : swirl.x, swirl.y);
    gl.uniform1f(gl.getUniformLocation(glProg,'s'), swirl.strength);
    gl.uniform1f(gl.getUniformLocation(glProg,'aspect'), w/h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

// ---------- boot ----------
async function boot(){
  setStatus('Loading models...');
  initGL();
  trackers = await createTrackers();
  vfx = new VFX(overlay);
  setStatus('Starting camera...');
  const params = new URLSearchParams(location.search);
  if (params.get('source') === 'video'){
    // Dev/test mode: play a video file through the exact same pipeline.
    const input = document.getElementById('testfile');
    input.style.display = 'block';
    input.onchange = () => {
      const f = input.files[0]; if (!f) return;
      video.src = URL.createObjectURL(f); video.loop = true; video.muted = false; video.play();
      setStatus('Test video mode');
      requestAnimationFrame(loop);
    };
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width:1280, height:720 }, audio: false });
    video.srcObject = stream;
    await video.play();
    setStatus('');
    requestAnimationFrame(loop);
  } catch(e){
    setStatus('Camera access denied. Allow webcam permission and reload. (Or use ?source=video with a file.)');
  }
}

function anchorsFrom(landmarksList, W, H){
  // palm anchor: first hand's palm center (index MCP avg wrist); mouth: face lips (13); face: face center
  const out = {};
  if (landmarksList.length){
    const lm = landmarksList[0];
    const x = (lm[0].x*0.4 + lm[9].x*0.6), y = (lm[0].y*0.4 + lm[9].y*0.6);
    out.palm = { x: (MIRROR?1-x:x)*W, y: y*H };
  }
  if (faceCache && faceCache.faceLandmarks && faceCache.faceLandmarks.length){
    const fl = faceCache.faceLandmarks[0];
    const mx = fl[13].x, my = fl[13].y; // inner lips
    out.mouth = { x: (MIRROR?1-mx:mx)*W, y: my*H };
    const fx = fl[1].x, fy = fl[1].y;
    out.face = { x: (MIRROR?1-fx:fx)*W, y: fy*H };
    out.eyes = [ {x:(MIRROR?1-fl[468].x:fl[468].x)*W, y:fl[468].y*H}, {x:(MIRROR?1-fl[473].x:fl[473].x)*W, y:fl[473].y*H} ];
    out.eyeDist = Math.abs(fl[468].x - fl[473].x)*W;
  }
  return out;
}

function detectSlap(anchors){
  // both palms open + fast downward motion + low in frame
  palmTrail.push({ y: anchors.palm ? anchors.palm.y : null, t: performance.now() });
  if (palmTrail.length > 10) palmTrail.shift();
  if (palmTrail.length < 3 || !anchors.palm) return false;
  const a = palmTrail[0], b = palmTrail[palmTrail.length-1];
  const vy = (b.y - a.y) / ((b.t - a.t)/1000); // px/s, +down
  return vy > overlay.height*1.6 && b.y > overlay.height*0.55;
}

async function loop(ts){
  requestAnimationFrame(loop);
  const W = overlay.width = glc.width = video.videoWidth || 1280;
  const H = overlay.height = glc.height = video.videoHeight || 720;
  const dt = lastT ? (ts - lastT)/1000 : 0.016; lastT = ts;
  fpsAcc += 1/Math.max(dt,1e-4); fpsN++;
  if (fpsN >= 15){ fpsShow = Math.round(fpsAcc/fpsN); fpsAcc=0; fpsN=0; }

  let seal = NO_SEAL, conf = 1, hands = [];
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime){
    lastVideoTime = video.currentTime;
    const res = trackers.hand.detectForVideo(video, ts);
    hands = res.landmarks.map((lm,i) => ({ landmarks: lm, handedness: res.handedness[i]?.[0]?.categoryName || 'Right', score: res.handedness[i]?.[0]?.score || 0 }));
    if (trackers.face && (faceFrame++ % 3 === 0)){
      try { faceCache = trackers.face.detectForVideo(video, ts); } catch(e){}
    }
  }
  const raw = classifySeals(hands);
  const sm = smoother.push(raw.seal, raw.confidence);
  seal = sm.seal; conf = sm.confidence;

  const anchors = anchorsFrom(hands.map(h=>h.landmarks), W, H);

  // hold-trigger (Rasengan)
  const ras = JUTSU.find(j=>j.id==='rasengan');
  const charge = engine.holdProgress('rasengan', seal, dt*1000);
  if (charge >= 1 && !pending){
    fireJutsu(ras, anchors);
  }

  // sequence engine
  const fired = seal !== NO_SEAL ? engine.update(seal, ts, dt*1000) : null;
  if (fired && !pending){
    if (fired.needsBlow){
      pending = { jutsu: fired, since: ts };
      if (audioReady()) initMic();
    } else if (fired.needsSlap){
      pending = { jutsu: fired, since: ts };
    } else {
      fireJutsu(fired, anchors);
    }
  }

  // pending blow/slap resolution
  let prompt = null;
  if (pending){
    if (pending.jutsu.needsBlow){
      prompt = 'Fireball: Hold Tiger & BLOW!';
      if (blowLevel() > 0.07){ fireJutsu(pending.jutsu, anchors); pending = null; }
      else if (ts - pending.since > 9000){ pending = null; }
    } else if (pending.jutsu.needsSlap){
      prompt = 'SLAP HANDS!';
      if (detectSlap(anchors)){ fireJutsu(pending.jutsu, anchors); pending = null; }
      else if (ts - pending.since > 9000){ pending = null; }
    }
  }

  // effects + draw
  vfx.update(dt, anchors);
  drawVideo(vfx.swirl);
  if (vfx.sharinganA !== undefined) sharinganEyes = vfx.sharinganA;
  for (const h of hands) drawSkeleton(octx, h.landmarks, W, H, MIRROR);
  vfx.draw();
  if (sharinganEyes > 0 && anchors.eyes){
    octx.save(); octx.globalCompositeOperation='lighter'; octx.globalAlpha=sharinganEyes;
    for (const e of anchors.eyes){
      const r = (anchors.eyeDist||60)*0.22;
      octx.fillStyle='#e01313'; octx.beginPath(); octx.arc(e.x,e.y,r,0,7); octx.fill();
      octx.fillStyle='#1a0000'; octx.beginPath(); octx.arc(e.x,e.y,r*0.34,0,7); octx.fill();
      octx.strokeStyle='#2b0000'; octx.lineWidth=2; octx.beginPath(); octx.arc(e.x,e.y,r*0.72,0,7); octx.stroke();
      for (let i=0;i<3;i++){ const a=ts/300 + i*2.09;
        octx.beginPath(); octx.arc(e.x+Math.cos(a)*r*0.72, e.y+Math.sin(a)*r*0.72, r*0.13,0,7); octx.fill(); }
    }
    octx.restore();
  } else if (!sharinganEyes || !anchors.eyes){ sharinganEyes = null; }

  const prog = engine.promptText();
  drawHUD(octx, W, H, {
    seal, conf, fps: fpsShow,
    counter: prog || (charge>0.02 ? `Rasengan Charge: ${Math.round(charge*100)}%` : null),
    prompt,
  });
}

function fireJutsu(j, anchors){
  const frame = document.createElement('canvas');
  frame.width = video.videoWidth||1280; frame.height = video.videoHeight||720;
  const fx = frame.getContext('2d');
  fx.translate(frame.width,0); fx.scale(-1,1);
  fx.drawImage(video,0,0);
  vfx.trigger(j.effect, { ...anchors, frame });
  vfx.setBanner(j.banner, j.bannerColor);
  playSfx(j.sound);
  engine.resetAll();
}

document.getElementById('sound').onchange = (e) => setSound(e.target.checked);
document.body.addEventListener('click', () => initAudio(), { once:true });
document.getElementById('start').onclick = () => { initAudio(); boot(); document.getElementById('start').remove(); };
