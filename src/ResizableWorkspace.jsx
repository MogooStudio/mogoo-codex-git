import React, { useRef, useState, useSyncExternalStore } from 'react';

const storageKey = 'mogoo-codex-git-sidebar-width';
const minWidth = 180;
const maxWidth = 480;
const getViewportWidth = () => window.innerWidth;
const subscribeToResize = listener => {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
};

function readWidth() {
  try {
    const value = Number(localStorage.getItem(storageKey));
    if (value >= minWidth && value <= maxWidth) return value;
  } catch { /* Storage can be unavailable inside the Codex panel. */ }
  return null;
}

export function ResizableWorkspace({ source, sidebar, children }) {
  const viewport = useSyncExternalStore(subscribeToResize, getViewportWidth);
  const [preference, setPreference] = useState(readWidth);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const maximum = Math.max(minWidth, Math.min(maxWidth, Math.floor(viewport * 0.42)));
  const clamp = value => Math.round(Math.max(minWidth, Math.min(maximum, value)));
  const width = clamp(preference ?? (source && viewport <= 1100 ? 224 : 250));
  const remember = value => {
    setPreference(value);
    try { localStorage.setItem(storageKey, String(value)); }
    catch { /* Resizing still works for the current panel. */ }
  };

  const dragWidth = event => clamp(drag.current.width + event.clientX - drag.current.x);
  const finish = (event, cancelled) => {
    const start = drag.current;
    if (start?.pointer !== event.pointerId) return;
    const next = cancelled ? start.width : dragWidth(event);
    drag.current = null;
    setDragging(false);
    if (next === start.width) setPreference(start.preference);
    else remember(next);
  };

  return <div className={`workspace ${source ? 'source-workspace' : ''} ${dragging ? 'resizing-sidebar' : ''}`}
    style={{ '--sidebar-width': `${width}px` }}>
    {sidebar}
    <div className="sidebar-resizer" role="separator" tabIndex={0} aria-label="调整源代码管理宽度"
      aria-controls="source-control-sidebar" aria-orientation="vertical"
      aria-valuemin={minWidth} aria-valuemax={maximum} aria-valuenow={width}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, x: event.clientX, width, preference };
        setDragging(true);
      }}
      onPointerMove={event => {
        if (drag.current?.pointer === event.pointerId) setPreference(dragWidth(event));
      }}
      onPointerUp={event => finish(event, false)}
      onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={event => finish(event, true)}
      onKeyDown={event => {
        const widths = { ArrowLeft: width - 16, ArrowRight: width + 16, Home: minWidth, End: maximum };
        if (drag.current || !Object.hasOwn(widths, event.key)) return;
        event.preventDefault();
        const next = clamp(widths[event.key]);
        if (next !== width) remember(next);
      }} />
    {children}
  </div>;
}
