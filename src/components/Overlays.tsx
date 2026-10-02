import { useEffect, useRef, useState } from "react";
import type { Camera } from "../viewer/camera";
import { useCameraFrame, useCameraState } from "../viewer/hooks";

/** Full-window target that appears while files are dragged over the page. */
export function DropOverlay({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    };
    const overFn = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) onFilesRef.current(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", overFn);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", overFn);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <div className="dropzone" data-over={over || undefined} aria-hidden={!over}>
      <div className="dropzone__frame">
        <p className="dropzone__title">Drop to add</p>
      </div>
    </div>
  );
}

/** Thin crosshair that shows only while the view is moving. */
export function Reticle({ camera }: { camera: Camera }) {
  const ref = useRef<HTMLDivElement>(null);
  useCameraFrame(camera, () => {
    const el = ref.current;
    if (!el) return;
    const on = camera.busy && camera.view.d < 0.3;
    if (on) el.dataset.active = "";
    else delete el.dataset.active;
  });
  return <div className="reticle" ref={ref} aria-hidden="true" />;
}

export function Hint({ camera }: { camera: Camera }) {
  const interacted = useCameraState(camera, (c) => c.interacted);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 9000);
    return () => clearTimeout(t);
  }, []);
  const hidden = interacted || timedOut;
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  return (
    <p className="hint" data-hidden={hidden || undefined} aria-hidden={hidden}>
      <span>
        <kbd>Drag</kbd> to look around
      </span>
      {touch ? (
        <span>
          <kbd>Pinch</kbd> to zoom
        </span>
      ) : (
        <span>
          <kbd>Scroll</kbd> or <kbd>pinch</kbd> to zoom
        </span>
      )}
      <span>
        <kbd>{touch ? "Double-tap" : "Double-click"}</kbd> to focus
      </span>
    </p>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 5200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div className="toast" role="status" aria-live="polite" data-visible={!!message || undefined}>
      {message}
    </div>
  );
}
