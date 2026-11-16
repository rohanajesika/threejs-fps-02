// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. When pointer lock is unavailable (a headless capture,
// a denied request) mouse drag still looks, so the game stays playable.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const pressed = new Set();

  function setKey(event, down) {
    if (down) keys.add(event.code);
    else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) pressed.add(event.code);
    setKey(event, true);
  });
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; state.aiming = false; });
  window.addEventListener('mousemove', (event) => {
    if (state.locked) {
      state.lookX += event.movementX;
      state.lookY += event.movementY;
    } else if (dragging) {
      state.lookX += (event.clientX - lastX) * 2.2;
      state.lookY += (event.clientY - lastY) * 2.2;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      if (state.locked) state.firing = true;
      else { dragging = true; lastX = event.clientX; lastY = event.clientY; }
    }
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) { state.firing = false; dragging = false; }
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });
  document.addEventListener('pointerlockerror', () => {
    state.locked = false;
    onLockChange(false);
  });

  return {
    state,
    requestLock() {
      try {
        const p = canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => onLockChange(false));
      } catch {
        onLockChange(false);
      }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // Edge-triggered keys, consumed once per press (buy menu, use, grenade).
    // Returns a copy: the live set keeps collecting while the caller reads.
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
  };
}
