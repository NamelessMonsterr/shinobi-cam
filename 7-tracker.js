// tracker.js — MediaPipe HandLandmarker + FaceLandmarker setup (vendored, offline-capable).
import { FilesetResolver, HandLandmarker, FaceLandmarker } from './vision_bundle.mjs';

export async function createTrackers(){
  const fileset = await FilesetResolver.forVisionTasks('./');
  const hand = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: './hand_landmarker.task', delegate: 'GPU' },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.4,
  });
  let face = null;
  try {
    face = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: './face_landmarker.task', delegate: 'GPU' },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
    });
  } catch(e){ console.warn('Face landmarker unavailable:', e); }
  return { hand, face };
}

export const HAND_CONN = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]
];

export function drawSkeleton(ctx, landmarks, W, H, mirror){
  const px = (p) => [ (mirror ? 1-p.x : p.x) * W, p.y * H ];
  ctx.lineWidth = Math.max(2, W/480);
  ctx.strokeStyle = '#2bff4d';
  for (const [a,b] of HAND_CONN){
    const [x1,y1] = px(landmarks[a]), [x2,y2] = px(landmarks[b]);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }
  for (const p of landmarks){
    const [x,y] = px(p);
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath(); ctx.arc(x, y, Math.max(2.4, W/340), 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.1, W/700), 0, 7); ctx.fill();
  }
}
