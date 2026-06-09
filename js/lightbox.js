/* global React */
// Lightbox.js — fullscreen image viewer with scroll/pinch zoom + drag pan.
// Exposed on window.Lightbox.

(function () {
const { useState, useRef, useEffect, useCallback } = React;

const MIN_SCALE = 1;
const MAX_SCALE = 6;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function Lightbox(props) {
  // props: open, step, appName, flowName, index, total, onClose, onPrev, onNext
  const { open, step, appName, flowName, index, total, onClose, onPrev, onNext } = props;

  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const stageRef = useRef(null);
  const pointers = useRef(new Map());     // pointerId -> {x,y}
  const pinch = useRef(null);             // { dist, midX, midY, scale, x, y }
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  // Reset transform whenever a new image is shown.
  useEffect(() => { setT({ scale: 1, x: 0, y: 0 }); }, [step, open]);

  // Keyboard controls.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "+" || e.key === "=") zoomBy(1.3);
      else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.3);
      else if (e.key === "0") setT({ scale: 1, x: 0, y: 0 });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onPrev, onNext]);

  // Prevent body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Reset scroll position when zoom state or step/open changes.
  useEffect(() => {
    if (stageRef.current) {
      stageRef.current.scrollTop = 0;
    }
  }, [t.scale > 1, open, step]);

  const zoomAt = useCallback((factor, cx, cy) => {
    setT(prev => {
      const rect = stageRef.current ? stageRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      // pointer position relative to stage center
      const px = (cx - rect.left) - rect.width / 2;
      const py = (cy - rect.top) - rect.height / 2;
      const newScale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
      const realFactor = newScale / prev.scale;
      // keep the point under the cursor stationary
      let nx = px - (px - prev.x) * realFactor;
      let ny = py - (py - prev.y) * realFactor;
      if (newScale === 1) { nx = 0; ny = 0; }
      return { scale: newScale, x: nx, y: ny };
    });
  }, []);

  const zoomBy = useCallback((factor) => {
    const rect = stageRef.current ? stageRef.current.getBoundingClientRect() : null;
    if (!rect) { setT(p => ({ ...p, scale: clamp(p.scale * factor, MIN_SCALE, MAX_SCALE) })); return; }
    zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [zoomAt]);

  function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(factor, e.clientX, e.clientY);
  }

  function onPointerDown(e) {
    e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      pinch.current = {
        dist: Math.hypot(dx, dy),
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        scale: t.scale
      };
      dragging.current = false;
    } else {
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
    }
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const pts = [...pointers.current.values()];
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      const factor = dist / pinch.current.dist;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      setT(prev => {
        const rect = stageRef.current.getBoundingClientRect();
        const px = (midX - rect.left) - rect.width / 2;
        const py = (midY - rect.top) - rect.height / 2;
        const newScale = clamp(pinch.current.scale * factor, MIN_SCALE, MAX_SCALE);
        const realFactor = newScale / prev.scale;
        let nx = px - (px - prev.x) * realFactor;
        let ny = py - (py - prev.y) * realFactor;
        if (newScale === 1) { nx = 0; ny = 0; }
        return { scale: newScale, x: nx, y: ny };
      });
      return;
    }

    if (dragging.current && t.scale > 1) {
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      setT(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    }
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) dragging.current = false;
    if (pointers.current.size === 1) {
      const p = [...pointers.current.values()][0];
      last.current = { x: p.x, y: p.y };
      dragging.current = true;
    }
  }

  function onDoubleClick(e) {
    if (t.scale > 1) setT({ scale: 1, x: 0, y: 0 });
    else zoomAt(2.5, e.clientX, e.clientY);
  }

  if (!open) return null;

  const zoomed = t.scale > 1;

  return (
    React.createElement("div", { className: "lb-overlay", role: "dialog", "aria-modal": "true" },
      // top bar
      React.createElement("div", { className: "lb-top" },
        React.createElement("div", { className: "lb-meta" },
          React.createElement("span", { className: "lb-app" }, appName),
          React.createElement("span", { className: "lb-sep" }, "·"),
          React.createElement("span", { className: "lb-flow" }, flowName),
          React.createElement("span", { className: "lb-sep" }, "·"),
          React.createElement("span", { className: "lb-count" }, "Passo " + (index + 1) + " / " + total)
        ),
        React.createElement("button", { className: "lb-close", onClick: onClose, "aria-label": "Fechar" }, "✕")
      ),
      // stage
      React.createElement("div", {
        className: "lb-stage" + (zoomed ? " is-zoomed" : ""),
        ref: stageRef,
        onWheel: onWheel,
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onPointerCancel: onPointerUp,
        onDoubleClick: onDoubleClick
      },
        React.createElement("button", {
          className: "lb-nav lb-prev", onClick: (e) => { e.stopPropagation(); onPrev(); }, "aria-label": "Anterior"
        }, "‹"),
        React.createElement("div", {
          className: "lb-imgwrap",
          style: { transform: "translate(" + t.x + "px," + t.y + "px) scale(" + t.scale + ")" }
        },
          step && step.image
            ? React.createElement("img", { className: "lb-img", src: step.image, alt: step.title, draggable: false })
            : React.createElement(window.ImagePlaceholder, { label: (step && step.title) || "captura de tela", big: true })
        ),
        React.createElement("button", {
          className: "lb-nav lb-next", onClick: (e) => { e.stopPropagation(); onNext(); }, "aria-label": "Próximo"
        }, "›")
      ),
      // bottom controls
      React.createElement("div", { className: "lb-controls" },
        React.createElement("button", { className: "lb-zbtn", onClick: () => zoomBy(1 / 1.3), "aria-label": "Diminuir zoom" }, "−"),
        React.createElement("span", { className: "lb-zlevel" }, Math.round(t.scale * 100) + "%"),
        React.createElement("button", { className: "lb-zbtn", onClick: () => zoomBy(1.3), "aria-label": "Aumentar zoom" }, "+"),
        React.createElement("button", { className: "lb-reset", onClick: () => setT({ scale: 1, x: 0, y: 0 }) }, "Ajustar")
      )
    )
  );
}

window.Lightbox = Lightbox;
})();
