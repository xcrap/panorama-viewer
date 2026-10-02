import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControlBar } from "./components/ControlBar";
import { Filmstrip, type Pending } from "./components/Filmstrip";
import { CollapseIcon, ExpandIcon, PlusIcon, ShutterIcon } from "./components/Icons";
import { DropOverlay, Hint, Reticle, Toast } from "./components/Overlays";
import { isImageFile, sceneFromFile, textureBudget } from "./lib/loadImage";
import { describe, isFullTurn, type Scene } from "./lib/scene";
import { Camera, type CameraMode } from "./viewer/camera";
import { useCameraState } from "./viewer/hooks";
import { DEG } from "./viewer/math";
import { PanoramaViewer, type ViewerHandle } from "./viewer/PanoramaViewer";

const canFullscreen = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

export default function App() {
  const camera = useMemo(() => new Camera(), []);
  const viewer = useRef<ViewerHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const maxTexture = useRef(8192);

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const mode = useCameraState(camera, (c) => c.mode);
  const autoRotate = useCameraState(camera, (c) => c.autoRotate);

  const active = scenes.find((s) => s.id === activeId) ?? null;
  const planetAvailable = !!active && isFullTurn(active);
  const hasContent = scenes.length > 0 || pending.length > 0;
  const openPicker = useCallback(() => fileInput.current?.click(), []);

  // A partial panorama can't be a little planet.
  useEffect(() => {
    if (active && !planetAvailable && camera.mode === "planet") camera.setMode("perspective");
  }, [active, planetAvailable, camera]);

  const addFiles = useCallback(async (files: File[]) => {
    const images = files.filter(isImageFile);
    if (!images.length) {
      setToast("Those weren’t images. Try JPEG, PNG, WebP or AVIF.");
      return;
    }
    const jobs = images.map((file) => ({ file, id: crypto.randomUUID() }));
    setPending((p) => [...p, ...jobs.map(({ id, file }) => ({ id, name: file.name }))]);
    let shown = false;
    await Promise.all(
      jobs.map(async ({ file, id }) => {
        try {
          const scene = await sceneFromFile(file, textureBudget(maxTexture.current));
          setScenes((list) => [...list, scene]);
          if (!shown) {
            shown = true;
            setActiveId(scene.id);
          }
        } catch (err) {
          setToast(err instanceof Error ? err.message : `Couldn’t open “${file.name}”.`);
        } finally {
          setPending((p) => p.filter((x) => x.id !== id));
        }
      }),
    );
  }, []);

  const removeScene = useCallback(
    (id: string) => {
      const idx = scenes.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const gone = scenes[idx]!;
      const rest = scenes.filter((s) => s.id !== id);
      setScenes((list) => list.filter((s) => s.id !== id));
      if (id === activeId) setActiveId(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
      // Let the viewer finish switching before the pixels go away.
      setTimeout(() => gone.bitmap.close(), 1000);
    },
    [scenes, activeId],
  );

  const updateActive = useCallback(
    (patch: Partial<Scene>) => {
      if (!activeId) return;
      setScenes((list) => list.map((s) => (s.id === activeId ? { ...s, ...patch } : s)));
    },
    [activeId],
  );

  const setMode = useCallback(
    (m: CameraMode) => {
      if (m === "planet" && !planetAvailable) return;
      camera.setMode(m);
    },
    [camera, planetAvailable],
  );

  const recentre = useCallback(() => {
    if (!active) return;
    const init = active.initial;
    if (camera.mode === "planet") camera.setMode("perspective", { yaw: init?.yaw ?? 0, pitch: 0 });
    else camera.lookAt(init?.yaw ?? 0, init?.pitch ?? 0, 75 * DEG, 800);
  }, [active, camera]);

  const snapshot = useCallback(async () => {
    const blob = await viewer.current?.snapshot();
    if (!blob || !active) return;
    const hdg = Math.round((((camera.view.yaw / DEG + camera.headingOffset) % 360) + 360) % 360);
    const slug = active.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug || "view"}-${String(hdg).padStart(3, "0")}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, [active, camera]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // Paste an image from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter(isImageFile);
      if (files.length) void addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("textarea, select, [contenteditable], input:not([type=range])")) return;
      // A focused slider keeps its own arrow keys.
      if (t instanceof HTMLInputElement && /^(Arrow|Home|End|Page)/.test(e.key)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "o") {
        openPicker();
        e.preventDefault();
        return;
      }
      if (!active) return;
      const step = e.shiftKey ? 2.4 : 1.2;
      switch (e.key) {
        case "ArrowLeft":
          camera.nudge(-step, 0);
          break;
        case "ArrowRight":
          camera.nudge(step, 0);
          break;
        case "ArrowUp":
          camera.nudge(0, step);
          break;
        case "ArrowDown":
          camera.nudge(0, -step);
          break;
        case "+":
        case "=":
          camera.zoomBy(1 / 1.2);
          break;
        case "-":
        case "_":
          camera.zoomBy(1.2);
          break;
        case "p":
        case "P":
          setMode(camera.mode === "planet" ? "perspective" : "planet");
          break;
        case "f":
        case "F":
          if (canFullscreen) toggleFullscreen();
          break;
        case "0":
          recentre();
          break;
        case " ":
          if (t?.closest("button")) return;
          camera.setAutoRotate(!camera.autoRotate);
          break;
        case "[":
        case "]": {
          const i = scenes.findIndex((s) => s.id === activeId);
          const n = scenes.length;
          if (n) setActiveId(scenes[(i + (e.key === "]" ? 1 : n - 1)) % n]!.id);
          break;
        }
        default:
          if (/^[1-9]$/.test(e.key)) {
            const s = scenes[Number(e.key) - 1];
            if (s) setActiveId(s.id);
            break;
          }
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera, active, scenes, activeId, setMode, recentre, toggleFullscreen, openPicker]);

  const clearToast = useCallback(() => setToast(null), []);

  return (
    <div className="app" data-empty={!hasContent || undefined}>
      <PanoramaViewer
        ref={viewer}
        camera={camera}
        scene={active}
        onReady={(max) => (maxTexture.current = max)}
      />
      <div className="scrim scrim--top" />
      <div className="scrim scrim--bottom" />
      <Reticle camera={camera} />

      {scenes.length === 0 &&
        (pending.length > 0 ? (
          <p className="status" role="status">
            <span className="status__bar" />
            Opening {pending[0]!.name}
          </p>
        ) : (
          <div className="empty">
            <p className="empty__title">Drop panoramas here</p>
            <p className="empty__sub">360° photos and wide panoramas. Add as many as you like.</p>
            <button type="button" className="btn" onClick={openPicker}>
              <PlusIcon width={16} height={16} />
              Choose images
            </button>
          </div>
        ))}

      {active && (
        <header className="topbar">
          <div className="ident" key={active.id}>
            <h1 className="ident__title">{active.name}</h1>
            <p className="ident__meta">{describe(active)}</p>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={snapshot}
              title="Save this view as PNG"
              aria-label="Save this view as PNG"
            >
              <ShutterIcon />
            </button>
            {canFullscreen && (
              <button
                type="button"
                className="icon-btn"
                onClick={toggleFullscreen}
                title="Fullscreen (F)"
                aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
              </button>
            )}
          </div>
        </header>
      )}

      {active && <Hint camera={camera} />}

      {hasContent && (
        <footer className="bottombar">
          <Filmstrip
            scenes={scenes}
            pending={pending}
            activeId={activeId}
            onSelect={setActiveId}
            onRemove={removeScene}
            onAdd={openPicker}
          />
          {active && (
            <ControlBar
              scene={active}
              mode={mode}
              planetAvailable={planetAvailable}
              autoRotate={autoRotate}
              onMode={setMode}
              onScene={updateActive}
              onAutoRotate={(on) => camera.setAutoRotate(on)}
              onRecentre={recentre}
            />
          )}
        </footer>
      )}

      <Toast message={toast} onDone={clearToast} />
      <DropOverlay onFiles={addFiles} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void addFiles(files);
        }}
      />
    </div>
  );
}
