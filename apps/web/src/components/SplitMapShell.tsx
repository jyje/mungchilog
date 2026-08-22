import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type PanelPosition = "bottom" | "left" | "right" | "floating";
type DockPosition = Exclude<PanelPosition, "floating">;
type ResizeEdge = "top" | "right" | "bottom" | "left" | "top-right" | "bottom-right" | "bottom-left" | "top-left";

type FloatingBounds = { x: number; y: number; width: number; height: number };
type PanelLayout = {
  position: PanelPosition;
  sizes: Record<DockPosition, number>;
  floating: FloatingBounds;
  collapsed: boolean;
};

type DragState =
  | { kind: "move"; startX: number; startY: number; bounds: FloatingBounds }
  | { kind: "resize"; edge: ResizeEdge; startX: number; startY: number; bounds: FloatingBounds };

const LAYOUT_KEY = "mungchilog:trip-panel-layout:v1";
const LEGACY_POSITION_KEY = "mungchilog-panel-position";
const LEGACY_SIZE_KEY = "mungchilog-panel-size";
// Below 900px the itinerary behaves as a one-handed bottom sheet. At or
// above it, the map has enough uninterrupted ground for a floating panel.
const WIDE_VIEWPORT = 900;
const VIEWPORT_GUTTER = 12;
const FLOAT_MIN_WIDTH = 300;
const FLOAT_MIN_HEIGHT = 240;

const DEFAULT_DOCK_SIZES: Record<DockPosition, number> = { bottom: 46, left: 380, right: 380 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isPanelPosition(value: unknown): value is PanelPosition {
  return value === "bottom" || value === "left" || value === "right" || value === "floating";
}

function isDockPosition(value: unknown): value is DockPosition {
  return value === "bottom" || value === "left" || value === "right";
}

function defaultLayout(): PanelLayout {
  const isWide = window.innerWidth >= WIDE_VIEWPORT;
  const width = clamp(440, FLOAT_MIN_WIDTH, Math.max(FLOAT_MIN_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2));
  const height = clamp(560, FLOAT_MIN_HEIGHT, Math.max(FLOAT_MIN_HEIGHT, window.innerHeight - VIEWPORT_GUTTER * 2));

  return {
    position: isWide ? "right" : "bottom",
    sizes: { ...DEFAULT_DOCK_SIZES },
    floating: {
      x: Math.max(VIEWPORT_GUTTER, window.innerWidth - width - 32),
      y: Math.max(VIEWPORT_GUTTER, window.innerHeight - height - 32),
      width,
      height,
    },
    collapsed: false,
  };
}

function normalizeFloating(bounds: FloatingBounds): FloatingBounds {
  const maxWidth = Math.max(FLOAT_MIN_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
  const maxHeight = Math.max(FLOAT_MIN_HEIGHT, window.innerHeight - VIEWPORT_GUTTER * 2);
  const width = clamp(bounds.width, FLOAT_MIN_WIDTH, maxWidth);
  const height = clamp(bounds.height, FLOAT_MIN_HEIGHT, maxHeight);
  return {
    width,
    height,
    x: clamp(bounds.x, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER)),
    y: clamp(bounds.y, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, window.innerHeight - height - VIEWPORT_GUTTER)),
  };
}

function readLayout(): PanelLayout {
  const defaults = defaultLayout();

  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PanelLayout>;
      const position = isPanelPosition(saved.position) ? saved.position : defaults.position;
      const savedSizes = (saved.sizes ?? {}) as Partial<Record<DockPosition, unknown>>;
      const sizes = (Object.keys(DEFAULT_DOCK_SIZES) as DockPosition[]).reduce<Record<DockPosition, number>>((next, key) => {
        const value = savedSizes[key];
        next[key] = typeof value === "number" && Number.isFinite(value) ? value : defaults.sizes[key];
        return next;
      }, { ...DEFAULT_DOCK_SIZES });
      const savedFloating = saved.floating;
      const floating =
        savedFloating &&
        [savedFloating.x, savedFloating.y, savedFloating.width, savedFloating.height].every(
          (value) => typeof value === "number" && Number.isFinite(value),
        )
          ? normalizeFloating(savedFloating)
          : defaults.floating;

      return { position, sizes, floating, collapsed: saved.collapsed === true };
    }

    // Adopt the original dock-only preference when users update from the
    // earlier split-pane release. This keeps a deliberate placement intact.
    const legacyPosition = localStorage.getItem(LEGACY_POSITION_KEY);
    const legacySizes = JSON.parse(localStorage.getItem(LEGACY_SIZE_KEY) ?? "{}") as Record<string, unknown>;
    return {
      ...defaults,
      position: isDockPosition(legacyPosition) ? legacyPosition : defaults.position,
      sizes: {
        bottom: typeof legacySizes.bottom === "number" ? legacySizes.bottom : defaults.sizes.bottom,
        left: typeof legacySizes.left === "number" ? legacySizes.left : defaults.sizes.left,
        right: typeof legacySizes.right === "number" ? legacySizes.right : defaults.sizes.right,
      },
    };
  } catch {
    return defaults;
  }
}

function dockStyle(position: DockPosition, size: number): CSSProperties {
  if (position === "bottom") return { height: `${clamp(size, 18, 88)}vh` };
  return { width: `${clamp(size, 280, 640)}px` };
}

function resizedBounds(edge: ResizeEdge, start: FloatingBounds, deltaX: number, deltaY: number): FloatingBounds {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (edge.includes("left")) left = clamp(start.x + deltaX, VIEWPORT_GUTTER, right - FLOAT_MIN_WIDTH);
  if (edge.includes("right")) right = clamp(start.x + start.width + deltaX, left + FLOAT_MIN_WIDTH, window.innerWidth - VIEWPORT_GUTTER);
  if (edge.includes("top")) top = clamp(start.y + deltaY, VIEWPORT_GUTTER, bottom - FLOAT_MIN_HEIGHT);
  if (edge.includes("bottom")) bottom = clamp(start.y + start.height + deltaY, top + FLOAT_MIN_HEIGHT, window.innerHeight - VIEWPORT_GUTTER);

  return normalizeFloating({ x: left, y: top, width: right - left, height: bottom - top });
}

const POSITION_LABEL: Record<PanelPosition, string> = {
  bottom: "하단",
  left: "좌측",
  right: "우측",
  floating: "플로팅",
};

/**
 * The map remains the ground plane. Its itinerary controls can dock around
 * it on small screens, then turn into a movable work surface on large ones.
 * Pointer events unify a mouse, trackpad, pen, and touch input path.
 */
export function SplitMapShell({
  map,
  headerLeft,
  headerRight,
  title,
  subtitle,
  panel,
}: {
  map: ReactNode;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  panel: ReactNode;
}) {
  const [layout, setLayout] = useState<PanelLayout>(readLayout);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isWide, setIsWide] = useState(() => window.innerWidth >= WIDE_VIEWPORT);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    function onResize() {
      const wide = window.innerWidth >= WIDE_VIEWPORT;
      setIsWide(wide);
      setLayout((current) => ({
        ...current,
        position: !wide && current.position === "floating" ? "bottom" : current.position,
        floating: normalizeFloating(current.floating),
      }));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!drag.current) return;
      const active = drag.current;
      const deltaX = event.clientX - active.startX;
      const deltaY = event.clientY - active.startY;

      setLayout((current) => {
        const floating =
          active.kind === "move"
            ? normalizeFloating({ ...active.bounds, x: active.bounds.x + deltaX, y: active.bounds.y + deltaY })
            : current.position === "floating"
              ? resizedBounds(active.edge, active.bounds, deltaX, deltaY)
              : current.floating;
        if (active.kind === "resize" && current.position !== "floating") {
          const dock = current.position;
          const value =
            dock === "bottom"
              ? ((window.innerHeight - event.clientY) / window.innerHeight) * 100
              : dock === "left"
                ? event.clientX
                : window.innerWidth - event.clientX;
          return { ...current, sizes: { ...current.sizes, [dock]: value } };
        }
        return { ...current, floating };
      });
    }
    function onEnd() {
      drag.current = null;
      document.body.classList.remove("trip-panel-dragging", "trip-panel-resizing");
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, []);

  function beginMove(event: React.PointerEvent) {
    if (layout.position !== "floating") return;
    event.preventDefault();
    drag.current = { kind: "move", startX: event.clientX, startY: event.clientY, bounds: layout.floating };
    document.body.classList.add("trip-panel-dragging");
  }

  function beginResize(event: React.PointerEvent, edge: ResizeEdge) {
    event.preventDefault();
    if (layout.position === "floating") {
      drag.current = { kind: "resize", edge, startX: event.clientX, startY: event.clientY, bounds: layout.floating };
      document.body.classList.add("trip-panel-resizing");
      return;
    }

    drag.current = { kind: "resize", edge, startX: event.clientX, startY: event.clientY, bounds: layout.floating };
    document.body.classList.add("trip-panel-resizing");
  }

  function choosePosition(position: PanelPosition) {
    setLayout((current) => ({ ...current, position, collapsed: false }));
    setMenuOpen(false);
  }

  const panelStyle: CSSProperties =
    layout.position === "floating"
      ? { left: `${layout.floating.x}px`, top: `${layout.floating.y}px`, width: `${layout.floating.width}px`, height: `${layout.floating.height}px` }
      : dockStyle(layout.position, layout.sizes[layout.position]);

  return (
    <div className="trip-shell" data-panel-position={layout.position} data-panel-collapsed={layout.collapsed || undefined}>
      <div className="trip-map-pane">
        {map}
        <div className="map-hero-header">
          {headerLeft}
          <div className="menu-anchor">
            <button type="button" className="menu-button" aria-label="보기 설정" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              ☰
            </button>
            {menuOpen && (
              <>
                <button type="button" className="menu-backdrop" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />
                <div className="layout-menu" role="menu" aria-label="패널 배치">
                  <button type="button" onClick={() => setLayout((current) => ({ ...current, collapsed: !current.collapsed }))}>
                    {layout.collapsed ? "목록 보이기" : "지도 전체화면"}
                  </button>
                  <div className="layout-menu-positions" aria-label="도킹 위치">
                    {(["left", "bottom", "right"] as DockPosition[]).map((position) => (
                      <button key={position} type="button" className={layout.position === position ? "active" : ""} onClick={() => choosePosition(position)}>
                        {POSITION_LABEL[position]}
                      </button>
                    ))}
                  </div>
                  {isWide && (
                    <button type="button" className={layout.position === "floating" ? "active" : ""} onClick={() => choosePosition("floating")}>
                      ◇ 플로팅 패널
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="map-hero-title">
            <h1>{title}</h1>
            {subtitle && <p className="meta">{subtitle}</p>}
          </div>
          {headerRight}
        </div>
      </div>

      {!layout.collapsed && (
        <aside className="trip-panel-pane" style={panelStyle} aria-label="여행 일정 패널">
          {layout.position === "floating" ? (
            <>
              <button type="button" className="floating-panel-titlebar" aria-label="패널 위치 이동" onPointerDown={beginMove}>
                <span className="floating-panel-grip" aria-hidden="true">⠿</span>
                <span>일정</span>
                <span className="floating-panel-hint">드래그하여 이동</span>
              </button>
              {(["top", "right", "bottom", "left", "top-right", "bottom-right", "bottom-left", "top-left"] as ResizeEdge[]).map((edge) => (
                <button
                  key={edge}
                  type="button"
                  className={`floating-resize-handle floating-resize-${edge}`}
                  aria-label={`패널 ${edge} 경계 크기 조절`}
                  onPointerDown={(event) => beginResize(event, edge)}
                />
              ))}
            </>
          ) : (
            <button type="button" className="panel-drag-handle" aria-label="패널 크기 조절" onPointerDown={(event) => beginResize(event, "top")}>
              <span className="handle-bar" />
            </button>
          )}
          <div className="panel-content">{panel}</div>
        </aside>
      )}
    </div>
  );
}
