import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { coverageOf, mappingOf, type Scene } from "../lib/scene";
import type { Camera } from "./camera";
import { attachInput } from "./input";
import { PanoRenderer } from "./renderer";

export interface ViewerHandle {
  snapshot(): Promise<Blob | null>;
}

interface Props {
  camera: Camera;
  scene: Scene | null;
  onReady?: (maxTextureSize: number) => void;
  ref?: Ref<ViewerHandle>;
}

export function PanoramaViewer({ camera, scene, onReady, ref }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PanoRenderer | null>(null);
  const loadedId = useRef<string | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [veiled, setVeiled] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  // Renderer, render loop, resizing and input.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: PanoRenderer;
    try {
      renderer = new PanoRenderer(canvas);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
      return;
    }
    rendererRef.current = renderer;
    onReadyRef.current?.(renderer.maxTextureSize);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(canvas.clientWidth, canvas.clientHeight, dpr);
      camera.setViewport(canvas.clientWidth, canvas.clientHeight);
      // Resizing clears the canvas; draw straight away to avoid a blank frame.
      renderer.render(camera.view);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (camera.tick(dt, now) || renderer.dirty) renderer.render(camera.view);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const detach = attachInput(canvas, camera);
    const onLost = (e: Event) => {
      e.preventDefault();
      setFailure("The graphics context was lost. Reload the page to continue.");
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      detach();
      canvas.removeEventListener("webglcontextlost", onLost);
      renderer.dispose();
      rendererRef.current = null;
      loadedId.current = null;
    };
  }, [camera]);

  // New image: veil, upload, reset the view, unveil.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (!scene) {
      renderer.clearImage();
      loadedId.current = null;
      setVeiled(true);
      return;
    }
    if (loadedId.current === scene.id) {
      setVeiled(false);
      return;
    }
    let cancelled = false;
    const first = loadedId.current === null;
    setVeiled(true);
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      renderer.setImage(scene.bitmap);
      renderer.setMapping(mappingOf(scene));
      camera.headingOffset = scene.heading ?? 0;
      camera.setCoverage(coverageOf(scene));
      camera.reset(scene.initial);
      renderer.render(camera.view);
      loadedId.current = scene.id;
      requestAnimationFrame(() => !cancelled && setVeiled(false));
    }, first ? 0 : 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scene?.id, camera]);

  // Same image, different interpretation (sphere ↔ panorama, coverage).
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !scene || loadedId.current !== scene.id) return;
    renderer.setMapping(mappingOf(scene));
    camera.setCoverage(coverageOf(scene));
  }, [scene, camera]);

  useImperativeHandle(
    ref,
    () => ({
      snapshot: () =>
        new Promise<Blob | null>((resolve) => {
          const renderer = rendererRef.current;
          const canvas = canvasRef.current;
          if (!renderer || !canvas) return resolve(null);
          renderer.render(camera.view);
          canvas.toBlob(resolve, "image/png");
        }),
    }),
    [camera],
  );

  return (
    <div className="viewer">
      <canvas
        ref={canvasRef}
        className="viewer__canvas"
        role="img"
        aria-label="Panorama. Drag to look around, scroll or pinch to zoom, double-click to focus."
      />
      <div className="viewer__veil" data-hidden={(!veiled && !failure) || undefined} />
      {failure && (
        <div className="viewer__failure" role="alert">
          <p className="viewer__failure-title">This browser can’t draw the viewer.</p>
          <p>{failure}</p>
        </div>
      )}
    </div>
  );
}
