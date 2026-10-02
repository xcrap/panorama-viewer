import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { Camera } from "./camera";

/** Run `fn` on every frame the camera changes — for imperative HUD updates without re-rendering. */
export function useCameraFrame(camera: Camera, fn: () => void, deps: readonly unknown[] = []) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    ref.current();
    return camera.onFrame(() => ref.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, ...deps]);
}

/** Subscribe to low-frequency camera state (mode, auto-rotate, first interaction). */
export function useCameraState<T>(camera: Camera, select: (c: Camera) => T): T {
  return useSyncExternalStore(camera.onState, () => select(camera));
}
