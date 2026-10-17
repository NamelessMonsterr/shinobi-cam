// hud.js — reel-matching HUD: cyan SEAL box bottom-left, yellow counter, crosshair, banner.
export function drawHUD(ctx, W, H, { seal, conf, fps, counter, prompt }){
  const s = W/1280; // scale vs reference 720p
  // crosshair
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = Math.max(2, 3*s);
  const cx = W*0.62, cy = H*0.47, r = 14*s;
  ctx.beginPath();
  ctx.moveTo(cx-r,cy); ctx.lineTo(cx+r,cy); ctx.moveTo(cx,cy-r); ctx.lineTo(cx,cy+r);
  ctx.stroke();
  // SEAL box
  const bw = 420*s, bh = 108*s, bx = 18*s, by = H - bh - 26*s;
  ctx.fillStyle = 'rgba(10,20,30,0.45)'; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle = '#19d3ff'; ctx.lineWidth = Math.max(2,3*s); ctx.strokeRect(bx,by,bw,bh);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff'; ctx.font = `700 ${44*s}px Arial, sans-serif`;
  ctx.fillText(`SEAL: ${seal}`, bx + 26*s, by + 52*s);
  ctx.fillStyle = '#19d3ff'; ctx.font = `700 ${26*s}px Consolas, monospace`;
  ctx.fillText(`FPS: ${fps} | CONF: ${conf.toFixed(2)}`, bx + 26*s, by + 92*s);
  // counter / prompt (yellow, centered lower third)
  const line = prompt || counter;
  if (line){
    ctx.textAlign = 'center';
    ctx.font = `700 ${34*s}px Arial, sans-serif`;
    ctx.lineWidth = 5*s; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(line, W/2, H*0.90);
    ctx.fillStyle = prompt ? '#ff4d4d' : '#ffe14d';
    ctx.fillText(line, W/2, H*0.90);
  }
}
