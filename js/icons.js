import { state, ANIM_DURATION_MS } from "./state.js";
import {
  retargetDots,
  killAllOrbitDots,
  markDying,
  syncAllOrbits,
} from "./orbit-gen.js";
import { kickLoop } from "./core.js";

// Grid constants mirror frontier-design/heartwood-generators canvas-icons.js so
// preset cells translate 1:1. The reference cell (GRID_REF_C, GRID_REF_R) is
// anchored at the canvas center regardless of viewport size.
const CELL_SIZE = 15;
const GRID_REF_C = 49;
const GRID_REF_R = 27;

// Map a preset's buttonId to the SVG file that represents it visually.
const ICON_FILE_MAP = {
  "btn-preset-folder": "folder.svg",
  "btn-preset-location": "location.svg",
  "btn-preset-clock": "clock.svg",
  "btn-preset-color-house": "house.svg",
  "btn-preset-eyes": "eyes.svg",
  "btn-preset-transit": "transit.svg",
  "btn-preset-bus": "bus.svg",
  "btn-preset-mail": "mail.svg",
  "btn-preset-smiley": "smiley.svg",
};

function iconLabelFor(buttonId) {
  return (buttonId || "")
    .replace(/^btn-preset-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function nowMs() {
  return state.p5ref ? state.p5ref.millis() : 0;
}

function gridOrigin() {
  return {
    x: state.W / 2 - (GRID_REF_C + 0.5) * CELL_SIZE,
    y: state.H / 2 - (GRID_REF_R + 0.5) * CELL_SIZE,
  };
}

function cellCenter(c, r) {
  const o = gridOrigin();
  return {
    x: o.x + (c + 0.5) * CELL_SIZE,
    y: o.y + (r + 0.5) * CELL_SIZE,
  };
}

function computeTargets(preset) {
  const cells = (preset && preset.shape && preset.shape.cells) || [];
  return cells.map(({ c, r }) => cellCenter(c, r));
}

function findPreset(id) {
  return state.iconPresets.find((p) => p.buttonId === id);
}

export async function loadIconPresets() {
  try {
    const res = await fetch("data/presets.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`presets.json -> ${res.status}`);
    const json = await res.json();
    state.iconPresets = Array.isArray(json.presets) ? json.presets : [];
  } catch (e) {
    console.error("[icons] failed to load presets.json", e);
    state.iconPresets = [];
  }
  renderIconButtons();
}

/**
 * Enter icon mode and animate all dots into the selected shape. Existing orbit
 * dots fade out; icon dots fade in from random positions toward their cells.
 */
export function activateIcon(presetId) {
  const preset = findPreset(presetId);
  if (!preset) return;

  const wasIcon = state.iconMode;
  state.iconMode = true;
  state.activeIconId = presetId;
  state.scattered = false;

  if (!wasIcon) killAllOrbitDots();

  const targets = computeTargets(preset);
  retargetDots(state.iconDots, targets);

  renderIconButtons();
  kickLoop();
}

/** Reanimate the current icon (used by the Go button while in icon mode). */
export function goToActiveIcon() {
  if (!state.iconMode || !state.activeIconId) return false;
  const preset = findPreset(state.activeIconId);
  if (!preset) return false;
  const targets = computeTargets(preset);
  retargetDots(state.iconDots, targets);
  kickLoop();
  return true;
}

/** Scatter icon dots to random positions (the Free-For-All equivalent). */
export function scatterIconDots() {
  if (!state.iconMode) return false;
  const now = nowMs();
  for (const d of state.iconDots) {
    if (d.dying) continue;
    d.sx = d.x;
    d.sy = d.y;
    d.tx = Math.random() * state.W;
    d.ty = Math.random() * state.H;
    d.animStart = now;
  }
  kickLoop();
  return true;
}

/**
 * Leave icon mode and animate straight into the current orbit formation. Icon
 * dots fade out while fresh orbit dots fade in from random positions and ease
 * to their targets — no Free-For-All detour required.
 */
export function exitIconMode() {
  if (!state.iconMode) return;
  state.iconMode = false;
  state.activeIconId = null;
  for (const d of state.iconDots) markDying(d);
  state.scattered = false;
  syncAllOrbits();
  renderIconButtons();
  kickLoop();
}

/** Reaim currently-visible icon dots when the viewport changes size. */
export function refitActiveIcon() {
  if (!state.iconMode || !state.activeIconId) return;
  const preset = findPreset(state.activeIconId);
  if (!preset) return;
  const targets = computeTargets(preset);
  // Snap positions without animation so a resize doesn't trigger a slow tween.
  const alive = state.iconDots.filter((d) => !d.dying);
  for (let i = 0; i < Math.min(alive.length, targets.length); i++) {
    const d = alive[i];
    d.x = targets[i].x;
    d.y = targets[i].y;
    d.sx = d.x;
    d.sy = d.y;
    d.tx = d.x;
    d.ty = d.y;
    d.animStart = 0;
  }
}

export function renderIconButtons() {
  const host = document.getElementById("iconList");
  if (!host) return;
  host.innerHTML = "";

  if (!state.iconPresets.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No presets loaded.";
    host.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "icon-grid";
  for (const preset of state.iconPresets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-preset-btn";
    if (preset.buttonId === state.activeIconId) btn.classList.add("active");
    const label = iconLabelFor(preset.buttonId);
    btn.setAttribute("aria-label", `${label} shape preset`);
    btn.setAttribute("title", label);
    const file = ICON_FILE_MAP[preset.buttonId];
    if (file) {
      const img = document.createElement("img");
      img.src = `assets/icons/${file}`;
      img.alt = "";
      img.decoding = "async";
      btn.appendChild(img);
    } else {
      btn.textContent = label;
    }
    btn.addEventListener("click", () => activateIcon(preset.buttonId));
    grid.appendChild(btn);
  }
  host.appendChild(grid);
}
