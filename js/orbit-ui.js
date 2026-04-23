import { state, dom, defaultOrbit, randSeed } from "./state.js";
import { redrawAll, kickLoop, regenField } from "./core.js";
import { syncOrbitDots, logOrbitCenters } from "./orbit-gen.js";
import { recalcDots, renderManualRows } from "./data.js";
import { SWATCHES } from "./swatches.js";

export const orbitRowRefs = [];

function createLabelRow(labelText, labelClass) {
  const row = document.createElement("div");
  row.className = "row";
  const label = document.createElement("label");
  if (labelClass) label.className = labelClass;
  label.textContent = labelText;
  row.appendChild(label);
  return row;
}

function createSliderRow(labelText, min, max, value, onInput) {
  const row = createLabelRow(labelText);
  const range = document.createElement("input");
  range.type = "range";
  range.min = String(min);
  range.max = String(max);
  range.value = String(value);
  const val = document.createElement("span");
  val.className = "val";
  val.textContent = String(value);
  range.addEventListener("input", () => {
    val.textContent = range.value;
    onInput(+range.value);
  });
  row.appendChild(range);
  row.appendChild(val);
  return row;
}

function renderDotCountSection(host, orb, i) {
  host.innerHTML = "";
  const onDotsInput = (v) => {
    orb.dotCount = v;
    const refs = orbitRowRefs[i];
    if (refs) refs.countBadge.textContent = String(v);
    redrawAll();
  };

  if (orb.useData) {
    const drivenRow = createLabelRow("Driven by data", "data-driven-label");
    const drivenVal = document.createElement("span");
    drivenVal.className = "val";
    drivenVal.textContent = String(orb.dotCount);
    drivenRow.appendChild(drivenVal);
    host.appendChild(drivenRow);

    const overrideRow = createLabelRow("Override");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!orb.overrideDots;
    cb.addEventListener("change", () => toggleOverride(i, cb.checked));
    overrideRow.appendChild(cb);
    host.appendChild(overrideRow);

    if (orb.overrideDots) {
      host.appendChild(
        createSliderRow("Dots", 1, 2000, orb.dotCount, onDotsInput),
      );
    }
  } else {
    host.appendChild(
      createSliderRow("Dots", 1, 2000, orb.dotCount, onDotsInput),
    );
  }
}

function createOrbitRow(orb, i) {
  const dotColor = dom.dotColor.value;
  const shared = dom.sharedCenter.checked;

  const wrap = document.createElement("div");
  wrap.className = "orbit-item-wrap";

  const item = document.createElement("div");
  item.className = "orbit-item";
  wrap.appendChild(item);

  const header = document.createElement("div");
  header.className = "orbit-item-header";
  header.addEventListener("click", () => toggleOrbit(i));
  item.appendChild(header);

  const headerStart = document.createElement("div");
  headerStart.className = "orbit-header-start";

  const preview = document.createElement("div");
  preview.className = "orbit-dot-preview";
  preview.style.background = orb.color || dotColor;
  headerStart.appendChild(preview);

  const titleRow = document.createElement("div");
  titleRow.className = "orbit-header-title";

  const labelSpan = document.createElement("span");
  labelSpan.className = "orbit-label";
  labelSpan.textContent = orb.label;
  titleRow.appendChild(labelSpan);

  const countBadge = document.createElement("span");
  countBadge.className = "orbit-count-badge";
  countBadge.textContent = String(orb.dotCount);
  titleRow.appendChild(countBadge);

  headerStart.appendChild(titleRow);
  header.appendChild(headerStart);

  const headerEnd = document.createElement("div");
  headerEnd.className = "orbit-header-end";

  if (state.orbits.length > 1) {
    const removeBtn = document.createElement("button");
    removeBtn.className = "orbit-remove orbit-remove-icon";
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", `Remove ${orb.label}`);
    removeBtn.setAttribute("title", "Remove orbit");
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeOrbit(i);
    });
    headerEnd.appendChild(removeBtn);
  }

  const arrow = document.createElement("span");
  arrow.className = "orbit-arrow" + (orb.open ? " open" : "");
  arrow.setAttribute("aria-hidden", "true");
  headerEnd.appendChild(arrow);
  header.appendChild(headerEnd);

  const body = document.createElement("div");
  body.className = "orbit-body" + (orb.open ? " open" : "");
  item.appendChild(body);

  body.appendChild(
    createSliderRow("Radius", 20, 400, orb.radius, (v) => {
      orb.radius = v;
      redrawAll();
    }),
  );

  const dotCountHost = document.createElement("div");
  dotCountHost.className = "orbit-dot-host";
  body.appendChild(dotCountHost);

  body.appendChild(
    createSliderRow("Clusters", 1, 14, orb.clumpCount, (v) => {
      orb.clumpCount = v;
      redrawAll();
    }),
  );
  body.appendChild(
    createSliderRow("Spread", 3, 140, orb.clumpSize, (v) => {
      orb.clumpSize = v;
      redrawAll();
    }),
  );
  body.appendChild(
    createSliderRow("Jitter", 0, 70, orb.clumpGap, (v) => {
      orb.clumpGap = v;
      redrawAll();
    }),
  );
  body.appendChild(
    createSliderRow("Ring Pull", 0, 100, orb.ringPull ?? 86, (v) => {
      orb.ringPull = v;
      redrawAll();
    }),
  );

  if (!shared) {
    const cSub = document.createElement("div");
    cSub.className = "orbit-sub";
    cSub.textContent = "Center";
    body.appendChild(cSub);

    const cRow = createLabelRow("CX / CY");
    const cxInput = document.createElement("input");
    cxInput.type = "number";
    cxInput.className = "input-sm";
    cxInput.value = orb.cx ?? +dom.centerX.value;
    cxInput.addEventListener("input", () => {
      setOrbitProp(i, "cx", +cxInput.value);
      redrawAll();
    });
    cRow.appendChild(cxInput);

    const cyInput = document.createElement("input");
    cyInput.type = "number";
    cyInput.className = "input-sm";
    cyInput.value = orb.cy ?? +dom.centerY.value;
    cyInput.addEventListener("input", () => {
      setOrbitProp(i, "cy", +cyInput.value);
      redrawAll();
      logOrbitCenters(`${orb.label} CY`);
    });
    cRow.appendChild(cyInput);
    body.appendChild(cRow);
  }

  const colorSection = document.createElement("div");
  colorSection.className = "orbit-color-section";
  body.appendChild(colorSection);

  const swatchRow = document.createElement("div");
  swatchRow.className = "swatch-row";
  colorSection.appendChild(swatchRow);

  const swatchBtns = [];
  SWATCHES.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = "swatch";
    btn.style.background = color;
    btn.dataset.color = color.toLowerCase();
    btn.addEventListener("click", () => setOrbitColor(i, color));
    swatchRow.appendChild(btn);
    swatchBtns.push(btn);
  });

  const customRow = document.createElement("div");
  customRow.className = "orbit-color-custom";
  colorSection.appendChild(customRow);

  const customColor = document.createElement("input");
  customColor.type = "color";
  customColor.value = orb.color || dotColor;
  customColor.addEventListener("input", () =>
    setOrbitColor(i, customColor.value),
  );
  customRow.appendChild(customColor);

  const customHex = document.createElement("span");
  customHex.className = "swatch-hex";
  customHex.textContent = orb.color || "global";
  customRow.appendChild(customHex);

  const resetBtn = document.createElement("button");
  resetBtn.className = "orbit-reset-btn";
  resetBtn.textContent = "Reset";
  resetBtn.addEventListener("click", () => clearOrbitColor(i));
  if (!orb.color) resetBtn.style.display = "none";
  customRow.appendChild(resetBtn);

  const reshuffleBtn = document.createElement("button");
  reshuffleBtn.className = "orbit-reshuffle";
  reshuffleBtn.textContent = "Reshuffle";
  reshuffleBtn.addEventListener("click", () => reshuffleOrbit(i));
  body.appendChild(reshuffleBtn);

  orbitRowRefs[i] = {
    wrap,
    body,
    preview,
    labelSpan,
    countBadge,
    arrow,
    dotCountHost,
    swatchBtns,
    customColor,
    customHex,
    resetBtn,
  };

  renderDotCountSection(dotCountHost, orb, i);
  updateOrbitSwatchActive(i);

  return wrap;
}

export function renderOrbitList() {
  const list = dom.orbitList;
  list.innerHTML = "";
  orbitRowRefs.length = 0;
  state.orbits.forEach((orb, i) => {
    list.appendChild(createOrbitRow(orb, i));
  });
}

function updateOrbitSwatchActive(i) {
  const refs = orbitRowRefs[i];
  if (!refs) return;
  const orb = state.orbits[i];
  const match = orb.color ? orb.color.toLowerCase() : null;
  refs.swatchBtns.forEach((btn) => {
    btn.classList.toggle(
      "active",
      match !== null && btn.dataset.color === match,
    );
  });
  refs.customHex.textContent = orb.color || "global";
  refs.customColor.value = orb.color || dom.dotColor.value;
  refs.preview.style.background = orb.color || dom.dotColor.value;
  refs.resetBtn.style.display = orb.color ? "" : "none";
}

function setOrbitColor(i, color) {
  state.orbits[i].color = color;
  updateOrbitSwatchActive(i);
  redrawAll();
}

function clearOrbitColor(i) {
  state.orbits[i].color = null;
  updateOrbitSwatchActive(i);
  redrawAll();
}

function toggleOverride(i, checked) {
  state.orbits[i].overrideDots = checked;
  const refs = orbitRowRefs[i];
  if (refs) renderDotCountSection(refs.dotCountHost, state.orbits[i], i);
}

function toggleOrbit(i) {
  state.orbits[i].open = !state.orbits[i].open;
  const refs = orbitRowRefs[i];
  if (!refs) return;
  refs.body.classList.toggle("open", state.orbits[i].open);
  refs.arrow.classList.toggle("open", state.orbits[i].open);
}

export function addOrbit() {
  state.orbits.push(defaultOrbit(state.orbits.length));
  recalcDots();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}

function removeOrbit(i) {
  if (state.orbits.length <= 1) return;
  state.orbits.splice(i, 1);
  recalcDots();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}

function setOrbitProp(i, key, val) {
  state.orbits[i][key] = val;
  syncOrbitDots(state.orbits[i]);
  kickLoop();
}

function reshuffleOrbit(i) {
  state.orbits[i].seed = randSeed();
  redrawAll();
}

export function reshuffleAll() {
  state.globalSeed = randSeed();
  state.orbits.forEach((o) => (o.seed = randSeed()));
  regenField();
  redrawAll();
}
