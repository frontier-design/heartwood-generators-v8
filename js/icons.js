import { state } from "./state.js";
import {
  retargetDots,
  syncAllOrbits,
  markDying,
} from "./orbit-gen.js";
import { kickLoop } from "./core.js";

/**
 * Move every non-dying dot out of `from` and into `to`, preserving order.
 * Dying dots are left behind so they can finish their fade-out animation
 * without being retargeted into the new formation.
 */
function donateLiveDots(from, to) {
  const live = [];
  for (let i = from.length - 1; i >= 0; i--) {
    if (!from[i].dying) live.push(from.splice(i, 1)[0]);
  }
  live.reverse();
  for (const d of live) to.push(d);
}

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
 * Enter icon mode and animate all dots into the selected shape. When coming
 * from orbit mode the existing orbit dots are migrated into the icon pool so
 * they tween smoothly toward their cells; only the delta (extra or missing
 * dots) fades out / in.
 */
export function activateIcon(presetId) {
  const preset = findPreset(presetId);
  if (!preset) return;

  const wasIcon = state.iconMode;
  state.iconMode = true;
  state.activeIconId = presetId;
  state.scattered = false;

  // First entry into icon mode: donate every live orbit dot to iconDots so
  // retargetDots can reuse them instead of fading them out and in.
  if (!wasIcon) {
    for (const orb of state.orbits) {
      donateLiveDots(orb.dots, state.iconDots);
    }
  }

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
 * Leave icon mode and animate straight into the current orbit formation.
 * Live icon dots are redistributed across orbits (proportional to each
 * orbit's dotCount) so they migrate into the new layout instead of fading
 * out. `syncAllOrbits` then retargets them and fades in any missing dots.
 */
export function exitIconMode() {
  if (!state.iconMode) return;
  state.iconMode = false;
  state.activeIconId = null;
  state.scattered = false;

  // Pull live icon dots out; leave dying ones behind so they finish fading.
  const live = [];
  for (let i = state.iconDots.length - 1; i >= 0; i--) {
    if (!state.iconDots[i].dying) live.push(state.iconDots.splice(i, 1)[0]);
  }
  live.reverse();

  if (state.orbits.length > 0 && live.length > 0) {
    const total = state.orbits.reduce((s, o) => s + o.dotCount, 0);
    const quotas = state.orbits.map((orb) =>
      total > 0
        ? Math.round((orb.dotCount / total) * live.length)
        : Math.round(live.length / state.orbits.length),
    );
    // Nudge quotas so they sum to exactly live.length.
    let diff = live.length - quotas.reduce((a, b) => a + b, 0);
    for (let i = 0; diff !== 0; i = (i + 1) % quotas.length) {
      if (diff > 0) {
        quotas[i]++;
        diff--;
      } else if (quotas[i] > 0) {
        quotas[i]--;
        diff++;
      }
    }
    let idx = 0;
    for (let i = 0; i < state.orbits.length; i++) {
      for (let k = 0; k < quotas[i] && idx < live.length; k++) {
        state.orbits[i].dots.push(live[idx++]);
      }
    }
  } else if (live.length > 0) {
    // Nowhere to migrate them — put them back and fade them out.
    for (const d of live) {
      state.iconDots.push(d);
      markDying(d);
    }
  }

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
