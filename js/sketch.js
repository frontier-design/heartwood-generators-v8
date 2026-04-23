import {
  state,
  dom,
  cacheDom,
  defaultSharedCenter,
  ANIM_DURATION_MS,
  ease,
} from "./state.js";
import {
  render,
  createGrainTile,
  getDotSprite,
  ensureDotMaskCanvas,
  ensureGrainScratchCanvas,
  tileGrain,
  ensureMetaballCanvas,
} from "./rendering.js";
import { getCenter, logOrbitCenters } from "./orbit-gen.js";
import { regenField, kickLoop, init } from "./core.js";
import { syncAllOrbits, spawnScatteredDots } from "./orbit-gen.js";
import { setupCanvasListeners } from "./interaction.js";

export const sketch = (p) => {
  p.setup = () => {
    state.p5ref = p;
    state.W = p.windowWidth;
    state.H = p.windowHeight;
    p.createCanvas(state.W, state.H);
    p.frameRate(30);

    cacheDom();
    render.grainCanvas = createGrainTile();
    render.metaballFilterBlur = document.querySelector(
      "#metaballFilter feGaussianBlur",
    );

    const c0 = defaultSharedCenter(state.W, state.H);
    dom.centerX.value = String(c0.x);
    dom.centerY.value = String(c0.y);

    setupCanvasListeners(p.canvas);
    init();
    logOrbitCenters("initial layout");
  };

  p.draw = () => {
    try {
      return _draw(p);
    } catch (e) {
      console.error("[draw error]", e);
    }
  };

  const _draw = (p) => {
    const bg = dom.bgColor.value;
    const dotColor = dom.dotColor.value;
    const dotD = +dom.dotSize.value;
    const showGuides = dom.showGuides.checked;

    p.background(bg);

    if (showGuides && !state.scattered) {
      p.push();
      p.noFill();
      p.stroke(0, 24);
      p.strokeWeight(1);
      state.orbits.forEach((orb) => {
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
      if (d.animStart > 0) {
        const elapsed = nowMs - d.animStart;
        if (elapsed >= ANIM_DURATION_MS) {
          d.x = d.tx;
          d.y = d.ty;
          d.animStart = 0;
        } else {
          const e = ease(elapsed / ANIM_DURATION_MS);
          d.x = d.sx + (d.tx - d.sx) * e;
          d.y = d.sy + (d.ty - d.sy) * e;
          animating = true;
        }
      }
      if (d.scale == null) {
        d.scale = 1;
        d.scaleDur = 0;
        d.scaleFrom = 1;
        d.scaleTo = 1;
        d.scaleT0 = 0;
        d.dying = false;
      }
      if (d.scaleDur > 0) {
        const se = nowMs - d.scaleT0;
        if (se >= d.scaleDur) {
          d.scale = d.scaleTo;
          d.scaleDur = 0;
        } else if (se > 0) {
          const ee = ease(se / d.scaleDur);
          d.scale = d.scaleFrom + (d.scaleTo - d.scaleFrom) * ee;
          animating = true;
        }
      }
    };

    const ctx = p.drawingContext;
    const blurAmt = +dom.dotBlur.value / 100;
    const fieldMode = state.mode === "moveField";
    const metaballsOn = dom.metaballs.checked;
    const r = dotD / 2;

    const bgGrainAmt = +dom.bgGrain.value / 100;
    const dotGrainAmt = +dom.dotGrain.value / 100;
    const needsMask =
      !!render.grainCanvas && (bgGrainAmt > 0.001 || dotGrainAmt > 0.001);

    let maskCtx = null;
    if (needsMask) {
      maskCtx = ensureDotMaskCanvas();
      maskCtx.globalCompositeOperation = "source-over";
      maskCtx.clearRect(0, 0, state.W, state.H);
      maskCtx.fillStyle = "#000";
      maskCtx.beginPath();
    }

    let mctx = null;
    if (metaballsOn) {
      mctx = ensureMetaballCanvas();
      mctx.globalCompositeOperation = "source-over";
      mctx.clearRect(0, 0, state.W, state.H);
      mctx.fillStyle = dotColor;
      mctx.beginPath();
    }

    const fieldSprite = metaballsOn
      ? null
      : getDotSprite(dotColor, dotD, blurAmt);
    if (!metaballsOn) p.noStroke();

    for (let fi = 0; fi < state.fieldDots.length; fi++) {
      const d = state.fieldDots[fi];
      if (d !== state.dragDot) stepDot(d);
      const ox = Math.sin(t * 0.4 + fi * 1.7) * drift;
      const oy = Math.cos(t * 0.3 + fi * 2.3) * drift;
      const dx = d.x + ox;
      const dy = d.y + oy;
      const s = d.scale != null ? d.scale : 1;
      if (s <= 0.001) continue;
      const rs = r * s;

      if (metaballsOn) {
        mctx.moveTo(dx + rs, dy);
        mctx.arc(dx, dy, rs, 0, Math.PI * 2);
      } else {
        if (fieldMode) {
          p.noFill();
          p.stroke(255, 0, 0);
          p.strokeWeight(1);
          p.circle(dx, dy, dotD + 6);
          p.noStroke();
        }
        if (s >= 0.999) {
          ctx.drawImage(
            fieldSprite.canvas,
            dx - fieldSprite.half,
            dy - fieldSprite.half,
          );
        } else {
          const sz = fieldSprite.size * s;
          const half = sz * 0.5;
          ctx.drawImage(fieldSprite.canvas, dx - half, dy - half, sz, sz);
        }
      }
      if (needsMask) {
        maskCtx.moveTo(dx + rs, dy);
        maskCtx.arc(dx, dy, rs, 0, Math.PI * 2);
      }
    }
    if (metaballsOn) mctx.fill();

    let di = 0;
    for (const orb of state.orbits) {
      const orbColor = orb.color || dotColor;
      const sprite = metaballsOn ? null : getDotSprite(orbColor, dotD, blurAmt);
      if (metaballsOn) {
        mctx.fillStyle = orbColor;
        mctx.beginPath();
      }
      for (let j = 0; j < orb.dots.length; j++) {
        const d = orb.dots[j];
        stepDot(d);
        const s = d.scale != null ? d.scale : 1;
        if (s <= 0.001) {
          di++;
          continue;
        }
        const ox = Math.sin(t * 0.5 + di * 1.3) * drift;
        const oy = Math.cos(t * 0.35 + di * 1.9) * drift;
        const dx = d.x + ox;
        const dy = d.y + oy;
        const rs = r * s;
        if (metaballsOn) {
          mctx.moveTo(dx + rs, dy);
          mctx.arc(dx, dy, rs, 0, Math.PI * 2);
        } else if (s >= 0.999) {
          ctx.drawImage(sprite.canvas, dx - sprite.half, dy - sprite.half);
        } else {
          const sz = sprite.size * s;
          const half = sz * 0.5;
          ctx.drawImage(sprite.canvas, dx - half, dy - half, sz, sz);
        }
        if (needsMask) {
          maskCtx.moveTo(dx + rs, dy);
          maskCtx.arc(dx, dy, rs, 0, Math.PI * 2);
        }
        di++;
      }
      if (metaballsOn) mctx.fill();

      // Reap dots that have finished fading out.
      for (let k = orb.dots.length - 1; k >= 0; k--) {
        const dd = orb.dots[k];
        if (dd.dying && dd.scaleDur === 0 && dd.scale <= 0.001) {
          orb.dots.splice(k, 1);
        }
      }
    }

    if (needsMask) maskCtx.fill();

    if (metaballsOn) {
      const merge = +dom.metaballMerge.value;
      if (render.metaballFilterBlur) {
        render.metaballFilterBlur.setAttribute("stdDeviation", String(merge));
      }
      ctx.save();
      ctx.filter = "url(#metaballFilter)";
      ctx.drawImage(render.metaballCanvas, 0, 0);
      ctx.restore();
    }

    if (state.dragDot && state.mode === "moveField") {
      p.noFill();
      p.stroke(metaballsOn ? 0 : 255, 166);
      p.strokeWeight(1.5);
      p.circle(state.dragDot.x, state.dragDot.y, dotD + 7);
    }

    if (render.grainCanvas && (bgGrainAmt > 0.001 || dotGrainAmt > 0.001)) {
      const tile = render.grainCanvas.width;
      render.grainOffset = (render.grainOffset + 7) % tile;

      if (bgGrainAmt > 0.001) {
        const sctx = ensureGrainScratchCanvas();
        sctx.globalCompositeOperation = "source-over";
        sctx.clearRect(0, 0, state.W, state.H);
        tileGrain(sctx, render.grainOffset);
        sctx.globalCompositeOperation = "destination-out";
        sctx.drawImage(render.dotMaskCanvas, 0, 0);

        ctx.save();
        ctx.globalCompositeOperation = "soft-light";
        ctx.globalAlpha = bgGrainAmt;
        ctx.drawImage(render.grainScratchCanvas, 0, 0);
        ctx.restore();
      }

      if (dotGrainAmt > 0.001) {
        const sctx = ensureGrainScratchCanvas();
        sctx.globalCompositeOperation = "source-over";
        sctx.clearRect(0, 0, state.W, state.H);
        tileGrain(sctx, render.grainOffset);
        sctx.globalCompositeOperation = "destination-in";
        sctx.drawImage(render.dotMaskCanvas, 0, 0);

        ctx.save();
        ctx.globalCompositeOperation = "soft-light";
        ctx.globalAlpha = dotGrainAmt;
        ctx.drawImage(render.grainScratchCanvas, 0, 0);
        ctx.restore();
      }
    }

    // Keep the loop alive so the subtle sin/cos drift is always visible.
    // Only pause when nothing is moving AND we're not in a mode that needs
    // continuous rendering (the drift is the baseline "alive" animation).
    // Removed the old noLoop() gate that was killing idle drift in view mode.
  };

  p.windowResized = () => {
    state.W = p.windowWidth;
    state.H = p.windowHeight;
    p.resizeCanvas(state.W, state.H);
    const c = defaultSharedCenter(state.W, state.H);
    dom.centerX.value = String(c.x);
    dom.centerY.value = String(c.y);
    regenField();
    if (state.scattered) {
      spawnScatteredDots();
    } else {
      syncAllOrbits();
    }
    kickLoop();
  };
};
