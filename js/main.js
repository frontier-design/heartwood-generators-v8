import { kickLoop, redrawAll, regenField, syncVal, onMetaballsToggle, randomizeField } from './core.js';
import { setMode, toggleSection, onSharedCenterChange, initInteractionListeners } from './interaction.js';
import { selectCombo } from './swatches.js';
import { switchDataTab, parsePastedCSV, recalcDots, initDataListeners } from './data.js';
import { addOrbit, reshuffleAll } from './orbit-ui.js';
import { exportSVG, exportPNG } from './export.js';
import { sketch } from './sketch.js';

// Expose functions to window for inline HTML event handlers
window.setMode = setMode;
window.toggleSection = toggleSection;
window.onSharedCenterChange = onSharedCenterChange;
window.selectCombo = selectCombo;
window.syncVal = syncVal;
window.onMetaballsToggle = onMetaballsToggle;
window.regenField = regenField;
window.randomizeField = randomizeField;
window.switchDataTab = switchDataTab;
window.parsePastedCSV = parsePastedCSV;
window.recalcDots = recalcDots;
window.redrawAll = redrawAll;
window.kickLoop = kickLoop;
window.addOrbit = addOrbit;
window.reshuffleAll = reshuffleAll;
window.exportSVG = exportSVG;
window.exportPNG = exportPNG;

// Initialize event listeners
initInteractionListeners();
initDataListeners();

// Launch p5
new p5(sketch, document.getElementById("canvasContainer"));
