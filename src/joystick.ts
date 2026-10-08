// Floating touch joystick: touch anywhere, drag to move. Exposes a normalised vector (x, y in -1..1).
export const stick = { x: 0, y: 0 };
export const stickCtl = { enabled: true }; // off while a mini game is open
const base = document.getElementById('stick')!, knob = document.getElementById('knob')!;
const R = 40;
let id: number | null = null, ox = 0, oy = 0;
addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || id !== null || !stickCtl.enabled) return;
  id = e.pointerId; ox = e.clientX; oy = e.clientY;
  base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.style.display = 'block';
});
addEventListener('pointermove', (e) => {
  if (e.pointerId !== id) return;
  let dx = e.clientX - ox, dy = e.clientY - oy;
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  stick.x = dx / R; stick.y = dy / R;
});
const end = (e: PointerEvent) => {
  if (e.pointerId !== id) return;
  id = null; stick.x = stick.y = 0; base.style.display = 'none'; knob.style.transform = '';
};
addEventListener('pointerup', end);
addEventListener('pointercancel', end);
addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); // no scroll / pinch zoom
