/**
 * Keyboard + mouse input with Pointer Lock support.
 * Tracks "down" state plus edge-triggered "pressed" events that callers can
 * consume once per frame. Mouse movement is accumulated as deltas.
 */
export class Input {
  private down = new Set<string>();
  private pressedQueue = new Set<string>();
  private el: HTMLElement;

  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;

  // mouse buttons
  mouse0 = false; // left
  mouse1 = false; // right
  mouse0Pressed = false;

  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(el: HTMLElement) {
    this.el = el;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    // Avoid the context menu hijacking right-click ADS
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    if (!this.locked) this.el.requestPointerLock?.();
  }

  exitLock() {
    if (this.locked) document.exitPointerLock?.();
  }

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.el;
    if (!this.locked) {
      this.mouse0 = this.mouse1 = false;
      this.down.clear();
    }
    this.onLockChange?.(this.locked);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    // Prevent page scroll on space / arrows while playing
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
      e.preventDefault();
    }
    if (!this.down.has(e.code)) this.pressedQueue.add(e.code);
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.locked) {
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) return;
    if (e.button === 0) {
      this.mouse0 = true;
      this.mouse0Pressed = true;
    }
    if (e.button === 2) this.mouse1 = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouse0 = false;
    if (e.button === 2) this.mouse1 = false;
  };

  private onWheel = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY);
  };

  isDown(code: string) {
    return this.down.has(code);
  }

  /** True only on the frame the key was first pressed. */
  pressed(code: string) {
    return this.pressedQueue.has(code);
  }

  /** Call at the very end of each frame to clear edge-triggered events. */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.mouse0Pressed = false;
    this.pressedQueue.clear();
  }
}
