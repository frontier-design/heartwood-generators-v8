import { dom } from './state.js';
import { kickLoop } from './core.js';
import { renderOrbitList } from './orbit-ui.js';

export const COLOR_COMBOS = [
  // Row 1
  { bg: "#f9f9f9", dot: "#5696c2" },
  { bg: "#212121", dot: "#e9efcd" },
  { bg: "#3a2316", dot: "#e9efcd" },
  { bg: "#ff6839", dot: "#feecd4" },
  { bg: "#feecd4", dot: "#3a2316" },
  { bg: "#5696c2", dot: "#f9f9f9" },
  { bg: "#e9efcd", dot: "#3a2316" },
  // Row 2
  { bg: "#f9f9f9", dot: "#ff6839" },
  { bg: "#212121", dot: "#feecd4" },
  { bg: "#3a2316", dot: "#feecd4" },
  { bg: "#ff6839", dot: "#f9f9f9" },
  { bg: "#feecd4", dot: "#ff6839" },
  { bg: "#5696c2", dot: "#e9efcd" },
  { bg: "#e9efcd", dot: "#5696c2" },
  // Row 3
  { bg: "#f9f9f9", dot: "#3a2316" },
  { bg: "#212121", dot: "#f9f9f9" },
  { bg: "#3a2316", dot: "#f9f9f9" },
  // Row 4
  { bg: "#f9f9f9", dot: "#212121" },
];

// Keep SWATCHES for orbit per-color picker (individual colors)
export const SWATCHES = [
  "#f9f9f9", "#212121", "#3a2316", "#ff6839",
  "#feecd4", "#5696c2", "#e9efcd",
];

export function selectCombo(index) {
  const combo = COLOR_COMBOS[index];
  if (!combo) return;
  dom.bgColor.value = combo.bg;
  dom.dotColor.value = combo.dot;
  updateComboActive(index);
  renderOrbitList();
  kickLoop();
}

function updateComboActive(activeIndex) {
  const container = document.getElementById("comboSwatches");
  if (!container) return;
  container.querySelectorAll(".combo-swatch").forEach((btn, i) => {
    btn.classList.toggle("active", i === activeIndex);
  });
}

export function initSwatches() {
  const container = document.getElementById("comboSwatches");
  if (!container) return;
  container.innerHTML = "";
  COLOR_COMBOS.forEach((combo, i) => {
    const btn = document.createElement("button");
    btn.className = "combo-swatch" + (i === 0 ? " active" : "");
    btn.style.background = combo.bg;
    btn.style.setProperty("--dot", combo.dot);
    btn.addEventListener("click", () => selectCombo(i));
    container.appendChild(btn);
  });
}
