// Shared mutable state, constants, and utility functions

export function randSeed() {
  return Math.floor(Math.random() * 99999) + 1;
}

export function seededRand(s) {
  let v = s;
  return () => {
    v = (v * 9301 + 49297) % 233280;
    return v / 233280;
  };
}

export const state = {
  p5ref: null,
  mode: "view",
  globalSeed: randSeed(),
  fieldDots: [],
  dragDot: null,
  dragOffX: 0,
  dragOffY: 0,
  W: 0,
  H: 0,
  orbits: [],
  scattered: true,
  // Icon mode: when active, dots animate into a preset shape from data/presets.json
  iconMode: false,
  activeIconId: null,
  iconPresets: [],
  iconDots: [],
};

export const dom = {};
export const DOM_IDS = [
  "bgColor", "dotColor", "dotSize", "dotBlur",
  "bgGrain", "dotGrain", "metaballs", "metaballMerge", "showGuides",
  "fieldEnabled", "fieldDensity", "fieldControls", "sharedCenter",
  "sharedCenterRow", "centerX", "centerY", "dotBudget", "csvPaste",
  "csvFile", "csvStatus", "dsTotalVal", "dsOrbitCount", "dataSummary",
  "panel", "modeBar", "exportDock", "manualRows", "orbitList",
  "orbitCount",
];

export function cacheDom() {
  for (const id of DOM_IDS) dom[id] = document.getElementById(id);
}

export function defaultSharedCenter(W, H) {
  return {
    x: Math.round(W / 2),
    y: Math.round(H / 2),
  };
}

const DEFAULT_ORBIT_PRESETS = [
  {
    radius: 65,
    dotCount: 48,
    clumpCount: 3,
    clumpSize: 88,
    clumpGap: 60,
    ringPull: 86,
  },
  {
    radius: 148,
    dotCount: 161,
    clumpCount: 3,
    clumpSize: 82,
    clumpGap: 58,
    ringPull: 74,
  },
  {
    radius: 259,
    dotCount: 298,
    clumpCount: 8,
    clumpSize: 40,
    clumpGap: 29,
    ringPull: 86,
  },
];

export function defaultOrbit(i) {
  const p =
    DEFAULT_ORBIT_PRESETS[i] ?? {
      radius: 70 + i * 90,
      dotCount: 20,
      clumpCount: 3,
      clumpSize: 28,
      clumpGap: 12,
      ringPull: 86,
    };
  return {
    id: i,
    label: `Orbit ${i + 1}`,
    dataValue: 0,
    dotCount: p.dotCount,
    useData: false,
    radius: p.radius,
    cx: null,
    cy: null,
    clumpCount: p.clumpCount,
    clumpSize: p.clumpSize,
    clumpGap: p.clumpGap,
    ringPull: p.ringPull,
    color: null,
    open: false,
    seed: randSeed(),
    dots: [],
  };
}

// ── EASING ──
export const ANIM_DURATION_MS = 1167;
// Fade-in/out runs faster than the position tween so dots snap into view
// while still easing to their target location.
export const FADE_DURATION_MS = 350;

function cubicBezier(x1, y1, x2, y2) {
  return function (t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const bx =
        3 * (1 - u) * (1 - u) * u * x1 +
        3 * (1 - u) * u * u * x2 +
        u * u * u -
        t;
      if (Math.abs(bx) < 0.001) break;
      const dx =
        3 * (1 - u) * (1 - u) * x1 +
        6 * (1 - u) * u * (x2 - x1) +
        3 * u * u * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      u -= bx / dx;
    }
    return (
      3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u
    );
  };
}

export const ease = cubicBezier(0.16, 1, 0.3, 1);
