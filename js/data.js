import { state, dom, defaultOrbit } from './state.js';
import { redrawAll, regenField } from './core.js';
import { renderOrbitList, orbitRowRefs } from './orbit-ui.js';

const DATA_PRESETS = [
  {
    name: "Heat Relief Network",
    source: "Air Conditioned & Cool Spaces",
    rows: [
      { label: "Splashpads", val: 153 },
      { label: "Community Centres", val: 93 },
      { label: "Indoor Pools", val: 55 },
      { label: "Outdoor Pools", val: 48 },
    ],
  },
  {
    name: "Green Roofs",
    source: "Building Permits — Green Roofs",
    rows: [
      { label: "Mixed Use", val: 393 },
      { label: "Apartments", val: 322 },
      { label: "Detached Homes", val: 83 },
      { label: "Eco-Roof Incentive", val: 41 },
    ],
  },
  {
    name: "Renewable Energy",
    source: "Renewable Energy Installations",
    rows: [
      { label: "North York", val: 28 },
      { label: "Former Toronto", val: 21 },
      { label: "Etobicoke", val: 21 },
      { label: "Scarborough", val: 20 },
    ],
  },
  {
    name: "Rental Housing",
    source: "Demolition & Replacement of Rental Units",
    rows: [
      { label: "Homes Demolished", val: 6111 },
      { label: "Homes Replaced", val: 6159 },
      { label: "Affordable Demolished", val: 3713 },
      { label: "Affordable Replaced", val: 3890 },
    ],
  },
  {
    name: "Climate Projection",
    source: "Current & Future Climate — Days Above 30°C",
    rows: [
      { label: "Baseline (1971–2000)", val: 10 },
      { label: "Moderate (SSP2-4.5)", val: 46 },
      { label: "High (SSP5-8.5)", val: 78 },
    ],
  },
  {
    name: "Urban Overview",
    source: "Cross-dataset totals",
    rows: [
      { label: "Renewable Installations", val: 100 },
      { label: "Cool Spaces", val: 349 },
      { label: "Green Roof Permits", val: 1255 },
      { label: "Front Yard Parking", val: 17819 },
    ],
  },
];

export function applyPreset(index) {
  const preset = DATA_PRESETS[index];
  if (!preset) return;

  while (state.orbits.length < preset.rows.length)
    state.orbits.push(defaultOrbit(state.orbits.length));
  while (state.orbits.length > preset.rows.length) state.orbits.pop();

  preset.rows.forEach((row, i) => {
    state.orbits[i].label = row.label;
    state.orbits[i].dataValue = row.val;
  });

  recalcDots();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}

export function renderPresetList() {
  const container = document.getElementById("presetList");
  if (!container) return;
  container.innerHTML = "";
  DATA_PRESETS.forEach((preset, i) => {
    const btn = document.createElement("button");
    btn.className = "preset-btn";
    btn.textContent = preset.name;
    btn.addEventListener("click", () => applyPreset(i));
    container.appendChild(btn);
  });
}

export function switchDataTab(tab) {
  ["Presets", "Manual", "CSV", "Paste"].forEach((t) => {
    document.getElementById("data" + t).style.display =
      tab === t.toLowerCase() ? "" : "none";
    document
      .getElementById("tab" + t)
      .classList.toggle("active", tab === t.toLowerCase());
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function renderManualRows() {
  const container = dom.manualRows;
  container.innerHTML = "";
  state.orbits.forEach((orb, i) => {
    const fallbackLabel = `Orbit ${i + 1}`;

    const row = document.createElement("div");
    row.className = "manual-row";

    const title = document.createElement("div");
    title.className = "orbit-sub budget-title";
    title.textContent = fallbackLabel;
    row.appendChild(title);

    const inputs = document.createElement("div");
    inputs.className = "manual-inputs";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.placeholder = "Label";
    labelInput.value = orb.label === fallbackLabel ? "" : orb.label;
    labelInput.addEventListener("input", () => {
      orb.label = labelInput.value || fallbackLabel;
      const refs = orbitRowRefs[i];
      if (refs) refs.labelSpan.textContent = orb.label;
    });
    inputs.appendChild(labelInput);

    const valInput = document.createElement("input");
    valInput.type = "number";
    valInput.placeholder = "value";
    valInput.min = "0";
    valInput.value = orb.dataValue || "";
    valInput.addEventListener("input", () => {
      orb.dataValue = +valInput.value || 0;
      recalcDots();
      redrawAll();
    });
    inputs.appendChild(valInput);

    row.appendChild(inputs);
    container.appendChild(row);
  });
}

export function recalcDots() {
  const budget = +dom.dotBudget.value;
  const total = state.orbits.reduce((s, o) => s + (o.dataValue || 0), 0);
  const hasData = total > 0;

  dom.dataSummary.style.display = hasData ? "" : "none";
  if (hasData) {
    dom.dsTotalVal.textContent = total.toLocaleString();
    dom.dsOrbitCount.textContent = `across ${state.orbits.length} orbit${state.orbits.length !== 1 ? "s" : ""}`;
  }

  state.orbits.forEach((orb) => {
    if (hasData && orb.dataValue > 0) {
      if (!orb.overrideDots) {
        orb.dotCount = Math.max(
          1,
          Math.round((orb.dataValue / total) * budget),
        );
      }
      orb.useData = true;
    } else if (hasData && orb.dataValue === 0) {
      if (!orb.overrideDots) orb.dotCount = 0;
      orb.useData = true;
    } else {
      orb.useData = false;
    }
  });

  renderOrbitList();
}

export function parsePastedCSV() {
  applyCSVText(dom.csvPaste.value, false);
}

function applyCSVText(text, showStatus) {
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  const rows = [];
  for (const line of lines) {
    const parts = parseCsvLine(line);
    if (parts.length < 2) continue;
    const label = parts[0].trim().replace(/^["']|["']$/g, "");
    const val = parseFloat(parts[parts.length - 1].replace(/[^0-9.]/g, ""));
    if (!isNaN(val)) rows.push({ label, val });
  }
  const cleaned = rows.filter((r) => r.val > 0);
  if (!cleaned.length) {
    if (showStatus) dom.csvStatus.textContent = "no valid rows found.";
    return;
  }

  while (state.orbits.length < cleaned.length)
    state.orbits.push(defaultOrbit(state.orbits.length));
  while (state.orbits.length > cleaned.length) state.orbits.pop();

  cleaned.forEach((row, i) => {
    state.orbits[i].label = row.label;
    state.orbits[i].dataValue = row.val;
  });

  if (showStatus) dom.csvStatus.textContent = `loaded ${cleaned.length} rows`;
  if (dom.orbitCount) dom.orbitCount.value = state.orbits.length;
  recalcDots();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}

export function initDataListeners() {
  document.getElementById("csvFile").addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => applyCSVText(e.target.result, true);
    reader.readAsText(file);
  });
}
