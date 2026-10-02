import type { Camera } from "./camera";

/** Wire mouse, touch, pen and wheel input on `el` to the camera. Returns a cleanup function. */
export function attachInput(el: HTMLElement, camera: Camera) {
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; fov: number } | null = null;
  // Touch browsers don't reliably fire dblclick, so detect double-taps ourselves.
  let press: { x: number; y: number; t: number } | null = null;
  let lastTap: { x: number; y: number; t: number } | null = null;
  let lastTouchFocus = -Infinity;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };
  const ndc = (e: { clientX: number; clientY: number }): [number, number] => {
    const p = local(e);
    return [(p.x / p.w) * 2 - 1, 1 - (p.y / p.h) * 2];
  };
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const centroid = () => {
    let x = 0;
    let y = 0;
    for (const p of pointers.values()) {
      x += p.x;
      y += p.y;
    }
    return { x: x / pointers.size, y: y / pointers.size };
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y });
    if (pointers.size === 1) camera.beginDrag();
    if (pointers.size === 2) pinch = { dist: spread(), fov: camera.view.fov };
    press = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    el.dataset.dragging = "";
  };

  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const before = centroid();
    const next = local(e);
    p.x = next.x;
    p.y = next.y;
    const after = centroid();
    camera.dragBy(before.x, before.y, after.x, after.y);
    if (pinch && pointers.size >= 2) {
      const d = spread();
      if (d > 0) camera.pinch(pinch.fov, pinch.dist / d);
    }
  };

  const onUp = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (e.pointerType === "touch" && press && e.type === "pointerup") {
      const still = Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10;
      if (still && e.timeStamp - press.t < 280) {
        const tap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        if (lastTap && tap.t - lastTap.t < 340 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 32) {
          const [x, y] = ndc(e);
          camera.focusAt(x, y);
          lastTap = null;
          lastTouchFocus = performance.now();
        } else {
          lastTap = tap;
        }
      }
    }
    press = null;
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      camera.endDrag();
      delete el.dataset.dragging;
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
    const delta = e.deltaY * unit;
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const factor = Math.exp(delta * (e.ctrlKey ? 0.01 : 0.0012));
    camera.zoomBy(factor, ndc(e));
  };

  const onDblClick = (e: MouseEvent) => {
    if (performance.now() - lastTouchFocus < 600) return;
    const [x, y] = ndc(e);
    camera.focusAt(x, y);
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("dblclick", onDblClick);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("dblclick", onDblClick);
  };
}
