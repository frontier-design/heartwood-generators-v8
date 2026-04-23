import { state, dom } from './state.js';
import { kickLoop, redrawAll } from './core.js';
import { renderOrbitList } from './orbit-ui.js';
import { logOrbitCenters } from './orbit-gen.js';

export function togglePanel() {
  if (dom.panel) dom.panel.classList.toggle("hidden");
  if (dom.modeBar) dom.modeBar.classList.toggle("hidden");
  if (dom.exportDock) dom.exportDock.classList.toggle("hidden");
}

export function toggleSection(header) {
  if (!header) return;
  const body = header.nextElementSibling;
  const arrow = header.querySelector(".section-arrow");
  if (body) body.classList.toggle("open");
  if (arrow) arrow.classList.toggle("open");
}

export function onSharedCenterChange() {
  const shared = dom.sharedCenter.checked;
  if (dom.sharedCenterRow) {
    dom.sharedCenterRow.style.display = shared ? "" : "none";
  }
  renderOrbitList();
  redrawAll();
  logOrbitCenters(`shared center ${shared ? "on" : "off"}`);
}

export function setMode(m) {
  state.mode = m;
  document
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  const id = "mode" + m.charAt(0).toUpperCase() + m.slice(1);
  const btn = document.getElementById(id);
  if (btn) btn.classList.add("active");
  if (state.p5ref) state.p5ref.canvas.style.cursor = m === "view" ? "default" : "crosshair";
  kickLoop();
}

// ── CANVAS INTERACTION ──
function getPos(e) {
  const rect = state.p5ref.canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * (state.W / rect.width),
    y: (src.clientY - rect.top) * (state.H / rect.height),
  };
}

function onCanvasMouseDown(e) {
  const pos = getPos(e);
  if (state.mode === "moveField") {
    const r = +dom.dotSize.value / 2 + 5;
    state.dragDot = state.fieldDots.find((d) => Math.hypot(d.x - pos.x, d.y - pos.y) < r);
    if (state.dragDot) {
      state.dragOffX = state.dragDot.x - pos.x;
      state.dragOffY = state.dragDot.y - pos.y;
      kickLoop();
    }
  }
  if (state.mode === "moveCenter") {
    dom.centerX.value = Math.round(pos.x);
    dom.centerY.value = Math.round(pos.y);
    redrawAll();
    logOrbitCenters("canvas click (move orbit center)");
  }
}

function onCanvasMouseMove(e) {
  if (state.mode === "moveField" && state.dragDot) {
    const pos = getPos(e);
    state.dragDot.x = pos.x + state.dragOffX;
    state.dragDot.y = pos.y + state.dragOffY;
  }
}

function onCanvasMouseUp() {
  if (state.dragDot) {
    state.dragDot.sx = state.dragDot.x;
    state.dragDot.sy = state.dragDot.y;
    state.dragDot.tx = state.dragDot.x;
    state.dragDot.ty = state.dragDot.y;
    state.dragDot.animStart = 0;
  }
  state.dragDot = null;
}

function onCanvasTouchStart(e) {
  e.preventDefault();
  const pos = getPos(e);
  if (state.mode === "moveField") {
    const r = +dom.dotSize.value / 2 + 7;
    state.dragDot = state.fieldDots.find((d) => Math.hypot(d.x - pos.x, d.y - pos.y) < r);
    if (state.dragDot) {
      state.dragOffX = state.dragDot.x - pos.x;
      state.dragOffY = state.dragDot.y - pos.y;
      kickLoop();
    }
  }
  if (state.mode === "moveCenter") {
    dom.centerX.value = Math.round(pos.x);
    dom.centerY.value = Math.round(pos.y);
    redrawAll();
    logOrbitCenters("canvas tap (move orbit center)");
  }
}

function onCanvasTouchMove(e) {
  e.preventDefault();
  if (state.mode === "moveField" && state.dragDot) {
    const pos = getPos(e);
    state.dragDot.x = pos.x + state.dragOffX;
    state.dragDot.y = pos.y + state.dragOffY;
  }
}

export function setupCanvasListeners(canvas) {
  canvas.addEventListener("mousedown", onCanvasMouseDown);
  canvas.addEventListener("mousemove", onCanvasMouseMove);
  canvas.addEventListener("mouseup", onCanvasMouseUp);
  canvas.addEventListener("mouseleave", onCanvasMouseUp);
  canvas.addEventListener("touchstart", onCanvasTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onCanvasTouchMove, { passive: false });
  canvas.addEventListener("touchend", onCanvasMouseUp);
}

export function initInteractionListeners() {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable)
    ) {
      return;
    }
    if (e.key === "h" || e.key === "H") togglePanel();
  });
}
