import './ui/styles.css';
import { Game } from './core/Game';

/**
 * Clutch Ops: Banana Protocol — entry point.
 * An original parody tactical FPS prototype. All assets are procedural.
 */
function start() {
  try {
    // expose for debugging in the console
    (window as any).__game = new Game();
  } catch (err) {
    console.error('Failed to start Clutch Ops: Banana Protocol', err);
    const root = document.getElementById('ui-root');
    if (root) {
      root.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ff5470;font-family:monospace;text-align:center;padding:20px">
        <div><h2>Failed to start</h2><pre style="white-space:pre-wrap;color:#8c97ad">${String(err)}</pre>
        <p style="color:#8c97ad">A WebGL-capable browser is required.</p></div></div>`;
    }
  }
}

start();
