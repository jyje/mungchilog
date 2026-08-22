import { useEffect, useRef, useState, type ReactNode } from "react";

type PanelPosition = "bottom" | "left" | "right";

const POSITION_KEY = "mungchilog-panel-position";
const SIZE_KEY = "mungchilog-panel-size";

// bottom is a vh (% of viewport height); left/right are px.
const DEFAULT_SIZE: Record<PanelPosition, number> = { bottom: 46, left: 380, right: 380 };
const MIN_SIZE: Record<PanelPosition, number> = { bottom: 16, left: 280, right: 280 };
const MAX_SIZE: Record<PanelPosition, number> = { bottom: 88, left: 640, right: 640 };

function readPosition(): PanelPosition {
  const v = localStorage.getItem(POSITION_KEY);
  if (v === "left" || v === "right" || v === "bottom") return v;
  // No saved preference yet: default to a side panel on tablet/desktop-
  // width viewports (room for a real split view) and a bottom sheet on
  // phone-width ones (see jyje's note: this gets used on a phone/tablet
  // mid-trip, not a desktop).
  return window.innerWidth >= 768 ? "right" : "bottom";
}

function readSizes(): Record<PanelPosition, number> {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SIZE, ...parsed };
  } catch {
    return { ...DEFAULT_SIZE };
  }
}

const POSITION_LABEL: Record<PanelPosition, string> = { bottom: "⬇️ 하단", left: "⬅️ 좌측", right: "➡️ 우측" };

/**
 * Map-first app shell: a full-viewport map with a floating header on top
 * (back button, menu, title) and a resizable panel (day tabs + spot list)
 * that can dock to the bottom, left, or right - or hide entirely for a
 * fullscreen map. Position/size are drag-adjustable (mouse or touch, via
 * pointer events) and persisted, so a phone and a tablet mid-trip can each
 * settle into whatever split feels right.
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
  const [position, setPosition] = useState<PanelPosition>(readPosition);
  const [sizes, setSizes] = useState<Record<PanelPosition, number>>(readSizes);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dragging = useRef(false);

  useEffect(() => {
    localStorage.setItem(POSITION_KEY, position);
  }, [position]);

  useEffect(() => {
    localStorage.setItem(SIZE_KEY, JSON.stringify(sizes));
  }, [sizes]);

  // One shared pointermove/pointerup pair on window, active only while a
  // handle is pressed - works for mouse drag and touch drag alike.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      setSizes((prev) => {
        let value: number;
        if (position === "bottom") {
          value = ((window.innerHeight - e.clientY) / window.innerHeight) * 100;
        } else if (position === "left") {
          value = e.clientX;
        } else {
          value = window.innerWidth - e.clientX;
        }
        const clamped = Math.min(MAX_SIZE[position], Math.max(MIN_SIZE[position], value));
        return { ...prev, [position]: clamped };
      });
    }
    function onUp() {
      dragging.current = false;
      document.body.classList.remove("panel-resizing");
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [position]);

  function startDrag(e: React.PointerEvent) {
    dragging.current = true;
    document.body.classList.add("panel-resizing");
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is a nice-to-have (keeps the handle as the event
      // target during a fast drag) - the window listeners above already
      // work without it, so a capture failure isn't fatal.
    }
  }

  function choosePosition(next: PanelPosition) {
    setPosition(next);
    setCollapsed(false);
    setMenuOpen(false);
  }

  const panelStyle = position === "bottom" ? { height: `${sizes.bottom}vh` } : { width: `${sizes[position]}px` };

  return (
    <div className="trip-shell" data-panel-position={position}>
      <div className="trip-map-pane">
        {map}
        <div className="map-hero-header">
          {headerLeft}
          <div className="menu-anchor">
            <button type="button" className="menu-button" aria-label="보기 설정" onClick={() => setMenuOpen((o) => !o)}>
              ☰
            </button>
            {menuOpen && (
              <>
                <button type="button" className="menu-backdrop" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />
                <div className="layout-menu" role="menu">
                  <button
                    type="button"
                    onClick={() => {
                      setCollapsed((c) => !c);
                      setMenuOpen(false);
                    }}
                  >
                    {collapsed ? "🗺️ 목록과 같이 보기" : "⛶ 지도 전체화면"}
                  </button>
                  <div className="layout-menu-positions">
                    {(["left", "bottom", "right"] as PanelPosition[]).map((p) => (
                      <button key={p} type="button" className={position === p ? "active" : ""} onClick={() => choosePosition(p)}>
                        {POSITION_LABEL[p]}
                      </button>
                    ))}
                  </div>
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

      {!collapsed && (
        <div className="trip-panel-pane" style={panelStyle}>
          <button
            type="button"
            className="panel-drag-handle"
            aria-label="패널 크기 조절 (드래그)"
            onPointerDown={startDrag}
          >
            <span className="handle-bar" />
          </button>
          <div className="panel-content">{panel}</div>
        </div>
      )}
    </div>
  );
}
