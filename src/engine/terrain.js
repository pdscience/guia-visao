/* src/engine/terrain.js — heuristic for low/ground hazards via edge density in lower third. */

export function groundEdgeScore(imageData, bands = 3){
  if(!imageData || !imageData.data) return 0;
  const { width: w, height: h, data } = imageData;
  if(!w || !h) return 0;
  const y0 = Math.floor(h * 2 / 3);
  let transitions = 0, denom = 0;
  // sample every 4th pixel for speed
  for(let y = y0; y < h - 1; y += 2){
    let prev = -1;
    for(let x = 0; x < w; x += 1){
      const idx = (y * w + x) * 4;
      const lum = (data[idx] * 299 + data[idx+1]*587 + data[idx+2]*114) / 1000;
      const bin = lum > 127 ? 1 : 0;
      if(prev !== -1 && bin !== prev) transitions++;
      prev = bin;
      denom++;
    }
  }
  if(denom === 0) return 0;
  return transitions / denom;
}

export function isGroundHazard(imageData, threshold = 0.18){
  return groundEdgeScore(imageData) >= threshold;
}
