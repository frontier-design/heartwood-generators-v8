import { state, dom } from './state.js';
import { generateOrbitDots } from './orbit-gen.js';

export function exportSVG() {
  const bg = dom.bgColor.value;
  const dotColor = dom.dotColor.value;
  const r = +dom.dotSize.value / 2;
  const metaballsOn = dom.metaballs.checked;
  let circles = "";
  for (const d of state.fieldDots)
    circles += `<circle cx="${d.tx.toFixed(2)}" cy="${d.ty.toFixed(2)}" r="${r}" fill="${dotColor}"/>`;
  for (const orb of state.orbits) {
    const c = orb.color || dotColor;
    for (const d of generateOrbitDots(orb))
      circles += `<circle cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${r}" fill="${c}"/>`;
  }

  let defs = "";
  let group = circles;
  if (metaballsOn) {
    const merge = +dom.metaballMerge.value;
    defs = `<defs><filter id="goo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="${merge}" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter></defs>`;
    group = `<g filter="url(#goo)">${circles}</g>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${state.W}" height="${state.H}" viewBox="0 0 ${state.W} ${state.H}">${defs}<rect width="${state.W}" height="${state.H}" fill="${bg}"/>${group}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: "dot-orbit.svg",
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportPNG() {
  const a = document.createElement("a");
  a.href = state.p5ref.canvas.toDataURL("image/png");
  a.download = "dot-orbit.png";
  a.click();
}
