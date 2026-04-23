import { state, dom, defaultOrbit, seededRand, randSeed } from "./state.js";
import { syncAllOrbits, retargetDots } from "./orbit-gen.js";
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
  syncAllOrbits();
  kickLoop();
}

export function fieldDotCount() {
  if (!dom.fieldEnabled.checked) return 0;
  const v = +dom.fieldDensity.value;
  return Math.round((v / 100) * 300);
}

export function regenField() {
  const n = fieldDotCount();
  const posRand = seededRand(state.globalSeed ^ 0x85ebca6b);
  const targetRand = seededRand(state.globalSeed);
  const targets = [];
  for (let i = 0; i < n; i++) {
    targets.push({ x: targetRand() * state.W, y: targetRand() * state.H });
  }
  retargetDots(state.fieldDots, targets, posRand);
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

export function init() {
  state.orbits = [defaultOrbit(0), defaultOrbit(1), defaultOrbit(2)];
  initSwatches();
  renderPresetList();
  regenField();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}
