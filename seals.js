// seals.js — geometric hand-seal classifier over MediaPipe 21-pt hand landmarks.
// Pure module: runs in the browser and in Node (for tests). No DOM, no deps.
//
// Input:  hands = [{ landmarks: [{x,y,z} x21], handedness: 'Left'|'Right', score }]
// Output: { seal, confidence, scores, features }
//
// The 12 zodiac seals are two-handed in canon; on a webcam we score practical,
// distinguishable approximations of each, for one or two visible hands.

export const SEAL_NAMES = [
  'Rat','Ox','Tiger','Hare','Dragon','Serpent','Horse','Ram','Monkey','Bird','Dog','Boar',
  'Open Palm','Fist'
];
export const NO_SEAL = 'No Seal';
export const TWO_HAND_SEALS = ['Ox','Dragon','Serpent','Horse','Ram','Monkey','Bird','Dog','Boar','Hare'];

const FINGERS = { index:[5,6,7,8], middle:[9,10,11,12], ring:[13,14,15,16], pinky:[17,18,19,20] };

// ---------- vector helpers ----------
const sub = (a,b) => ({x:a.x-b.x, y:a.y-b.y, z:(a.z||0)-(b.z||0)});
const dot = (a,b) => a.x*b.x + a.y*b.y + a.z*b.z;
const cross = (a,b) => ({x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x});
const mag = (a) => Math.hypot(a.x, a.y, a.z);
const dist = (a,b) => mag(sub(a,b));
const norm = (a) => { const m = mag(a) || 1e-9; return {x:a.x/m, y:a.y/m, z:a.z/m}; };
function angle(a,b,c){ const u=norm(sub(a,b)), v=norm(sub(c,b)); const d=Math.max(-1,Math.min(1,dot(u,v))); return Math.acos(d)*180/Math.PI; }
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ramp = (x, lo, hi) => clamp01((x-lo)/(hi-lo));

// ---------- per-hand features ----------
export function handFeatures(lm, handedness){
  const size = dist(lm[0], lm[9]) || 1e-6; // wrist -> middle MCP
  const f = {};
  for (const [name,[mcp,pip,,tip]] of Object.entries(FINGERS)){
    const interior = angle(lm[mcp], lm[pip], lm[tip]); // 180 = straight
    const bend = 180 - interior;                        // 0 straight .. ~170 folded
    f[name] = {
      bend,
      ext:  clamp01((28 - bend) / 22),                  // straight finger
      half: clamp01(1 - Math.abs(bend - 70) / 55),      // claw / half-curled
      fold: ramp(bend, 72, 108),                        // folded into palm
      tip: lm[tip], mcp: lm[mcp], pip: lm[pip],
    };
  }
  // thumb: tucked = tip near palm/pinky MCP; extended = far, pointing out
  const tAway = dist(lm[4], lm[17]) / size;
  f.thumb = {
    ext: ramp(tAway, 0.85, 1.25),
    fold: ramp(1.0 - tAway, 0, 0.5),
    away: tAway, tip: lm[4], mcp: lm[1],
  };

  const n = norm(cross(sub(lm[5], lm[0]), sub(lm[17], lm[0])));
  const palmToCam = handedness === 'Right' ? n.z < 0 : n.z > 0;
  const up = norm(sub(lm[9], lm[0])); // image coords: up hand => (0,-1)
  const extCount = ['index','middle','ring','pinky'].filter(k => f[k].ext > 0.5).length;
  // tips pressed together relative to their knuckle spacing
  const together = (a,b) => {
    const mcpD = dist(f[a].mcp, f[b].mcp) || 1e-6;
    return clamp01(1.15 - dist(f[a].tip, f[b].tip) / mcpD);
  };
  return { size, f, normal: n, palmToCam, up, extCount, together,
           center: {x:(lm[0].x+lm[9].x)/2, y:(lm[0].y+lm[9].y)/2, z:(lm[0].z+lm[9].z)/2},
           lm, handedness };
}

// ---------- two-hand relations ----------
function pairFeatures(A, B){
  const s = (A.size + B.size) / 2;
  const dCenter = dist(A.center, B.center) / s;
  const dWrist  = dist(A.lm[0], B.lm[0]) / s;
  let tipSum = 0;
  for (const k of ['index','middle','ring','pinky']){
    tipSum += Math.min(dist(A.f[k].tip, B.f[k].tip), dist(A.f[k].tip, B.f[k].mcp)) / s;
  }
  const tipTouch = clamp01(1 - (tipSum/4) / 0.8);
  const oppNormal = clamp01((-dot(A.normal, B.normal) + 1) / 2);
  const palmsTogether = ramp(1.5 - dCenter, 0, 0.8) * oppNormal;
  const dz = Math.abs(A.lm[0].z - B.lm[0].z) / s;
  const dxy = Math.hypot(A.center.x-B.center.x, A.center.y-B.center.y) / s;
  const stacked = ramp(1.0 - dxy, 0, 0.7);
  const close = ramp(2.2 - dCenter, 0, 1.4);
  return { dCenter, dWrist, tipTouch, palmsTogether, stacked, close, dz, dxy };
}

// ---------- seal scoring ----------
function scoreSeals(hands){
  const hs = hands.map(h => handFeatures(h.landmarks, h.handedness));
  const S = {};
  if (hs.length === 0) return { S, hs, P: null };
  const H = hs[0], H2 = hs[1] || null;
  const P = H2 ? pairFeatures(H, H2) : null;
  const idxMid = (h) => Math.min(h.f.index.ext, h.f.middle.ext);
  const ringPinkyFold = (h) => Math.min(h.f.ring.fold, h.f.pinky.fold);
  const allFold = (h) => Math.min(h.f.index.fold, h.f.middle.fold, h.f.ring.fold, h.f.pinky.fold);
  const allExt  = (h) => Math.min(h.f.index.ext, h.f.middle.ext, h.f.ring.ext, h.f.pinky.ext);
  const allHalf = (h) => Math.min(h.f.index.half, h.f.middle.half, h.f.ring.half, h.f.pinky.half);

  // Open Palm: 4 fingers extended, spread, palm roughly to camera
  const spread = clamp01((dist(H.f.index.tip, H.f.pinky.tip) / H.size - 0.75) / 0.5);
  S['Open Palm'] = allExt(H) * (0.65 + 0.35*spread) * (H.palmToCam ? 1 : ramp(Math.abs(H.normal.z), 0.25, 0.7));

  // Fist: all folded
  S['Fist'] = allFold(H) * (H2 ? 0.8 : 1);

  // Tiger: index+middle extended & pressed, ring+pinky folded (one or both hands)
  const tiger1 = idxMid(H) * ringPinkyFold(H) * H.together('index','middle');
  let tiger2 = 0;
  if (H2) tiger2 = Math.min(idxMid(H), idxMid(H2)) * Math.min(ringPinkyFold(H), ringPinkyFold(H2))
                 * Math.min(H.together('index','middle'), H2.together('index','middle')) * P.close;
  S['Tiger'] = Math.max(tiger1, tiger2);

  // Rat: Tiger shape pointing DOWN
  const down = (h) => ramp(h.up.y, 0.35, 0.7);
  S['Rat'] = idxMid(H) * ringPinkyFold(H) * down(H);

  // Ram: both hands Tiger-shape, overlapped front/back in depth
  S['Ram'] = H2 ? Math.min(idxMid(H), idxMid(H2)) * Math.min(ringPinkyFold(H), ringPinkyFold(H2))
                  * P.stacked * ramp(P.dz, 0.12, 0.45) : 0;

  // Serpent: prayer — palms together, all fingers extended upward
  const up2 = (h) => ramp(-h.up.y, 0.3, 0.7);
  S['Serpent'] = H2 ? P.palmsTogether * Math.min(allExt(H), allExt(H2)) * Math.min(up2(H), up2(H2)) : 0;

  // Monkey: palms facing each other (one up, one down), fingers extended, stacked
  S['Monkey'] = H2 ? P.stacked * Math.min(allExt(H), allExt(H2)) * ramp(-dot(H.normal, H2.normal), 0.5, 0.9) : 0;

  // Ox: clasped fists with thumbs extended
  const clasped = H2 ? P.close * Math.min(allFold(H), allFold(H2)) : 0;
  S['Ox'] = clasped * Math.min(H.f.thumb.ext, H2 ? H2.f.thumb.ext : 0);

  // Boar: two fists touching, knuckles in, thumbs tucked
  S['Boar'] = H2 ? Math.min(allFold(H), allFold(H2)) * ramp(1.3 - P.dWrist, 0, 0.8)
                   * Math.min(H.f.thumb.fold, H2.f.thumb.fold) * ramp(-dot(H.up, H2.up), 0.1, 0.6) : 0;

  // Dragon: fingertip tent — corresponding fingertips touch, fingers half-curled, thumbs out
  S['Dragon'] = H2 ? P.tipTouch * Math.min(allHalf(H), allHalf(H2)) : 0;

  // Horse: index fingertips touch, rest folded
  const idxTipTouch = H2 ? clamp01(1 - dist(H.f.index.tip, H2.f.index.tip) / (0.55*((H.size+H2.size)/2))) : 0;
  S['Horse'] = H2 ? idxTipTouch * H.f.index.ext * H2.f.index.ext
                    * Math.min(ringPinkyFold(H), ringPinkyFold(H2))
                    * Math.min(H.f.middle.fold, H2.f.middle.fold) : 0;

  // Bird: claw hands facing each other, thumbs out
  S['Bird'] = H2 ? Math.min(allHalf(H), allHalf(H2)) * ramp(-dot(H.normal, H2.normal), 0.3, 0.8)
                   * Math.min(H.f.thumb.ext, H2.f.thumb.ext) * P.close : 0;

  // Dog: one flat open hand (palm up), other fist resting on it
  if (H2){
    const flatUp = (h) => allExt(h) * ramp(Math.abs(h.normal.y) > 0 ? -h.normal.y : 0, 0.4, 0.8); // palm up: normal +y? image y down => palm up means normal points down => n.y>0? handled below
    const a = allExt(H) * allFold(H2), b = allExt(H2) * allFold(H);
    S['Dog'] = Math.max(a,b) * P.stacked * ramp(P.dz, 0.08, 0.35);
  } else S['Dog'] = 0;

  // Hare: one hand flat horizontal extended, other half-curled resting on top
  if (H2){
    const flatH = (h) => allExt(h) * ramp(1 - Math.abs(h.up.y), 0.25, 0.6);
    S['Hare'] = Math.max(flatH(H)*allHalf(H2), flatH(H2)*allHalf(H)) * P.stacked * ramp(P.dz, 0.08, 0.35);
  } else S['Hare'] = 0;

  return { S, hs, P };
}

// ---------- temporal smoothing ----------
export class SealSmoother {
  constructor(windowSize = 7, holdMs = 250){
    this.win = [];
    this.windowSize = windowSize;
    this.stable = NO_SEAL;
    this.stableConf = 0;
    this.lastSwitch = 0;
    this.holdMs = holdMs;
  }
  push(seal, conf, now = performance.now()){
    this.win.push({seal, conf});
    if (this.win.length > this.windowSize) this.win.shift();
    const votes = {};
    for (const w of this.win) votes[w.seal] = (votes[w.seal] || 0) + w.conf;
    let best = NO_SEAL, bestV = 0, total = 0;
    for (const [k,v] of Object.entries(votes)){ total += v; if (v > bestV){ bestV = v; best = k; } }
    const frac = total > 0 ? bestV/total : 0;
    if (best !== this.stable){
      if (now - this.lastSwitch >= this.holdMs && frac >= 0.5){
        this.stable = best; this.stableConf = frac; this.lastSwitch = now;
      }
    } else {
      this.stableConf = frac;
    }
    return { seal: this.stable, confidence: this.stableConf };
  }
  reset(){ this.win = []; this.stable = NO_SEAL; this.stableConf = 0; }
}

// ---------- main entry ----------
export function classifySeals(hands, minConf = 0.45){
  const { S } = scoreSeals(hands);
  if (!hands.length) return { seal: NO_SEAL, confidence: 1, scores: S, handCount: 0 };
  let best1h = {name: NO_SEAL, s: 0}, best2h = {name: NO_SEAL, s: 0};
  for (const [name, sc] of Object.entries(S)){
    const two = TWO_HAND_SEALS.includes(name);
    if (two && sc > best2h.s) best2h = {name, s: sc};
    if (!two && sc > best1h.s) best1h = {name, s: sc};
  }
  // two-hand seals win ties: when the user holds a two-hand pose, single-hand
  // sub-shapes (open palm etc.) must not steal the label.
  let pick = best1h.s >= best2h.s ? best1h : best2h;
  if (best2h.s >= 0.5 && best2h.s >= best1h.s - 0.2) pick = best2h;
  if (pick.s < minConf) return { seal: NO_SEAL, confidence: Math.round((1-pick.s)*100)/100, scores: S, handCount: hands.length };
  return { seal: pick.name, confidence: Math.round(pick.s*100)/100, scores: S, handCount: hands.length };
}
