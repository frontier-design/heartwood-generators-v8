import { state, dom, defaultOrbit, seededRand, randSeed } from "./state.js";
import { syncAllOrbits, retargetDots, spawnScatteredDots, resizeScatteredDots } from "./orbit-gen.js";
import { initSwatches } from "./swatches.js";
import { renderManualRows, renderPresetList } from "./data.js";
import { renderOrbitList } from "./orbit-ui.js";

export function kickLoop() {
  if (state.p5ref && typeof state.p5ref.loop === "function") state.p5ref.loop();
}

export function onMetaballsToggle() {
  const on = dom.metaballs && dom.metaballs.checked;
  document.body.classList.toggle("metaballs-on", !!on);
  kickLoop();
}

export function redrawAll() {
  if (state.iconMode) {
    // Icon dots are retargeted directly via the icons module; orbits stay
    // frozen in whatever fade-out state they were left in.
    kickLoop();
    return;
  }
  if (state.scattered) {
    resizeScatteredDots();
  } else {
    syncAllOrbits();
  }
  kickLoop();
}

export function regenField() {
  state.fieldDots.length = 0;
  kickLoop();
}

export function syncVal(el, id) {
  const o = document.getElementById(id);
  if (o) o.textContent = el.value;
  kickLoop();
}

export function randomizeField() {
  state.globalSeed = randSeed();
  regenField();
}

/** "Orbit" button: animate dots into the current orbit formation, exiting icon
 *  mode on the way if it was active. */
export async function goAnimate() {
  if (state.iconMode) {
    const { exitIconMode } = await import("./icons.js");
    exitIconMode();
    return;
  }
  state.scattered = false;
  syncAllOrbits();
  kickLoop();
}

/** "Free For All" button: scatter whatever dots are currently on screen. */
export async function freeForAll() {
  if (state.iconMode) {
    const { scatterIconDots } = await import("./icons.js");
    scatterIconDots();
    return;
  }
  state.scattered = true;
  const now = state.p5ref ? state.p5ref.millis() : 0;
  const total = state.orbits.reduce((s, o) => s + o.dots.length, 0);
  // Keep only ~30 dots total, trim excess, scatter the rest
  for (const orb of state.orbits) {
    const keep = total > 0
      ? Math.max(1, Math.round((orb.dots.length / total) * 30))
      : orb.dots.length;
    orb.dots.length = Math.min(orb.dots.length, keep);
    for (const d of orb.dots) {
      d.sx = d.x;
      d.sy = d.y;
      d.tx = Math.random() * state.W;
      d.ty = Math.random() * state.H;
      d.animStart = now;
    }
  }
  kickLoop();
}

export function init() {
  state.scattered = true;
  state.orbits = [defaultOrbit(0), defaultOrbit(1), defaultOrbit(2)];
  initSwatches();
  renderPresetList();
  regenField();
  renderManualRows();
  renderOrbitList();
  spawnScatteredDots();
  kickLoop();
}
