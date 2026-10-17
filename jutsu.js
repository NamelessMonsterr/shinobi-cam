// jutsu.js — jutsu registry + seal-sequence engine. Pure module (browser + Node).
// Add a jutsu by appending an entry: name, seal sequence, effect, sound, banner.

export const JUTSU = [
  { id:'rasengan',     name:'Rasengan',           banner:'RASENGAN!',         bannerColor:'#ff8c1a',
    sequence:['Open Palm'], holdMs:1100, counter:'Rasengan Charge',
    effect:'rasengan', sound:'rasengan' },
  { id:'shadow_clone', name:'Shadow Clone Jutsu', banner:'SHADOW CLONE!',     bannerColor:'#ffe14d',
    sequence:['Ram','Serpent','Tiger'], counter:'Clone Signs',
    effect:'clones', sound:'poof' },
  { id:'chidori',      name:'Chidori',            banner:'CHIDORI!',          bannerColor:'#7ec8ff',
    sequence:['Ox','Hare','Monkey'], counter:'Chidori Signs',
    effect:'chidori', sound:'chidori' },
  { id:'fireball',     name:'Fireball Jutsu',     banner:'FIREBALL JUTSU!',   bannerColor:'#ff5a26',
    sequence:['Serpent','Ram','Monkey','Boar','Horse','Tiger'], counter:'Fireball Signs',
    effect:'fireball', sound:'fire', needsBlow:true },
  { id:'summoning',    name:'Summoning Jutsu',    banner:'SUMMONING JUTSU!',  bannerColor:'#d7c8ff',
    sequence:['Boar','Dog','Bird','Monkey','Ram'], counter:'Summoning Signs',
    effect:'summoning', sound:'summon', needsSlap:true },
  { id:'sharingan',    name:'Sharingan',          banner:'SHARINGAN!',        bannerColor:'#ff3b3b',
    sequence:['Dragon'], counter:'Sharingan Signs',
    effect:'sharingan', sound:'sharingan' },
  { id:'kamui',        name:'Kamui',              banner:'KAMUI!',            bannerColor:'#c44dff',
    sequence:['Bird','Tiger'], counter:'Kamui Signs',
    effect:'kamui', sound:'kamui' },
  { id:'susano',       name:"Susano'o",           banner:"SUSANO'O!",         bannerColor:'#ff6b6b',
    sequence:['Serpent','Ox','Ram'], counter:"Susano'o Signs",
    effect:'susano', sound:'susano' },
  { id:'reaper',       name:'Reaper Death Seal',  banner:'REAPER DEATH SEAL!', bannerColor:'#ff2d2d',
    sequence:['Serpent','Boar','Ram'], counter:'Reaper Signs',
    effect:'reaper', sound:'reaper' },
];

// Sequence engine: advances each jutsu when its next seal becomes stable.
// dwellMs: a seal must stay stable this long to count. timeoutMs resets stale progress.
export class JutsuEngine {
  constructor({ dwellMs = 450, timeoutMs = 4000 } = {}){
    this.dwellMs = dwellMs; this.timeoutMs = timeoutMs;
    this.state = {}; // id -> {idx, lastSeal, sealSince, lastAdvance}
    for (const j of JUTSU) this.state[j.id] = { idx:0, lastSeal:null, sealSince:0, lastAdvance:0 };
    this.holds = {}; // id -> ms accumulated for hold-trigger jutsu
  }
  // seal: stable seal name ('No Seal' allowed), now: ms, dt: ms since last frame
  update(seal, now, dt){
    let fired = null;
    for (const j of JUTSU){
      const st = this.state[j.id];
      const expected = j.sequence[st.idx];
      if (seal === expected){
        if (st.lastSeal !== seal){ st.lastSeal = seal; st.sealSince = now; }
        if (now - st.sealSince >= this.dwellMs){
          st.idx++; st.lastAdvance = now; st.sealSince = now - this.dwellMs; st.lastSeal = seal;
          if (st.idx >= j.sequence.length){
            fired = j; this.resetAll();
            if (j.holdMs) this.holds[j.id] = 0;
            break;
          }
        }
      } else if (seal !== st.lastSeal){
        // gentle decay: only reset on timeout, so brief misreads don't wipe progress
        if (st.idx > 0 && now - st.lastAdvance > this.timeoutMs){ st.idx = 0; st.lastSeal = null; }
      }
    }
    return fired;
  }
  // hold-trigger progress (e.g. Rasengan charge on Open Palm)
  holdProgress(id, seal, dt){
    const j = JUTSU.find(x=>x.id===id);
    if (!j || !j.holdMs) return 0;
    if (seal === j.sequence[0]) this.holds[id] = (this.holds[id]||0) + dt; else this.holds[id] = Math.max(0,(this.holds[id]||0) - dt*2);
    return Math.min(1, (this.holds[id]||0) / j.holdMs);
  }
  resetAll(){ for (const j of JUTSU) this.state[j.id] = { idx:0, lastSeal:null, sealSince:0, lastAdvance:0 }; }
  progress(){
    let best = null;
    for (const j of JUTSU){
      const st = this.state[j.id];
      if (st.idx > 0 && (!best || st.idx > best.idx)) best = { jutsu:j, idx:st.idx, total:j.sequence.length, next:j.sequence[st.idx] };
    }
    return best;
  }
  promptText(){
    const p = this.progress();
    if (!p) return null;
    return `${p.jutsu.counter}: ${p.idx} / ${p.total}  ->  next: ${p.next}`;
  }
}
