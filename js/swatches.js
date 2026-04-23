import { dom } from './state.js';
import { kickLoop } from './core.js';
import { renderOrbitList } from './orbit-ui.js';

export const SWATCHES = [
  "#212121", "#5696c2", "#feecd4", "#4f3321",
  "#ff6839", "#f9f9f9", "#281911", "#e9efcd",
];

function buildSwatches(containerId, inputId, _hexId, onSelect) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(inputId);
  const currentColor = input.value.toLowerCase();
  container.innerHTML = "";
  SWATCHES.forEach((color) => {
    const btn = document.createElement("button");
    const normalized = color.toLowerCase();
    btn.className = "swatch" + (currentColor === normalized ? " active" : "");
    btn.style.background = color;
    btn.dataset.color = normalized;
    btn.addEventListener("click", () => onSelect(color));
    container.appendChild(btn);
  });
}

function updateSwatchActive(containerId, color) {
  const target = color.toLowerCase();
  document.querySelectorAll("#" + containerId + " .swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.color === target);
  });
}

export function selectBgColor(color) {
  dom.bgColor.value = color;
  dom.bgHex.textContent = color;
  updateSwatchActive("bgSwatches", color);
  kickLoop();
}

export function selectDotColor(color) {
  dom.dotColor.value = color;
  dom.dotHex.textContent = color;
  updateSwatchActive("dotSwatches", color);
  renderOrbitList();
  kickLoop();
}

export function initSwatches() {
  buildSwatches("bgSwatches", "bgColor", "bgHex", selectBgColor);
  buildSwatches("dotSwatches", "dotColor", "dotHex", selectDotColor);
}
