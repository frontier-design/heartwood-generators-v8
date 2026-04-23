import { state } from './state.js';

const dotSpriteCache = new Map();
let dotMaskCtx = null;
let grainScratchCtx = null;
let metaballCtx = null;

export const render = {
  grainCanvas: null,
  grainOffset: 0,
  metaballFilterBlur: null,
  metaballCanvas: null,
  dotMaskCanvas: null,
  grainScratchCanvas: null,
};

export function ensureDotMaskCanvas() {
  if (!render.dotMaskCanvas) {
    render.dotMaskCanvas = document.createElement("canvas");
    dotMaskCtx = render.dotMaskCanvas.getContext("2d");
  }
  if (render.dotMaskCanvas.width !== state.W || render.dotMaskCanvas.height !== state.H) {
    render.dotMaskCanvas.width = state.W;
    render.dotMaskCanvas.height = state.H;
  }
  return dotMaskCtx;
}

export function ensureGrainScratchCanvas() {
  if (!render.grainScratchCanvas) {
    render.grainScratchCanvas = document.createElement("canvas");
    grainScratchCtx = render.grainScratchCanvas.getContext("2d");
  }
  if (render.grainScratchCanvas.width !== state.W || render.grainScratchCanvas.height !== state.H) {
    render.grainScratchCanvas.width = state.W;
    render.grainScratchCanvas.height = state.H;
  }
  return grainScratchCtx;
}

export function tileGrain(ctx2, offset) {
  const tile = render.grainCanvas.width;
  const startX = -offset;
  const startY = -((offset * 13) % tile);
  for (let y = startY; y < state.H; y += tile) {
    for (let x = startX; x < state.W; x += tile) {
      ctx2.drawImage(render.grainCanvas, x, y);
    }
  }
}

export function ensureMetaballCanvas() {
  if (!render.metaballCanvas) {
    render.metaballCanvas = document.createElement("canvas");
    metaballCtx = render.metaballCanvas.getContext("2d");
  }
  if (render.metaballCanvas.width !== state.W || render.metaballCanvas.height !== state.H) {
    render.metaballCanvas.width = state.W;
    render.metaballCanvas.height = state.H;
  }
  return metaballCtx;
}

export function hexToRgba(hex, alpha) {
  let h = String(hex).replace("#", "");
  if (h.length === 3)
    h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getDotSprite(color, diameter, blur) {
  const d = Math.max(1, Math.round(diameter));
  const b = Math.max(0, Math.min(1, blur));
  const bKey = Math.round(b * 20);
  const key = `${color.toLowerCase()}|${d}|${bKey}`;
  const cached = dotSpriteCache.get(key);
  if (cached) return cached;

  const innerR = d / 2;
  const halo = innerR * b * 1.6;
  const outerR = innerR + halo;
  const pad = Math.ceil(halo) + 1;
  const size = d + pad * 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const cx = size / 2;

  if (halo <= 0.01) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cx, innerR, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const holdStop = innerR / outerR;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, outerR);
    grad.addColorStop(0, color);
    grad.addColorStop(Math.max(0, holdStop - 0.05), color);
    grad.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cx, outerR, 0, Math.PI * 2);
    ctx.fill();
  }

  const sprite = { canvas: c, size, half: size / 2 };
  dotSpriteCache.set(key, sprite);
  return sprite;
}

export function createGrainTile(size = 192, strength = 42) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * strength;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
