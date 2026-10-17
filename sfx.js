// sfx.js — all sounds synthesized with Web Audio. No audio files, no ripped anime audio.
let ctx = null, master = null, enabled = true, micStream = null, analyser = null, micData = null;

export function audioReady(){ return !!ctx; }
export function initAudio(){
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
}
export function setSound(on){ enabled = on; }
function env(g, t0, a, peak, d, sustain=0){
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0+a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain||0.0001), t0+a+d);
}
function noiseBuffer(sec=1){
  const b = ctx.createBuffer(1, ctx.sampleRate*sec, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
  return b;
}
function playNoise({dur=0.6, type='bandpass', freq=800, q=1, peak=0.5, sweep=null}={}){
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter(); f.type=type; f.frequency.setValueAtTime(freq,t0); f.Q.value=q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0+dur);
  const g = ctx.createGain(); env(g,t0,0.01,peak,dur);
  src.connect(f).connect(g).connect(master); src.start(t0); src.stop(t0+dur+0.1);
}
function playTone({freq=440, dur=0.4, type='sine', peak=0.3, slide=null, delay=0}={}){
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type=type; o.frequency.setValueAtTime(freq,t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0+dur);
  const g = ctx.createGain(); env(g,t0,0.01,peak,dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0+dur+0.1);
}
export const SFX = {
  tick:      () => playTone({freq:1200, dur:0.06, type:'square', peak:0.12}),
  rasengan:  () => { playNoise({dur:2.2, freq:1400, q:6, peak:0.5, sweep:2400}); playTone({freq:180, dur:2.2, type:'sawtooth', peak:0.16, slide:340}); },
  poof:      () => { playNoise({dur:0.5, freq:500, q:0.8, peak:0.6, sweep:120}); playNoise({dur:0.3, freq:2000, q:1, peak:0.2, delay:0}); },
  chidori:   () => { for(let i=0;i<14;i++) playTone({freq:2200+Math.random()*1600, dur:0.05, type:'square', peak:0.07, delay:i*0.07}); playNoise({dur:1.2, freq:3500, q:8, peak:0.25}); },
  fire:      () => { playNoise({dur:1.6, type:'lowpass', freq:900, q:0.6, peak:0.7, sweep:250}); playNoise({dur:1.0, freq:2600, q:2, peak:0.25, sweep:500}); },
  summon:    () => { playNoise({dur:0.9, freq:300, q:1, peak:0.7, sweep:80}); playTone({freq:70, dur:0.9, type:'sine', peak:0.5, slide:45}); },
  sharingan: () => { playTone({freq:660, dur:0.25, type:'sine', peak:0.25}); playTone({freq:880, dur:0.35, type:'sine', peak:0.25, delay:0.18}); playTone({freq:1320, dur:0.5, type:'sine', peak:0.2, delay:0.36}); },
  kamui:     () => { playNoise({dur:2.0, freq:600, q:4, peak:0.5, sweep:3000}); playTone({freq:220, dur:2.0, type:'sine', peak:0.2, slide:880}); },
  susano:    () => { playTone({freq:90, dur:1.8, type:'sawtooth', peak:0.35, slide:60}); playNoise({dur:1.8, freq:400, q:1.5, peak:0.35, sweep:150}); },
  reaper:    () => { playTone({freq:140, dur:2.4, type:'sawtooth', peak:0.3, slide:50}); playTone({freq:147, dur:2.4, type:'sawtooth', peak:0.3, slide:55}); playNoise({dur:2.4, freq:900, q:3, peak:0.2, sweep:200}); },
};
export function playSfx(name){ if (SFX[name]) SFX[name](); }

// mic blow detection (Fireball): RMS level via analyser
export async function initMic(){
  if (micStream) return true;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const src = ctx.createMediaStreamSource(micStream);
    analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    micData = new Uint8Array(analyser.fftSize);
    src.connect(analyser);
    return true;
  } catch(e){ return false; }
}
export function blowLevel(){
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(micData);
  let sum = 0;
  for (let i=0;i<micData.length;i++){ const v = (micData[i]-128)/128; sum += v*v; }
  return Math.sqrt(sum/micData.length); // ~0.01 quiet, >0.08 blow
}
