const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const W = 680,
  H = 860;
canvas.width = W;
canvas.height = H;

// ── STATE ──
let mode = "view";
let globalSeed = randSeed();
let fieldDots = [];
let dragDot = null,
  dragOffX = 0,
  dragOffY = 0;
let dataTab = "manual";

// Each orbit stores visual settings + data
let orbits = [];

function defaultOrbit(i) {
  return {
    id: i,
    label: `orbit ${i + 1}`,
    dataValue: 0, // raw data value (0 = not set, use manual density)
    dotCount: 20, // calculated or manual
    useData: false, // true when data has been applied
    radius: 70 + i * 90,
    cx: null,
    cy: null,
    clumpCount: 3,
    clumpSize: 28,
    clumpGap: 12,
    open: false,
    seed: randSeed(),
  };
}

function randSeed() {
  return Math.floor(Math.random() * 99999) + 1;
}

function seededRand(s) {
  let v = s;
  return () => {
    v = (v * 9301 + 49297) % 233280;
    return v / 233280;
  };
}

// ── INIT ──
function init() {
  orbits = [defaultOrbit(0), defaultOrbit(1), defaultOrbit(2)];
  regenField();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}

// ── FIELD DOTS ──
function fieldDotCount() {
  if (!document.getElementById("fieldEnabled").checked) return 0;
  const v = +document.getElementById("fieldDensity").value;
  return Math.round((v / 100) * 300); // 0 → 0, 100 → 300
}

function regenField() {
  const n = fieldDotCount();
  const r = seededRand(globalSeed);
  fieldDots = [];
  for (let i = 0; i < n; i++) fieldDots.push({ x: r() * W, y: r() * H });
  draw();
}

document.getElementById("fieldEnabled").addEventListener("change", function () {
  document.getElementById("fieldControls").style.opacity = this.checked
    ? "1"
    : "0.4";
  regenField();
});

// ── DATA ──
let dataTab_current = "manual";

function switchDataTab(tab) {
  dataTab_current = tab;
  ["manual", "CSV", "Paste"].forEach((t) => {
    document.getElementById("data" + t).style.display =
      tab === t.toLowerCase() ? "" : "none";
    document
      .getElementById("tab" + t)
      .classList.toggle("active", tab === t.toLowerCase());
  });
}

// Manual rows mirror orbit list
function renderManualRows() {
  const container = document.getElementById("manualRows");
  container.innerHTML = "";
  orbits.forEach((orb, i) => {
    const row = document.createElement("div");
    row.style.cssText = "margin-bottom:8px;";
    row.innerHTML = `
      <div style="font-size:10px;color:#bbb;font-family:-apple-system,sans-serif;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.06em;">orbit ${i + 1}</div>
      <div style="display:flex;gap:5px;align-items:center;">
        <input type="text" placeholder="label" value="${orb.label === `orbit ${i + 1}` ? "" : orb.label}"
          style="flex:1.4;" oninput="orbits[${i}].label=this.value||'orbit ${i + 1}';renderOrbitList();">
        <input type="number" placeholder="value" value="${orb.dataValue || ""}" min="0"
          style="flex:1;" oninput="orbits[${i}].dataValue=+this.value||0;recalcDots();redrawAll();">
      </div>
    `;
    container.appendChild(row);
  });
}

function recalcDots() {
  const budget = +document.getElementById("dotBudget").value;
  const total = orbits.reduce((s, o) => s + (o.dataValue || 0), 0);
  const hasData = total > 0;

  const summary = document.getElementById("dataSummary");
  summary.style.display = hasData ? "" : "none";
  if (hasData) {
    document.getElementById("dsTotalVal").textContent = total.toLocaleString();
    document.getElementById("dsOrbitCount").textContent =
      `across ${orbits.length} orbit${orbits.length !== 1 ? "s" : ""}`;
  }

  orbits.forEach((orb) => {
    if (hasData && orb.dataValue > 0) {
      orb.dotCount = Math.max(1, Math.round((orb.dataValue / total) * budget));
      orb.useData = true;
    } else if (hasData && orb.dataValue === 0) {
      orb.dotCount = 0;
      orb.useData = true;
    } else {
      orb.useData = false;
    }
  });

  renderOrbitList();
}

// CSV upload
document.getElementById("csvFile").addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => applyCSVText(e.target.result, true);
  reader.readAsText(file);
});

function parsePastedCSV() {
  applyCSVText(document.getElementById("csvPaste").value, false);
}

function applyCSVText(text, showStatus) {
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  const rows = [];
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 2) continue;
    const label = parts[0].trim().replace(/^["']|["']$/g, "");
    const val = parseFloat(parts[parts.length - 1].replace(/[^0-9.]/g, ""));
    if (!isNaN(val)) rows.push({ label, val });
  }
  // skip header if first val is 0 or NaN
  const cleaned = rows.filter((r) => r.val > 0);
  if (!cleaned.length) {
    if (showStatus)
      document.getElementById("csvStatus").textContent = "no valid rows found.";
    return;
  }

  // resize orbits to match data rows
  while (orbits.length < cleaned.length)
    orbits.push(defaultOrbit(orbits.length));
  while (orbits.length > cleaned.length) orbits.pop();

  cleaned.forEach((row, i) => {
    orbits[i].label = row.label;
    orbits[i].dataValue = row.val;
  });

  if (showStatus)
    document.getElementById("csvStatus").textContent =
      `✓ loaded ${cleaned.length} rows`;
  document.getElementById("orbitCount") &&
    (document.getElementById("orbitCount").value = orbits.length);
  recalcDots();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}

// ── ORBIT DOT GENERATION ──
function getCenter(orb) {
  if (document.getElementById("sharedCenter").checked || orb.cx === null) {
    return {
      x: +document.getElementById("centerX").value,
      y: +document.getElementById("centerY").value,
    };
  }
  return { x: orb.cx, y: orb.cy };
}

function generateOrbitDots(orb) {
  const r = seededRand(orb.seed);
  const c = getCenter(orb);
  const n = orb.dotCount;
  if (n <= 0) return [];

  const clumpCount = orb.clumpCount;
  const clumpSizeDeg = orb.clumpSize;
  const gapDeg = orb.clumpGap;
  const baseOffset = r() * 360;
  const clumpSepDeg = 360 / clumpCount;

  const clumps = [];
  for (let ci = 0; ci < clumpCount; ci++) {
    const center = baseOffset + ci * clumpSepDeg + (r() - 0.5) * gapDeg * 2;
    clumps.push({
      start: center - clumpSizeDeg / 2,
      end: center + clumpSizeDeg / 2,
    });
  }

  const dotsPerClump = Math.max(1, Math.floor(n / clumpCount));
  const extra = n - dotsPerClump * clumpCount;
  const dots = [];

  for (let ci = 0; ci < clumpCount; ci++) {
    const count = dotsPerClump + (ci < extra ? 1 : 0);
    const clump = clumps[ci];
    for (let di = 0; di < count; di++) {
      const angleDeg = clump.start + r() * (clump.end - clump.start);
      const angle = (angleDeg * Math.PI) / 180;
      const jitter = (r() - 0.5) * orb.radius * 0.07;
      dots.push({
        x: c.x + Math.cos(angle) * (orb.radius + jitter),
        y: c.y + Math.sin(angle) * (orb.radius + jitter),
      });
    }
  }
  return dots;
}

// ── DRAW ──
function draw() {
  const bg = document.getElementById("bgColor").value;
  const dotColor = document.getElementById("dotColor").value;
  const dotR = +document.getElementById("dotSize").value / 2;
  const showGuides = document.getElementById("showGuides").checked;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (showGuides) {
    orbits.forEach((orb) => {
      const c = getCenter(orb);
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.06)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, orb.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  ctx.fillStyle = dotColor;
  for (const d of fieldDots) {
    ctx.beginPath();
    ctx.arc(d.x, d.y, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const orb of orbits) {
    for (const d of generateOrbitDots(orb)) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (dragDot && mode === "moveField") {
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(dragDot.x, dragDot.y, dotR + 3.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function redrawAll() {
  draw();
}

// ── ORBIT LIST UI ──
function renderOrbitList() {
  const list = document.getElementById("orbitList");
  const dotColor = document.getElementById("dotColor").value;
  const shared = document.getElementById("sharedCenter").checked;
  list.innerHTML = "";

  orbits.forEach((orb, i) => {
    const item = document.createElement("div");
    item.className = "orbit-item";

    const dotCountLabel = orb.useData
      ? `${orb.dotCount} dots · ${orb.dataValue ? ((orb.dataValue / orbits.reduce((s, o) => s + o.dataValue, 0)) * 100).toFixed(1) + "%" : "0%"}`
      : `${orb.dotCount} dots`;

    const centerFields = !shared
      ? `
      <div class="orbit-sub">center</div>
      <div class="row"><label>cx / cy</label>
        <input type="number" value="${orb.cx ?? +document.getElementById("centerX").value}" style="width:48px;" oninput="setOrbitProp(${i},'cx',+this.value);redrawAll()">
        <input type="number" value="${orb.cy ?? +document.getElementById("centerY").value}" style="width:48px;" oninput="setOrbitProp(${i},'cy',+this.value);redrawAll()">
      </div>`
      : "";

    item.innerHTML = `
      <div class="orbit-item-header" onclick="toggleOrbit(${i})">
        <div class="orbit-dot-preview" style="background:${dotColor}"></div>
        <span class="orbit-label">${orb.label}</span>
        <span class="orbit-count-badge">${orb.dotCount}</span>
        <span class="orbit-arrow${orb.open ? " open" : ""}" id="orb-arrow-${i}">▶</span>
      </div>
      <div class="orbit-body${orb.open ? " open" : ""}" id="orb-body-${i}">
        <div class="orbit-sub">ring</div>
        <div class="row"><label>radius</label>
          <input type="range" min="20" max="400" value="${orb.radius}"
            oninput="setOrbitProp(${i},'radius',+this.value);syncVal(this,'orb-r-v-${i}');redrawAll()" style="flex:1">
          <span class="val" id="orb-r-v-${i}">${orb.radius}</span>
        </div>
        ${centerFields}
        <div class="orbit-sub">dot count</div>
        ${
          orb.useData
            ? `<div class="row"><label style="color:#aaa;font-style:italic;">driven by data</label><span class="val">${orb.dotCount}</span></div>
             <div class="row"><label>override</label>
               <input type="checkbox" id="orb-override-${i}" ${orb.overrideDots ? "checked" : ""}
                 onchange="toggleOverride(${i},this.checked)" style="cursor:pointer;">
             </div>
             ${
               orb.overrideDots
                 ? `
             <div class="row"><label>dot count</label>
               <input type="range" min="1" max="2000" value="${orb.dotCount}"
                 oninput="setOrbitProp(${i},'dotCount',+this.value);syncVal(this,'orb-dc-v-${i}');redrawAll()" style="flex:1">
               <span class="val" id="orb-dc-v-${i}">${orb.dotCount}</span>
             </div>`
                 : ""
             }`
            : `<div class="row"><label>dot count</label>
               <input type="range" min="1" max="2000" value="${orb.dotCount}"
                 oninput="setOrbitProp(${i},'dotCount',+this.value);syncVal(this,'orb-dc-v-${i}');redrawAll()" style="flex:1">
               <span class="val" id="orb-dc-v-${i}">${orb.dotCount}</span>
             </div>`
        }
        <div class="orbit-sub">clusters</div>
        <div class="row"><label>clump count</label>
          <input type="range" min="1" max="14" value="${orb.clumpCount}"
            oninput="setOrbitProp(${i},'clumpCount',+this.value);syncVal(this,'orb-cc-v-${i}');redrawAll()">
          <span class="val" id="orb-cc-v-${i}">${orb.clumpCount}</span>
        </div>
        <div class="row"><label>clump size°</label>
          <input type="range" min="3" max="140" value="${orb.clumpSize}"
            oninput="setOrbitProp(${i},'clumpSize',+this.value);syncVal(this,'orb-cs-v-${i}');redrawAll()">
          <span class="val" id="orb-cs-v-${i}">${orb.clumpSize}</span>
        </div>
        <div class="row"><label>gap jitter°</label>
          <input type="range" min="0" max="70" value="${orb.clumpGap}"
            oninput="setOrbitProp(${i},'clumpGap',+this.value);syncVal(this,'orb-cg-v-${i}');redrawAll()">
          <span class="val" id="orb-cg-v-${i}">${orb.clumpGap}</span>
        </div>
        <div class="btn-row" style="margin-top:4px;">
          <button onclick="reshuffleOrbit(${i})">reshuffle orbit</button>
        </div>
      </div>
    `;
    list.appendChild(item);
  });
}

function toggleOverride(i, checked) {
  orbits[i].overrideDots = checked;
  renderOrbitList();
}

function toggleOrbit(i) {
  orbits[i].open = !orbits[i].open;
  document
    .getElementById(`orb-body-${i}`)
    .classList.toggle("open", orbits[i].open);
  document
    .getElementById(`orb-arrow-${i}`)
    .classList.toggle("open", orbits[i].open);
}

function setOrbitProp(i, key, val) {
  orbits[i][key] = val;
}
function reshuffleOrbit(i) {
  orbits[i].seed = randSeed();
  redrawAll();
}
function reshuffleAll() {
  globalSeed = randSeed();
  orbits.forEach((o) => (o.seed = randSeed()));
  regenField();
  redrawAll();
}

// ── SECTION / MODE ──
function toggleSection(header) {
  const body = header.nextElementSibling;
  const arrow = header.querySelector(".section-arrow");
  body.classList.toggle("open");
  arrow.classList.toggle("open");
}

function onSharedCenterChange() {
  const shared = document.getElementById("sharedCenter").checked;
  document.getElementById("sharedCenterRow").style.display = shared
    ? ""
    : "none";
  renderOrbitList();
  redrawAll();
}

function setMode(m) {
  mode = m;
  document
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  const id = "mode" + m.charAt(0).toUpperCase() + m.slice(1);
  document.getElementById(id) &&
    document.getElementById(id).classList.add("active");
  const hints = {
    view: "",
    moveField: "drag any field dot to reposition it",
    moveCenter: "click canvas to set orbit center",
  };
  document.getElementById("modeHint").textContent = hints[m] || "";
  canvas.style.cursor = m === "view" ? "default" : "crosshair";
}

// ── CANVAS INTERACTION ──
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * (W / rect.width),
    y: (src.clientY - rect.top) * (H / rect.height),
  };
}

canvas.addEventListener("mousedown", (e) => {
  const pos = getPos(e);
  if (mode === "moveField") {
    const r = +document.getElementById("dotSize").value / 2 + 5;
    dragDot = fieldDots.find((d) => Math.hypot(d.x - pos.x, d.y - pos.y) < r);
    if (dragDot) {
      dragOffX = dragDot.x - pos.x;
      dragOffY = dragDot.y - pos.y;
    }
  }
  if (mode === "moveCenter") {
    document.getElementById("centerX").value = Math.round(pos.x);
    document.getElementById("centerY").value = Math.round(pos.y);
    redrawAll();
  }
});
canvas.addEventListener("mousemove", (e) => {
  if (mode === "moveField" && dragDot) {
    const pos = getPos(e);
    dragDot.x = pos.x + dragOffX;
    dragDot.y = pos.y + dragOffY;
    draw();
  }
});
canvas.addEventListener("mouseup", () => {
  dragDot = null;
});
canvas.addEventListener("mouseleave", () => {
  dragDot = null;
});
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    const pos = getPos(e);
    if (mode === "moveField") {
      const r = +document.getElementById("dotSize").value / 2 + 7;
      dragDot = fieldDots.find((d) => Math.hypot(d.x - pos.x, d.y - pos.y) < r);
      if (dragDot) {
        dragOffX = dragDot.x - pos.x;
        dragOffY = dragDot.y - pos.y;
      }
    }
  },
  { passive: false },
);
canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    if (mode === "moveField" && dragDot) {
      const pos = getPos(e);
      dragDot.x = pos.x + dragOffX;
      dragDot.y = pos.y + dragOffY;
      draw();
    }
  },
  { passive: false },
);
canvas.addEventListener("touchend", () => {
  dragDot = null;
});

// ── HELPERS ──
function syncVal(el, id) {
  const o = document.getElementById(id);
  if (o) o.textContent = el.value;
}

function onDotColorChange() {
  document
    .querySelectorAll(".orbit-dot-preview")
    .forEach(
      (el) => (el.style.background = document.getElementById("dotColor").value),
    );
  draw();
}

// ── EXPORT ──
function exportSVG() {
  const bg = document.getElementById("bgColor").value;
  const dotColor = document.getElementById("dotColor").value;
  const r = +document.getElementById("dotSize").value / 2;
  let circles = "";
  for (const d of fieldDots)
    circles += `<circle cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${r}"/>`;
  for (const orb of orbits)
    for (const d of generateOrbitDots(orb))
      circles += `<circle cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${r}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/><g fill="${dotColor}">${circles}</g></svg>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  a.download = "dot-orbit.svg";
  a.click();
}

function exportPNG() {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "dot-orbit.png";
  a.click();
}

init();
