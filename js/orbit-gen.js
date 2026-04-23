import { state, dom, seededRand, ANIM_DURATION_MS } from './state.js';

function nowMs() {
  return state.p5ref ? state.p5ref.millis() : 0;
}

// Ensure older dots (created before scale animation existed) have the fields.
export function ensureDotAnimFields(d) {
  if (d.scale == null) {
    d.scale = 1;
    d.scaleFrom = 1;
    d.scaleTo = 1;
    d.scaleT0 = 0;
    d.scaleDur = 0;
  }
  if (d.dying == null) d.dying = false;
}

function spawnFadingDot(tx, ty) {
  const now = nowMs();
  const nx = Math.random() * state.W;
  const ny = Math.random() * state.H;
  const hasTarget = tx != null && ty != null;
  return {
    x: nx,
    y: ny,
    sx: nx,
    sy: ny,
    tx: hasTarget ? tx : nx,
    ty: hasTarget ? ty : ny,
    animStart: hasTarget ? now : 0,
    scale: 0,
    scaleFrom: 0,
    scaleTo: 1,
    scaleT0: now,
    scaleDur: ANIM_DURATION_MS,
    dying: false,
  };
}

function markDying(d) {
  if (d.dying) return;
  const now = nowMs();
  ensureDotAnimFields(d);
  d.dying = true;
  d.scaleFrom = d.scale;
  d.scaleTo = 0;
  d.scaleT0 = now;
  d.scaleDur = ANIM_DURATION_MS;
}

// Bring a dying dot back to life so rapid slider scrubs don't produce
// overlapping shrink/grow pairs in the same region.
function reviveDot(d) {
  const now = nowMs();
  d.dying = false;
  d.scaleFrom = d.scale;
  d.scaleTo = 1;
  d.scaleT0 = now;
  d.scaleDur = ANIM_DURATION_MS;
}

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
  const now = nowMs();
  for (const d of arr) ensureDotAnimFields(d);

  const active = arr.filter((d) => !d.dying);
  const want = targets.length;
  const current = active.length;

  if (want < current) {
    // Fade out the tail of the active dots. They remain in `arr` until the
    // scale animation completes, at which point the draw loop reaps them.
    const kill = current - want;
    for (let i = current - kill; i < current; i++) {
      markDying(active[i]);
    }
  } else if (want > current) {
    let need = want - current;
    // First, revive the most recently-killed dying dots so rapid scrubs
    // feel like a single continuous tween instead of overlapping spawns.
    for (let i = arr.length - 1; i >= 0 && need > 0; i--) {
      if (arr[i].dying) {
        reviveDot(arr[i]);
        need--;
      }
    }
    // Spawn any still-needed dots at random positions; they ease to their
    // targets while simultaneously fading in from scale 0.
    if (need > 0) {
      const startIdx = want - need;
      for (let k = startIdx; k < want; k++) {
        const t = targets[k];
        arr.push(spawnFadingDot(t.x, t.y));
      }
    }
  }

  // Retarget the still-alive dots to the new layout. In-flight fade-in
  // animations are preserved so repeated slider changes keep flowing.
  const alive = arr.filter((d) => !d.dying);
  const len = Math.min(alive.length, want);
  for (let i = 0; i < len; i++) {
    const d = alive[i];
    const tx = targets[i].x;
    const ty = targets[i].y;
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

const INITIAL_DOT_COUNT = 30;

export function spawnScatteredDots() {
  const total = state.orbits.reduce((s, o) => s + o.dotCount, 0);
  for (const orb of state.orbits) {
    // Distribute the initial 30 proportionally across orbits
    const n = total > 0
      ? Math.max(1, Math.round((orb.dotCount / total) * INITIAL_DOT_COUNT))
      : Math.round(INITIAL_DOT_COUNT / state.orbits.length);
    orb.dots.length = 0;
    for (let i = 0; i < n; i++) {
      orb.dots.push(spawnFadingDot());
    }
  }
}

export function resizeScatteredDots() {
  for (const orb of state.orbits) {
    for (const d of orb.dots) ensureDotAnimFields(d);
    const active = orb.dots.filter((d) => !d.dying);
    const want = orb.dotCount;
    if (active.length < want) {
      let need = want - active.length;
      for (let i = orb.dots.length - 1; i >= 0 && need > 0; i--) {
        if (orb.dots[i].dying) {
          reviveDot(orb.dots[i]);
          need--;
        }
      }
      for (let i = 0; i < need; i++) {
        orb.dots.push(spawnFadingDot());
      }
    } else if (active.length > want) {
      const kill = active.length - want;
      for (let i = active.length - kill; i < active.length; i++) {
        markDying(active[i]);
      }
    }
  }
}
