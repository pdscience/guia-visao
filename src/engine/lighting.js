/* src/engine/lighting.js — análise de luminosidade do frame para auto-torch. */

export function analyzeBrightness(imageData, threshold = 35){
  if(!imageData || !imageData.data) return { avg: 128, isLowLight: false };
  const data = imageData.data;
  let sum = 0, count = 0;
  // Amostragem por passo para performance em mobile (ex: a cada 16 pixels)
  const step = 16;
  for(let i = 0; i < data.length; i += 4 * step){
    const r = data[i], g = data[i+1], b = data[i+2];
    // luminância perceptual ITU-R BT.601
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += lum;
    count++;
  }
  const avg = count > 0 ? sum / count : 128;
  return { avg, isLowLight: avg < threshold };
}
