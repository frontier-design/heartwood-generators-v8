import { state, dom, seededRand } from './state.js';

export function getCenter(orb) {
  if (dom.sharedCenter.checked || orb.cx === null) {
    return {
      x: +dom.centerX.value,
      y: +dom.centerY.value,
    };
  }
  return { x: orb.cx, y: orb.cy };
}

/** Logs resolved center (x, y) for each orbit whenever centers are updated. */
export function logOrbitCenters(reason = "") {
  if (!state.orbits.length) return;
  const shared = !!(dom.sharedCenter && dom.sharedCenter.checked);
  const payload = state.orbits.map((orb, i) => {
    const c = getCenter(orb);
    return {
      index: i + 1,
      label: orb.label,
      x: c.x,
      y: c.y,
      ownCx: orb.cx,
      ownCy: orb.cy,
    };
  });
  console.log("[orbit centers]", reason || "update", { shared }, payload);
}

export function generateOrbitDots(orb) {
  const r = seededRand(orb.seed);
  const c = getCenter(orb);
  const n = orb.dotCount;
  if (n <= 0) return [];

  const clumpCount = orb.clumpCount;
  const clumpSizeDeg = orb.clumpSize;
  const gapDeg = orb.clumpGap;
  const baseOffset = r() * 360;
  const clumpSepDeg = 360 / clumpCount;

  const clumps = [];
  for (let ci = 0; ci < clumpCount; ci++) {
    const center = baseOffset + ci * clumpSepDeg + (r() - 0.5) * gapDeg * 2;
    clumps.push({
      start: center - clumpSizeDeg / 2,
      end: center + clumpSizeDeg / 2,
    });
  }

  const dotsPerClump = Math.max(1, Math.floor(n / clumpCount));
  const extra = n - dotsPerClump * clumpCount;
  const dots = [];

  for (let ci = 0; ci < clumpCount; ci++) {
    const count = dotsPerClump + (ci < extra ? 1 : 0);
    const clump = clumps[ci];
    for (let di = 0; di < count; di++) {
      const angleDeg = clump.start + r() * (clump.end - clump.start);
      const angle = (angleDeg * Math.PI) / 180;
      const pull = orb.ringPull != null ? orb.ringPull : 86;
      const scatter = (1 - Math.max(0, Math.min(100, pull)) / 100) * 0.5;
      const jitter = (r() - 0.5) * orb.radius * scatter;
      dots.push({
        x: c.x + Math.cos(angle) * (orb.radius + jitter),
        y: c.y + Math.sin(angle) * (orb.radius + jitter),
      });
    }
  }
  return dots;
}

export function retargetDots(arr, targets, rand) {
  const now = state.p5ref ? state.p5ref.millis() : 0;
  while (arr.length < targets.length) {
    const nx = rand() * state.W,
      ny = rand() * state.H;
    arr.push({
      x: nx, y: ny,
      sx: nx, sy: ny,
      tx: nx, ty: ny,
      animStart: 0,
    });
  }
  arr.length = targets.length;
  for (let i = 0; i < targets.length; i++) {
    const d = arr[i];
    const tx = targets[i].x,
      ty = targets[i].y;
    if (Math.abs(d.tx - tx) > 0.5 || Math.abs(d.ty - ty) > 0.5) {
      d.sx = d.x;
      d.sy = d.y;
      d.tx = tx;
      d.ty = ty;
      d.animStart = now;
    }
  }
}

export function syncOrbitDots(orb) {
  const targets = generateOrbitDots(orb);
  retargetDots(orb.dots, targets, seededRand(orb.seed ^ 0x9e3779b1));
}

export function syncAllOrbits() {
  state.orbits.forEach((orb) => syncOrbitDots(orb));
}
