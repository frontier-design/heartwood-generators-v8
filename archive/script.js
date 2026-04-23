// ── p5 REFERENCE ──
let p5ref;

// ── STATE ──
let mode = "view";
let globalSeed = randSeed();
let fieldDots = [];
let dragDot = null,
  dragOffX = 0,
  dragOffY = 0;
let dataTab = "manual";
let W, H;

let orbits = [];

// ── CACHED DOM REFS ──
const dom = {};
const DOM_IDS = [
  "bgColor",
  "bgHex",
  "dotColor",
  "dotHex",
  "dotSize",
  "dotBlur",
  "bgGrain",
  "dotGrain",
  "metaballs",
  "metaballMerge",
  "showGuides",
  "fieldEnabled",
  "fieldDensity",
  "fieldControls",
  "sharedCenter",
  "sharedCenterRow",
  "centerX",
  "centerY",
  "dotBudget",
  "csvPaste",
  "csvFile",
  "csvStatus",
  "dsTotalVal",
  "dsOrbitCount",
  "dataSummary",
  "panel",
  "modeBar",
  "exportDock",
  "manualRows",
  "orbitList",
  "orbitCount",
  "bgSwatches",
  "dotSwatches",
];
function cacheDom() {
  for (const id of DOM_IDS) dom[id] = document.getElementById(id);
}

function defaultOrbit(i) {
  return {
    id: i,
    label: `Orbit ${i + 1}`,
    dataValue: 0,
    dotCount: 20,
    useData: false,
    radius: 70 + i * 90,
    cx: null,
    cy: null,
    clumpCount: 3,
    clumpSize: 28,
    clumpGap: 12,
    ringPull: 86,
    color: null,
    open: false,
    seed: randSeed(),
    dots: [],
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

// ── EASING ──
// Duration-based easing (frame-rate independent). 1167ms matches the
// prior behavior of 35 frames at 30fps. Each dot stores `animStart` (the
// ms timestamp at which its current transition began); a value of 0 (or
// any time > ANIM_DURATION_MS in the past) means the dot is settled.
const ANIM_DURATION_MS = 1167;

function cubicBezier(x1, y1, x2, y2) {
  return function (t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const bx =
        3 * (1 - u) * (1 - u) * u * x1 +
        3 * (1 - u) * u * u * x2 +
        u * u * u -
        t;
      if (Math.abs(bx) < 0.001) break;
      const dx =
        3 * (1 - u) * (1 - u) * x1 +
        6 * (1 - u) * u * (x2 - x1) +
        3 * u * u * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      u -= bx / dx;
    }
    return (
      3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u
    );
  };
}

const ease = cubicBezier(0, 0.994, 0.68, 1);

// ── DOT TEXTURE / GRAIN ──
// Each dot is stamped from a cached sprite with a radial-gradient falloff
// so its edge reads as a soft blur rather than a hard circle. Sprites are
// keyed by color + diameter so changes are amortized. A small noise tile
// is generated once and composited over the canvas each frame to give the
// image a film-grain texture.
const dotSpriteCache = new Map();
let grainCanvas = null;
let grainOffset = 0;

// dotMask tracks every dot footprint as a solid alpha silhouette (built
// once per frame during the dot loop). grainScratch is a reusable buffer we
// fill with tiled grain and then mask by dotMask using destination-in or
// destination-out, producing a grain layer that only paints the dot region
// or only paints the background region respectively.
let dotMaskCanvas = null;
let dotMaskCtx = null;
let grainScratchCanvas = null;
let grainScratchCtx = null;

function ensureDotMaskCanvas() {
  if (!dotMaskCanvas) {
    dotMaskCanvas = document.createElement("canvas");
    dotMaskCtx = dotMaskCanvas.getContext("2d");
  }
  if (dotMaskCanvas.width !== W || dotMaskCanvas.height !== H) {
    dotMaskCanvas.width = W;
    dotMaskCanvas.height = H;
  }
  return dotMaskCtx;
}

function ensureGrainScratchCanvas() {
  if (!grainScratchCanvas) {
    grainScratchCanvas = document.createElement("canvas");
    grainScratchCtx = grainScratchCanvas.getContext("2d");
  }
  if (grainScratchCanvas.width !== W || grainScratchCanvas.height !== H) {
    grainScratchCanvas.width = W;
    grainScratchCanvas.height = H;
  }
  return grainScratchCtx;
}

function tileGrain(ctx2, offset) {
  const tile = grainCanvas.width;
  const startX = -offset;
  const startY = -((offset * 13) % tile);
  for (let y = startY; y < H; y += tile) {
    for (let x = startX; x < W; x += tile) {
      ctx2.drawImage(grainCanvas, x, y);
    }
  }
}

// ── METABALLS ──
// When metaball mode is on, all dots are rendered as solid disks into an
// off-screen canvas filled with the current background color. Blitting that
// canvas onto the main canvas through a `blur() contrast()` filter smears
// nearby dots together and then snaps the soft edges back into hard blobs
// — the same gooey trick behind the Coding Train sketch this is modelled on
// (https://editor.p5js.org/codingtrain/sketches/ISPozOLXW).
let metaballCanvas = null;
let metaballCtx = null;
// Cached <feGaussianBlur> node inside the inline SVG goo filter; its
// stdDeviation is updated each frame to match the Merge slider.
let metaballFilterBlur = null;

function ensureMetaballCanvas() {
  if (!metaballCanvas) {
    metaballCanvas = document.createElement("canvas");
    metaballCtx = metaballCanvas.getContext("2d");
  }
  if (metaballCanvas.width !== W || metaballCanvas.height !== H) {
    metaballCanvas.width = W;
    metaballCanvas.height = H;
  }
  return metaballCtx;
}

function hexToRgba(hex, alpha) {
  let h = String(hex).replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getDotSprite(color, diameter, blur) {
  const d = Math.max(1, Math.round(diameter));
  const b = Math.max(0, Math.min(1, blur));
  // Quantize blur to the nearest 5% to keep the cache bounded while a user
  // drags the slider.
  const bKey = Math.round(b * 20);
  const key = `${color.toLowerCase()}|${d}|${bKey}`;
  const cached = dotSpriteCache.get(key);
  if (cached) return cached;

  const innerR = d / 2;
  const halo = innerR * b * 1.6;
  const outerR = innerR + halo;
  const pad = Math.ceil(halo) + 1;
  const size = d + pad * 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const cx = size / 2;

  if (halo <= 0.01) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cx, innerR, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const holdStop = innerR / outerR;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, outerR);
    grad.addColorStop(0, color);
    grad.addColorStop(Math.max(0, holdStop - 0.05), color);
    grad.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cx, outerR, 0, Math.PI * 2);
    ctx.fill();
  }

  const sprite = { canvas: c, size, half: size / 2 };
  dotSpriteCache.set(key, sprite);
  return sprite;
}

function createGrainTile(size = 192, strength = 42) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * strength;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ── p5 SKETCH (instance mode) ──
const sketch = (p) => {
  p.setup = () => {
    p5ref = p;
    W = p.windowWidth;
    H = p.windowHeight;
    p.createCanvas(W, H);
    p.frameRate(30);

    cacheDom();
    grainCanvas = createGrainTile();
    metaballFilterBlur = document.querySelector(
      "#metaballFilter feGaussianBlur",
    );

    dom.centerX.value = Math.round(W / 2);
    dom.centerY.value = Math.round(H / 2);

    const cnv = p.canvas;
    cnv.addEventListener("mousedown", onCanvasMouseDown);
    cnv.addEventListener("mousemove", onCanvasMouseMove);
    cnv.addEventListener("mouseup", onCanvasMouseUp);
    cnv.addEventListener("mouseleave", onCanvasMouseUp);
    cnv.addEventListener("touchstart", onCanvasTouchStart, { passive: false });
    cnv.addEventListener("touchmove", onCanvasTouchMove, { passive: false });
    cnv.addEventListener("touchend", onCanvasMouseUp);

    init();
  };

  p.draw = () => {
    const bg = dom.bgColor.value;
    const dotColor = dom.dotColor.value;
    const dotD = +dom.dotSize.value;
    const showGuides = dom.showGuides.checked;

    p.background(bg);

    if (showGuides) {
      p.push();
      p.noFill();
      p.stroke(0, 24);
      p.strokeWeight(1);
      orbits.forEach((orb) => {
        const c = getCenter(orb);
        p.circle(c.x, c.y, orb.radius * 2);
      });
      p.pop();
    }

    const nowMs = p.millis();
    const t = nowMs * 0.001;
    const drift = 3.5;
    let animating = false;

    const stepDot = (d) => {
      if (d.animStart <= 0) return;
      const elapsed = nowMs - d.animStart;
      if (elapsed >= ANIM_DURATION_MS) {
        d.x = d.tx;
        d.y = d.ty;
        d.animStart = 0;
        return;
      }
      const e = ease(elapsed / ANIM_DURATION_MS);
      d.x = d.sx + (d.tx - d.sx) * e;
      d.y = d.sy + (d.ty - d.sy) * e;
      animating = true;
    };

    const ctx = p.drawingContext;
    const blurAmt = +dom.dotBlur.value / 100;
    const fieldMode = mode === "moveField";
    const metaballsOn = dom.metaballs.checked;
    const r = dotD / 2;

    const bgGrainAmt = +dom.bgGrain.value / 100;
    const dotGrainAmt = +dom.dotGrain.value / 100;
    const needsMask =
      !!grainCanvas && (bgGrainAmt > 0.001 || dotGrainAmt > 0.001);

    let maskCtx = null;
    if (needsMask) {
      maskCtx = ensureDotMaskCanvas();
      maskCtx.globalCompositeOperation = "source-over";
      maskCtx.clearRect(0, 0, W, H);
      maskCtx.fillStyle = "#000";
      maskCtx.beginPath();
    }

    let mctx = null;
    if (metaballsOn) {
      mctx = ensureMetaballCanvas();
      // Transparent base — the SVG goo filter only needs the colored dot
      // shapes; the main canvas's background shows through where blobs
      // aren't, so colors match exactly between modes.
      mctx.globalCompositeOperation = "source-over";
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = dotColor;
      mctx.beginPath();
    }

    const fieldSprite = metaballsOn
      ? null
      : getDotSprite(dotColor, dotD, blurAmt);
    if (!metaballsOn) p.noStroke();

    for (let fi = 0; fi < fieldDots.length; fi++) {
      const d = fieldDots[fi];
      if (d !== dragDot) stepDot(d);
      const ox = Math.sin(t * 0.4 + fi * 1.7) * drift;
      const oy = Math.cos(t * 0.3 + fi * 2.3) * drift;
      const dx = d.x + ox;
      const dy = d.y + oy;

      if (metaballsOn) {
        mctx.moveTo(dx + r, dy);
        mctx.arc(dx, dy, r, 0, Math.PI * 2);
      } else {
        if (fieldMode) {
          p.noFill();
          p.stroke(255, 0, 0);
          p.strokeWeight(1);
          p.circle(dx, dy, dotD + 6);
          p.noStroke();
        }
        ctx.drawImage(
          fieldSprite.canvas,
          dx - fieldSprite.half,
          dy - fieldSprite.half,
        );
      }
      if (needsMask) {
        maskCtx.moveTo(dx + r, dy);
        maskCtx.arc(dx, dy, r, 0, Math.PI * 2);
      }
    }
    if (metaballsOn) mctx.fill();

    let di = 0;
    for (const orb of orbits) {
      const orbColor = orb.color || dotColor;
      const sprite = metaballsOn ? null : getDotSprite(orbColor, dotD, blurAmt);
      if (metaballsOn) {
        mctx.fillStyle = orbColor;
        mctx.beginPath();
      }
      for (let j = 0; j < orb.dots.length; j++) {
        const d = orb.dots[j];
        stepDot(d);
        const ox = Math.sin(t * 0.5 + di * 1.3) * drift;
        const oy = Math.cos(t * 0.35 + di * 1.9) * drift;
        const dx = d.x + ox;
        const dy = d.y + oy;
        if (metaballsOn) {
          mctx.moveTo(dx + r, dy);
          mctx.arc(dx, dy, r, 0, Math.PI * 2);
        } else {
          ctx.drawImage(sprite.canvas, dx - sprite.half, dy - sprite.half);
        }
        if (needsMask) {
          maskCtx.moveTo(dx + r, dy);
          maskCtx.arc(dx, dy, r, 0, Math.PI * 2);
        }
        di++;
      }
      if (metaballsOn) mctx.fill();
    }

    if (needsMask) maskCtx.fill();

    if (metaballsOn) {
      // Blit the colored dot scene through the SVG goo filter. The filter
      // blurs alpha and snaps it to a binary edge while leaving RGB alone,
      // so blob colors stay true to the source dots and merging regions
      // show a clean blend of neighboring colors.
      const merge = +dom.metaballMerge.value;
      if (metaballFilterBlur) {
        metaballFilterBlur.setAttribute("stdDeviation", String(merge));
      }
      ctx.save();
      ctx.filter = "url(#metaballFilter)";
      ctx.drawImage(metaballCanvas, 0, 0);
      ctx.restore();
    }

    if (dragDot && mode === "moveField") {
      p.noFill();
      p.stroke(metaballsOn ? 0 : 255, 166);
      p.strokeWeight(1.5);
      p.circle(dragDot.x, dragDot.y, dotD + 7);
    }

    // Film-grain overlay: tile a noise canvas across the frame with a
    // soft-light blend, twice — once masked to the background (everything
    // except dot footprints) and once masked to the dots themselves — so
    // each region can be tuned independently. Slight per-frame jitter keeps
    // the texture alive.
    if (grainCanvas && (bgGrainAmt > 0.001 || dotGrainAmt > 0.001)) {
      const tile = grainCanvas.width;
      grainOffset = (grainOffset + 7) % tile;

      if (bgGrainAmt > 0.001) {
        const sctx = ensureGrainScratchCanvas();
        sctx.globalCompositeOperation = "source-over";
        sctx.clearRect(0, 0, W, H);
        tileGrain(sctx, grainOffset);
        sctx.globalCompositeOperation = "destination-out";
        sctx.drawImage(dotMaskCanvas, 0, 0);

        ctx.save();
        ctx.globalCompositeOperation = "soft-light";
        ctx.globalAlpha = bgGrainAmt;
        ctx.drawImage(grainScratchCanvas, 0, 0);
        ctx.restore();
      }

      if (dotGrainAmt > 0.001) {
        const sctx = ensureGrainScratchCanvas();
        sctx.globalCompositeOperation = "source-over";
        sctx.clearRect(0, 0, W, H);
        tileGrain(sctx, grainOffset);
        sctx.globalCompositeOperation = "destination-in";
        sctx.drawImage(dotMaskCanvas, 0, 0);

        ctx.save();
        ctx.globalCompositeOperation = "soft-light";
        ctx.globalAlpha = dotGrainAmt;
        ctx.drawImage(grainScratchCanvas, 0, 0);
        ctx.restore();
      }
    }

    // Idle gating: stop the loop when nothing is animating and nothing
    // is being dragged. The subtle sin/cos drift is sacrificed while idle
    // to preserve battery; any interaction resumes it via kickLoop().
    if (!animating && !dragDot && !fieldMode) {
      p.noLoop();
    }
  };

  p.windowResized = () => {
    W = p.windowWidth;
    H = p.windowHeight;
    p.resizeCanvas(W, H);
    regenField();
    syncAllOrbits();
    kickLoop();
  };
};

// ── ORBIT DOT SYNC ──
function retargetDots(arr, targets, rand) {
  const now = p5ref ? p5ref.millis() : 0;
  while (arr.length < targets.length) {
    const nx = rand() * W,
      ny = rand() * H;
    arr.push({
      x: nx,
      y: ny,
      sx: nx,
      sy: ny,
      tx: nx,
      ty: ny,
      animStart: 0,
    });
  }
  arr.length = targets.length;
  for (let i = 0; i < targets.length; i++) {
    const d = arr[i];
    const tx = targets[i].x,
      ty = targets[i].y;
    if (Math.abs(d.tx - tx) > 0.5 || Math.abs(d.ty - ty) > 0.5) {
      d.sx = d.x;
      d.sy = d.y;
      d.tx = tx;
      d.ty = ty;
      d.animStart = now;
    }
  }
}

function syncOrbitDots(orb) {
  const targets = generateOrbitDots(orb);
  retargetDots(orb.dots, targets, seededRand(orb.seed ^ 0x9e3779b1));
}

function syncAllOrbits() {
  orbits.forEach((orb) => syncOrbitDots(orb));
}

// ── GLOBAL DRAW TRIGGERS ──
function kickLoop() {
  if (p5ref && typeof p5ref.loop === "function") p5ref.loop();
}

function onMetaballsToggle() {
  const on = dom.metaballs && dom.metaballs.checked;
  document.body.classList.toggle("metaballs-on", !!on);
  kickLoop();
}
function redrawAll() {
  syncAllOrbits();
  kickLoop();
}

// ── INIT ──
function init() {
  orbits = [defaultOrbit(0), defaultOrbit(1), defaultOrbit(2)];
  initSwatches();
  regenField();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}

// ── FIELD DOTS ──
function fieldDotCount() {
  if (!dom.fieldEnabled.checked) return 0;
  const v = +dom.fieldDensity.value;
  return Math.round((v / 100) * 300);
}

function regenField() {
  const n = fieldDotCount();
  const posRand = seededRand(globalSeed ^ 0x85ebca6b);
  const targetRand = seededRand(globalSeed);
  const targets = [];
  for (let i = 0; i < n; i++) {
    targets.push({ x: targetRand() * W, y: targetRand() * H });
  }
  retargetDots(fieldDots, targets, posRand);
  kickLoop();
}

document.getElementById("fieldEnabled").addEventListener("change", function () {
  document.getElementById("fieldControls").style.opacity = this.checked
    ? "1"
    : "0.4";
  regenField();
});

// ── DATA ──
function switchDataTab(tab) {
  dataTab = tab;
  ["Manual", "CSV", "Paste"].forEach((t) => {
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

function renderManualRows() {
  const container = dom.manualRows;
  container.innerHTML = "";
  orbits.forEach((orb, i) => {
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

function recalcDots() {
  const budget = +dom.dotBudget.value;
  const total = orbits.reduce((s, o) => s + (o.dataValue || 0), 0);
  const hasData = total > 0;

  dom.dataSummary.style.display = hasData ? "" : "none";
  if (hasData) {
    dom.dsTotalVal.textContent = total.toLocaleString();
    dom.dsOrbitCount.textContent = `across ${orbits.length} orbit${orbits.length !== 1 ? "s" : ""}`;
  }

  orbits.forEach((orb) => {
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

document.getElementById("csvFile").addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => applyCSVText(e.target.result, true);
  reader.readAsText(file);
});

function parsePastedCSV() {
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

  while (orbits.length < cleaned.length)
    orbits.push(defaultOrbit(orbits.length));
  while (orbits.length > cleaned.length) orbits.pop();

  cleaned.forEach((row, i) => {
    orbits[i].label = row.label;
    orbits[i].dataValue = row.val;
  });

  if (showStatus) dom.csvStatus.textContent = `loaded ${cleaned.length} rows`;
  if (dom.orbitCount) dom.orbitCount.value = orbits.length;
  recalcDots();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}

// ── ORBIT DOT GENERATION ──
function getCenter(orb) {
  if (dom.sharedCenter.checked || orb.cx === null) {
    return {
      x: +dom.centerX.value,
      y: +dom.centerY.value,
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
      // Ring Pull maps [0..100] → radial-scatter multiplier [0.5..0]. A high
      // pull clamps dots near the ring; a low pull lets them drift as far as
      // ±50% of the orbit radius from the ring line.
      const pull = orb.ringPull != null ? orb.ringPull : 86;
      const scatter = (1 - Math.max(0, Math.min(100, pull)) / 100) * 0.5;
      const jitter = (r() - 0.5) * orb.radius * scatter;
      dots.push({
        x: c.x + Math.cos(angle) * (orb.radius + jitter),
        y: c.y + Math.sin(angle) * (orb.radius + jitter),
      });
    }
  }
  return dots;
}

// ── ORBIT LIST UI ──
const orbitRowRefs = [];

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

  // Header
  const header = document.createElement("div");
  header.className = "orbit-item-header";
  header.addEventListener("click", () => toggleOrbit(i));
  item.appendChild(header);

  if (orbits.length > 1) {
    const removeBtn = document.createElement("button");
    removeBtn.className = "orbit-remove orbit-remove-inline";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeOrbit(i);
    });
    header.appendChild(removeBtn);
  }

  const preview = document.createElement("div");
  preview.className = "orbit-dot-preview";
  preview.style.background = orb.color || dotColor;
  header.appendChild(preview);

  const labelSpan = document.createElement("span");
  labelSpan.className = "orbit-label";
  labelSpan.textContent = orb.label;
  header.appendChild(labelSpan);

  const countBadge = document.createElement("span");
  countBadge.className = "orbit-count-badge";
  countBadge.textContent = String(orb.dotCount);
  header.appendChild(countBadge);

  const arrow = document.createElement("span");
  arrow.className = "orbit-arrow" + (orb.open ? " open" : "");
  arrow.setAttribute("aria-hidden", "true");
  header.appendChild(arrow);

  // Body
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
    });
    cRow.appendChild(cyInput);
    body.appendChild(cRow);
  }

  // Color section
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

function renderOrbitList() {
  const list = dom.orbitList;
  list.innerHTML = "";
  orbitRowRefs.length = 0;
  orbits.forEach((orb, i) => {
    list.appendChild(createOrbitRow(orb, i));
  });
}

function updateOrbitSwatchActive(i) {
  const refs = orbitRowRefs[i];
  if (!refs) return;
  const orb = orbits[i];
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
  orbits[i].color = color;
  updateOrbitSwatchActive(i);
  redrawAll();
}

function clearOrbitColor(i) {
  orbits[i].color = null;
  updateOrbitSwatchActive(i);
  redrawAll();
}

function toggleOverride(i, checked) {
  orbits[i].overrideDots = checked;
  const refs = orbitRowRefs[i];
  if (refs) renderDotCountSection(refs.dotCountHost, orbits[i], i);
}

function toggleOrbit(i) {
  orbits[i].open = !orbits[i].open;
  const refs = orbitRowRefs[i];
  if (!refs) return;
  refs.body.classList.toggle("open", orbits[i].open);
  refs.arrow.classList.toggle("open", orbits[i].open);
}

function addOrbit() {
  orbits.push(defaultOrbit(orbits.length));
  recalcDots();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}

function removeOrbit(i) {
  if (orbits.length <= 1) return;
  orbits.splice(i, 1);
  recalcDots();
  renderManualRows();
  renderOrbitList();
  redrawAll();
}

function setOrbitProp(i, key, val) {
  orbits[i][key] = val;
  syncOrbitDots(orbits[i]);
  kickLoop();
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

// ── PANEL TOGGLE (H key) ──
function togglePanel() {
  if (dom.panel) dom.panel.classList.toggle("hidden");
  if (dom.modeBar) dom.modeBar.classList.toggle("hidden");
  if (dom.exportDock) dom.exportDock.classList.toggle("hidden");
}

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

// ── SECTION / MODE ──
function toggleSection(header) {
  if (!header) return;
  const body = header.nextElementSibling;
  const arrow = header.querySelector(".section-arrow");
  if (body) body.classList.toggle("open");
  if (arrow) arrow.classList.toggle("open");
}

function onSharedCenterChange() {
  const shared = dom.sharedCenter.checked;
  if (dom.sharedCenterRow) {
    dom.sharedCenterRow.style.display = shared ? "" : "none";
  }
  renderOrbitList();
  redrawAll();
}

function setMode(m) {
  mode = m;
  document
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  const id = "mode" + m.charAt(0).toUpperCase() + m.slice(1);
  const btn = document.getElementById(id);
  if (btn) btn.classList.add("active");
  if (p5ref) p5ref.canvas.style.cursor = m === "view" ? "default" : "crosshair";
  kickLoop();
}

// ── CANVAS INTERACTION ──
function getPos(e) {
  const rect = p5ref.canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * (W / rect.width),
    y: (src.clientY - rect.top) * (H / rect.height),
  };
}

function onCanvasMouseDown(e) {
  const pos = getPos(e);
  if (mode === "moveField") {
    const r = +dom.dotSize.value / 2 + 5;
    dragDot = fieldDots.find((d) => Math.hypot(d.x - pos.x, d.y - pos.y) < r);
    if (dragDot) {
      dragOffX = dragDot.x - pos.x;
      dragOffY = dragDot.y - pos.y;
      kickLoop();
    }
  }
  if (mode === "moveCenter") {
    dom.centerX.value = Math.round(pos.x);
    dom.centerY.value = Math.round(pos.y);
    redrawAll();
  }
}

function onCanvasMouseMove(e) {
  if (mode === "moveField" && dragDot) {
    const pos = getPos(e);
    dragDot.x = pos.x + dragOffX;
    dragDot.y = pos.y + dragOffY;
  }
}

function onCanvasMouseUp() {
  if (dragDot) {
    dragDot.sx = dragDot.x;
    dragDot.sy = dragDot.y;
    dragDot.tx = dragDot.x;
    dragDot.ty = dragDot.y;
    dragDot.animStart = 0;
  }
  dragDot = null;
}

function onCanvasTouchStart(e) {
  e.preventDefault();
  const pos = getPos(e);
  if (mode === "moveField") {
    const r = +dom.dotSize.value / 2 + 7;
    dragDot = fieldDots.find((d) => Math.hypot(d.x - pos.x, d.y - pos.y) < r);
    if (dragDot) {
      dragOffX = dragDot.x - pos.x;
      dragOffY = dragDot.y - pos.y;
      kickLoop();
    }
  }
}

function onCanvasTouchMove(e) {
  e.preventDefault();
  if (mode === "moveField" && dragDot) {
    const pos = getPos(e);
    dragDot.x = pos.x + dragOffX;
    dragDot.y = pos.y + dragOffY;
  }
}

// ── COLOR SWATCHES ──
const SWATCHES = [
  "#212121",
  "#5696c2",
  "#feecd4",
  "#4f3321",
  "#ff6839",
  "#f9f9f9",
  "#281911",
  "#e9efcd",
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

function selectBgColor(color) {
  dom.bgColor.value = color;
  dom.bgHex.textContent = color;
  updateSwatchActive("bgSwatches", color);
  kickLoop();
}

function selectDotColor(color) {
  dom.dotColor.value = color;
  dom.dotHex.textContent = color;
  updateSwatchActive("dotSwatches", color);
  onDotColorChange();
  kickLoop();
}

function initSwatches() {
  buildSwatches("bgSwatches", "bgColor", "bgHex", selectBgColor);
  buildSwatches("dotSwatches", "dotColor", "dotHex", selectDotColor);
}

// ── HELPERS ──
function syncVal(el, id) {
  const o = document.getElementById(id);
  if (o) o.textContent = el.value;
  kickLoop();
}

function onDotColorChange() {
  renderOrbitList();
}

// ── EXPORT ──
function exportSVG() {
  const bg = dom.bgColor.value;
  const dotColor = dom.dotColor.value;
  const r = +dom.dotSize.value / 2;
  const metaballsOn = dom.metaballs.checked;
  let circles = "";
  for (const d of fieldDots)
    circles += `<circle cx="${d.tx.toFixed(2)}" cy="${d.ty.toFixed(2)}" r="${r}" fill="${dotColor}"/>`;
  for (const orb of orbits) {
    const c = orb.color || dotColor;
    for (const d of generateOrbitDots(orb))
      circles += `<circle cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${r}" fill="${c}"/>`;
  }

  let defs = "";
  let group = circles;
  if (metaballsOn) {
    const merge = +dom.metaballMerge.value;
    // Classic SVG gooey: blur the alpha channel, then push mid-alpha values
    // to either fully opaque or fully transparent via a color matrix so the
    // soft halos snap into hard-edged blobs.
    defs = `<defs><filter id="goo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="${merge}" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter></defs>`;
    group = `<g filter="url(#goo)">${circles}</g>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}<rect width="${W}" height="${H}" fill="${bg}"/>${group}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: "dot-orbit.svg",
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportPNG() {
  const a = document.createElement("a");
  a.href = p5ref.canvas.toDataURL("image/png");
  a.download = "dot-orbit.png";
  a.click();
}

// ── LAUNCH ──
new p5(sketch, document.getElementById("canvasContainer"));
