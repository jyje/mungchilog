import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { List } from "lucide-react";
import { Button } from "./ui/button";
import { ThemeMenu } from "./system/ThemeMenu";
import { MapViewportProvider, type MapViewportInsets } from "./MapViewportContext";
import { closestSheetState, mapViewportInsets, SHEET_LABELS, SHEET_STATES, type SheetState } from "./mapViewportGeometry";

type PanelPosition = "bottom" | "left" | "right" | "floating";
type DockPosition = Exclude<PanelPosition, "floating">;
type ResizeEdge = "top" | "right" | "bottom" | "left" | "top-right" | "bottom-right" | "bottom-left" | "top-left";

type FloatingBounds = { x: number; y: number; width: number; height: number };
type PanelLayout = {
  position: PanelPosition;
  sizes: Record<DockPosition, number>;
  floating: FloatingBounds;
  collapsed: boolean;
  sheetState: SheetState;
};

type DragState =
  | { kind: "move"; startX: number; startY: number; bounds: FloatingBounds }
  | { kind: "resize"; edge: ResizeEdge; startX: number; startY: number; bounds: FloatingBounds; position: PanelPosition; size: number };

const LAYOUT_KEY = "mungchilog:trip-panel-layout:v1";
const LEGACY_POSITION_KEY = "mungchilog-panel-position";
const LEGACY_SIZE_KEY = "mungchilog-panel-size";
// Below 900px the itinerary behaves as a one-handed bottom sheet. At or
// above it, the map has enough uninterrupted ground for a floating panel.
const WIDE_VIEWPORT = 900;
const VIEWPORT_GUTTER = 12;
const FLOAT_MIN_WIDTH = 300;
const FLOAT_MIN_HEIGHT = 240;
const FLOAT_TOP_GUTTER = 128;
const MAP_NOTICE_GUTTER = 48;

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
  const width = clamp(440, FLOAT_MIN_WIDTH, Math.max(FLOAT_MIN_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2));
  const height = clamp(560, FLOAT_MIN_HEIGHT, Math.max(FLOAT_MIN_HEIGHT, window.innerHeight - VIEWPORT_GUTTER * 2));

  return {
    // Keep a desktop preference even when first opened on a narrow screen.
    // The effective position below handles rotation and split-screen.
    position: "right",
    sizes: { ...DEFAULT_DOCK_SIZES },
    floating: {
      x: Math.max(VIEWPORT_GUTTER, window.innerWidth - width - 32),
      y: Math.max(VIEWPORT_GUTTER, window.innerHeight - height - 32),
      width,
      height,
    },
    collapsed: false,
    sheetState: "intermediate",
  };
}

function normalizeFloating(bounds: FloatingBounds): FloatingBounds {
  const maxWidth = Math.max(FLOAT_MIN_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
  const topGutter = Math.min(FLOAT_TOP_GUTTER, window.innerHeight * 0.3);
  const maxHeight = Math.max(120, window.innerHeight - topGutter - MAP_NOTICE_GUTTER);
  const width = clamp(bounds.width, FLOAT_MIN_WIDTH, maxWidth);
  const height = clamp(bounds.height, Math.min(FLOAT_MIN_HEIGHT, maxHeight), maxHeight);
  return {
    width,
    height,
    x: clamp(bounds.x, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER)),
    y: clamp(bounds.y, topGutter, Math.max(topGutter, window.innerHeight - height - MAP_NOTICE_GUTTER)),
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
          ? savedFloating
          : defaults.floating;

      return { position, sizes, floating, collapsed: saved.collapsed === true, sheetState: SHEET_STATES.includes(saved.sheetState as SheetState) ? saved.sheetState as SheetState : "intermediate" };
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
  if (position === "bottom") return { height: `${clamp(size, 10, 78)}%` };
  return { width: `min(${clamp(size, 320, 640)}px, 48%)` };
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
  const [insets, setInsets] = useState<MapViewportInsets>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [sheetDragHeight, setSheetDragHeight] = useState<number | null>(null);
  const [headerClearance, setHeaderClearance] = useState(128);
  const [visualViewport, setVisualViewport] = useState<{ height: number; top: number } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const suppressSheetClick = useRef(false);
  const drag = useRef<DragState | null>(null);
  const position: PanelPosition = isWide ? layout.position : "bottom";
  const sheetState = layout.collapsed ? "collapsed" : layout.sheetState;
  const panelHidden = layout.collapsed || (position === "bottom" && sheetState === "collapsed");
  // Leave room for the editor when the software keyboard or landscape
  // viewport reduces height. Location details use a compact side callout.
  const compactMap = (visualViewport?.height ?? window.innerHeight) < 600;
  const mapControlClearance = compactMap ? 112 : 224;

  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* The layout still works when storage is blocked. */ }
  }, [layout]);

  useLayoutEffect(() => {
    function onResize() {
      setIsWide((shellRef.current?.getBoundingClientRect().width || window.innerWidth) >= WIDE_VIEWPORT);
      const viewport = window.visualViewport;
      // A software keyboard can shrink the visual viewport without changing
      // innerHeight. Do not resize the application during pinch zoom.
      if (viewport && viewport.scale === 1) setVisualViewport({ height: viewport.height, top: viewport.offsetTop });
    }
    onResize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
    if (shellRef.current) observer?.observe(shellRef.current);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
    };
  }, []);

  useLayoutEffect(() => {
    function measure() {
      if (!mapRef.current || !headerRef.current) return;
      const mapBounds = mapRef.current.getBoundingClientRect();
      if (!mapBounds.width || !mapBounds.height) return;
      const headerBounds = headerRef.current.getBoundingClientRect();
      setHeaderClearance(headerBounds.bottom - mapBounds.top);
      const next = mapViewportInsets(mapBounds, headerBounds, position === "floating" && !layout.collapsed ? panelRef.current?.getBoundingClientRect() : undefined);
      setInsets((current) => Object.keys(next).every((key) => current[key as keyof MapViewportInsets] === next[key as keyof MapViewportInsets]) ? current : next);
    }
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    for (const element of [mapRef.current, headerRef.current, panelRef.current]) if (element) observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [position, layout, sheetDragHeight]);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [menuOpen]);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!drag.current) return;
      const active = drag.current;
      const deltaX = event.clientX - active.startX;
      const deltaY = event.clientY - active.startY;

      if (active.kind === "resize" && active.position === "bottom") {
        if (Math.abs(deltaY) > 6) suppressSheetClick.current = true;
        const height = shellRef.current?.clientHeight || window.innerHeight;
        setSheetDragHeight(clamp(active.size - deltaY, 48, height * 0.78));
        return;
      }

      setLayout((current) => {
        const floating =
          active.kind === "move"
            ? normalizeFloating({ ...active.bounds, x: active.bounds.x + deltaX, y: active.bounds.y + deltaY })
            : active.position === "floating"
              ? resizedBounds(active.edge, active.bounds, deltaX, deltaY)
              : current.floating;
        if (active.kind === "resize" && active.position !== "floating") {
          const dock = active.position as DockPosition;
          const value = clamp(active.size + (dock === "left" ? deltaX : -deltaX), 320, 640);
          return { ...current, sizes: { ...current.sizes, [dock]: value } };
        }
        return { ...current, floating };
      });
    }
    function onEnd(event: PointerEvent) {
      const active = drag.current;
      if (event.type !== "pointercancel" && active?.kind === "resize" && active.position === "bottom" && suppressSheetClick.current) {
        const state = closestSheetState(active.size - (event.clientY - active.startY), shellRef.current?.clientHeight || window.innerHeight);
        setLayout((current) => ({ ...current, collapsed: false, sheetState: state }));
      }
      setSheetDragHeight(null);
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
      document.body.classList.remove("trip-panel-dragging", "trip-panel-resizing");
    };
  }, []);

  function beginMove(event: React.PointerEvent) {
    if (position !== "floating") return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).focus();
    drag.current = { kind: "move", startX: event.clientX, startY: event.clientY, bounds: normalizeFloating(layout.floating) };
    document.body.classList.add("trip-panel-dragging");
  }

  function beginResize(event: React.PointerEvent, edge: ResizeEdge) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).focus();
    suppressSheetClick.current = false;
    drag.current = { kind: "resize", edge, startX: event.clientX, startY: event.clientY, bounds: normalizeFloating(layout.floating), position, size: position === "bottom" ? panelRef.current?.clientHeight || 48 : panelRef.current?.clientWidth || 380 };
    document.body.classList.add("trip-panel-resizing");
  }

  function choosePosition(position: PanelPosition) {
    setLayout((current) => ({ ...current, position, collapsed: false, sheetState: current.sheetState === "collapsed" ? "intermediate" : current.sheetState }));
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  function chooseSheetState(next: SheetState) {
    setLayout((current) => ({ ...current, collapsed: false, sheetState: next }));
  }

  function onSheetKeyDown(event: React.KeyboardEvent) {
    const index = SHEET_STATES.indexOf(sheetState);
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : event.key === "ArrowUp" ? Math.min(2, index + 1) : event.key === "ArrowDown" ? Math.max(0, index - 1) : null;
    if (next === null) return;
    event.preventDefault();
    chooseSheetState(SHEET_STATES[next]);
  }

  function onResizeKeyDown(event: React.KeyboardEvent, edge: ResizeEdge) {
    const deltaX = event.key === "ArrowLeft" ? -24 : event.key === "ArrowRight" ? 24 : 0;
    const deltaY = event.key === "ArrowUp" ? -24 : event.key === "ArrowDown" ? 24 : 0;
    if (!deltaX && !deltaY) return;
    event.preventDefault();
    setLayout((current) => position === "floating" ? { ...current, floating: resizedBounds(edge, current.floating, deltaX, deltaY) } : { ...current, sizes: { ...current.sizes, [position]: clamp(current.sizes[position as DockPosition] + (position === "left" ? deltaX : -deltaX), 320, 640) } });
  }

  const floating = normalizeFloating(layout.floating);
  const panelStyle: CSSProperties =
    position === "floating"
      ? { left: `${floating.x}px`, top: `${floating.y}px`, width: `${floating.width}px`, height: `${floating.height}px` }
      : position === "bottom"
        ? { height: sheetDragHeight !== null ? `${sheetDragHeight}px` : sheetState === "collapsed" ? "calc(3rem + env(safe-area-inset-bottom))" : sheetState === "expanded" ? "78%" : "42%", maxHeight: `max(3rem, calc(100% - ${headerClearance + mapControlClearance}px))` }
        : dockStyle(position, layout.sizes[position]);

  return (
    <div ref={shellRef} className="trip-shell" style={visualViewport ? { height: visualViewport.height, top: visualViewport.top } : undefined} data-panel-position={position} data-compact-map={compactMap || undefined} data-panel-collapsed={layout.collapsed || undefined} data-sheet-state={position === "bottom" ? sheetState : undefined}>
      <div ref={mapRef} className="trip-map-pane">
        <MapViewportProvider value={insets}>{map}</MapViewportProvider>
        <div ref={headerRef} className="map-hero-header">
          {headerLeft}
          <div className="map-hero-title">
            <h1>{title}</h1>
            {subtitle && <p className="meta">{subtitle}</p>}
          </div>
          <div className="trip-header-actions">
            <ThemeMenu className="menu-button theme-menu-trigger" />
            <div className="menu-anchor">
              <Button ref={menuButtonRef} type="button" variant="ghost" size="icon-lg" className="menu-button" aria-label="일정 목록 보기 설정" title="일정 목록 보기 설정" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
                <List aria-hidden="true" />
              </Button>
              {menuOpen && (
                <>
                  <Button type="button" variant="ghost" className="menu-backdrop" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />
                  <div className="layout-menu" role="group" aria-label="일정 목록 및 패널 배치">
                    <Button type="button" variant="ghost" className="layout-menu-item" onClick={() => { setLayout((current) => ({ ...current, collapsed: !panelHidden, sheetState: position === "bottom" && panelHidden ? "intermediate" : current.sheetState })); setMenuOpen(false); menuButtonRef.current?.focus(); }}>
                      {panelHidden ? "일정 목록 보이기" : "일정 목록 접기"}
                    </Button>
                    {isWide && <div className="layout-menu-positions" aria-label="도킹 위치">
                      {(["left", "bottom", "right"] as DockPosition[]).map((dockPosition) => (
                        <Button key={dockPosition} type="button" variant={layout.position === dockPosition ? "secondary" : "outline"} aria-pressed={layout.position === dockPosition} className="layout-menu-position" onClick={() => choosePosition(dockPosition)}>
                          {POSITION_LABEL[dockPosition]}
                        </Button>
                      ))}
                    </div>}
                    {isWide && (
                      <Button type="button" variant={layout.position === "floating" ? "secondary" : "ghost"} className="layout-menu-item" onClick={() => choosePosition("floating")}>
                        ◇ 플로팅 패널
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
            {headerRight}
          </div>
        </div>
      </div>

        <aside ref={panelRef} className="trip-panel-pane" hidden={layout.collapsed && position !== "bottom"} style={panelStyle} aria-label="여행 일정 패널">
          {position === "floating" ? (
            <>
              <Button type="button" variant="ghost" className="floating-panel-titlebar" aria-label="패널 위치 이동" title="드래그하거나 방향키로 이동" onPointerDown={beginMove} onKeyDown={(event) => {
                const x = event.key === "ArrowLeft" ? -24 : event.key === "ArrowRight" ? 24 : 0;
                const y = event.key === "ArrowUp" ? -24 : event.key === "ArrowDown" ? 24 : 0;
                if (!x && !y) return;
                event.preventDefault();
                setLayout((current) => ({ ...current, floating: normalizeFloating({ ...current.floating, x: current.floating.x + x, y: current.floating.y + y }) }));
              }}>
                <span className="floating-panel-grip" aria-hidden="true">⠿</span>
                <span>일정</span>
                <span className="floating-panel-hint">드래그하여 이동</span>
              </Button>
              {(["top", "right", "bottom", "left", "top-right", "bottom-right", "bottom-left", "top-left"] as ResizeEdge[]).map((edge) => (
                <Button
                  key={edge}
                  type="button"
                  variant="ghost"
                  className={`floating-resize-handle floating-resize-${edge}`}
                  aria-label={`패널 ${edge} 경계 크기 조절`}
                  onPointerDown={(event) => beginResize(event, edge)}
                  onKeyDown={(event) => onResizeKeyDown(event, edge)}
                />
              ))}
            </>
          ) : position === "bottom" ? (
            <div className="panel-sheet-toolbar">
              <Button type="button" variant="ghost" className="panel-drag-handle" aria-label={`일정 패널 ${SHEET_LABELS[sheetState]}, 크기 변경`} aria-expanded={sheetState !== "collapsed"} aria-controls="trip-itinerary-content" title="드래그하거나 위아래 방향키로 크기 변경" onPointerDown={(event) => beginResize(event, "top")} onKeyDown={onSheetKeyDown} onClick={() => {
                if (suppressSheetClick.current) { suppressSheetClick.current = false; return; }
                chooseSheetState(SHEET_STATES[(SHEET_STATES.indexOf(sheetState) + 1) % SHEET_STATES.length]);
              }}>
                <span className="handle-bar" aria-hidden="true" /><span>일정</span>
              </Button>
              <div className="panel-sheet-states" role="group" aria-label="일정 패널 크기">
                {SHEET_STATES.map((state) => <Button key={state} type="button" variant={sheetState === state ? "secondary" : "ghost"} aria-pressed={sheetState === state} onClick={() => chooseSheetState(state)}>{SHEET_LABELS[state]}</Button>)}
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="panel-drag-handle" aria-label="일정 패널 너비 조절" title="드래그하거나 좌우 방향키로 너비 변경" onPointerDown={(event) => beginResize(event, position === "left" ? "right" : "left")} onKeyDown={(event) => onResizeKeyDown(event, position === "left" ? "right" : "left")}>
              <span>일정</span><span aria-hidden="true">↔</span>
            </Button>
          )}
          <div id="trip-itinerary-content" className="panel-content" hidden={position === "bottom" && sheetState === "collapsed" && sheetDragHeight === null}>{panel}</div>
        </aside>
    </div>
  );
}
