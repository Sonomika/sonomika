import { useEffect, useRef } from 'react';

type Axis = 'x' | 'y';

const isScrollable = (el: HTMLElement, axis: Axis): boolean => {
  try {
    const style = window.getComputedStyle(el);
    const overflow = axis === 'y' ? style.overflowY : style.overflowX;
    // Radix ScrollArea viewports may not report overflow in a conventional way.
    // Treat any non-visible overflow OR known scroll viewports as scroll candidates.
    const isKnownViewport =
      el.classList.contains('vj-scroll-viewport') ||
      el.hasAttribute('data-radix-scroll-area-viewport');

    const canScrollByStyle =
      overflow === 'auto' ||
      overflow === 'scroll' ||
      overflow === 'overlay' ||
      overflow === 'hidden';

    const hasOverflow = axis === 'y'
      ? el.scrollHeight > el.clientHeight + 1
      : el.scrollWidth > el.clientWidth + 1;

    if (!hasOverflow) return false;
    // `canScrollByStyle` already implies overflow is not "visible"/"clip" (and TS correctly
    // narrows it), so additional comparisons cause TS2367 on newer TS DOM typings.
    return isKnownViewport || canScrollByStyle;
  } catch {
    return false;
  }
};

const findScrollableAncestors = (start: Element | null): HTMLElement[] => {
  const out: HTMLElement[] = [];
  let el: Element | null = start;
  while (el) {
    if (el instanceof HTMLElement) {
      if (isScrollable(el, 'y') || isScrollable(el, 'x')) out.push(el);
    }
    el = (el as any).parentElement || null;
  }
  return out;
};

const canScrollInDirection = (el: HTMLElement, dx: number, dy: number): boolean => {
  try {
    if (dy < 0) {
      if (isScrollable(el, 'y') && el.scrollTop > 0) return true;
    } else if (dy > 0) {
      if (isScrollable(el, 'y') && el.scrollTop < el.scrollHeight - el.clientHeight - 1) return true;
    }
    if (dx < 0) {
      if (isScrollable(el, 'x') && el.scrollLeft > 0) return true;
    } else if (dx > 0) {
      if (isScrollable(el, 'x') && el.scrollLeft < el.scrollWidth - el.clientWidth - 1) return true;
    }
  } catch {}
  return false;
};

/**
 * Global drag auto-scroll:
 * - While dragging, if pointer nears edges of a scrollable container (menu, viewport, etc.),
 *   auto-scroll that container.
 * - Falls back to scrolling the document if no scrollable ancestor is found.
 */
export const useGlobalDragAutoScroll = () => {
  const rafRef = useRef<number | null>(null);
  const vxRef = useRef(0);
  const vyRef = useRef(0);
  const targetRef = useRef<HTMLElement | null>(null);

  const stop = () => {
    vxRef.current = 0;
    vyRef.current = 0;
    targetRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const tick = () => {
    const vx = vxRef.current;
    const vy = vyRef.current;
    const target = targetRef.current;
    if ((!vx && !vy) || !target) {
      stop();
      return;
    }
    try {
      if (vx) target.scrollLeft += vx;
      if (vy) target.scrollTop += vy;
    } catch {}
    rafRef.current = requestAnimationFrame(tick);
  };

  const updateFromPointer = (clientX: number, clientY: number, el: HTMLElement) => {
    // Use WINDOW edges (not element edges) so narrow layouts can scroll the outer app container
    // while dragging from inner lists/menus down to timeline/columns.
    const edge = 72;
    const maxSpeed = 20; // px per frame at ~60fps

    let vx = 0;
    let vy = 0;

    // Horizontal (window)
    if (clientX < edge) {
      const t = Math.max(0, Math.min(1, (edge - clientX) / edge));
      vx = -maxSpeed * t;
    } else if (clientX > window.innerWidth - edge) {
      const t = Math.max(0, Math.min(1, (clientX - (window.innerWidth - edge)) / edge));
      vx = maxSpeed * t;
    }

    // Vertical (window)
    if (clientY < edge) {
      const t = Math.max(0, Math.min(1, (edge - clientY) / edge));
      vy = -maxSpeed * t;
    } else if (clientY > window.innerHeight - edge) {
      const t = Math.max(0, Math.min(1, (clientY - (window.innerHeight - edge)) / edge));
      vy = maxSpeed * t;
    }

    vxRef.current = vx;
    vyRef.current = vy;
    targetRef.current = el;

    if ((vx || vy) && rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tick);
    }
    if (!vx && !vy && rafRef.current != null) {
      stop();
    }
  };

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      // Only run when something is actually being dragged.
      if (!e) return;
      const x = (e as any).clientX as number;
      const y = (e as any).clientY as number;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      const under = document.elementFromPoint(x, y);
      const candidates: HTMLElement[] = [];

      // 1) App content container (outer) should win when it can scroll (narrow layouts).
      try {
        const appContent = document.querySelector('.vj-app-content') as HTMLElement | null;
        if (appContent) candidates.push(appContent);
      } catch {}

      // 2) Scrollable chain under pointer
      try {
        candidates.push(...findScrollableAncestors(under));
      } catch {}

      // 3) Document fallback
      try {
        const docEl = document.scrollingElement as HTMLElement | null;
        if (docEl) candidates.push(docEl);
      } catch {}

      // Determine intended direction based on window edges (same as updateFromPointer)
      const edge = 72;
      const dx = x < edge ? -1 : (x > window.innerWidth - edge ? 1 : 0);
      const dy = y < edge ? -1 : (y > window.innerHeight - edge ? 1 : 0);

      // If we're not near any edge, stop scrolling.
      if (!dx && !dy) {
        stop();
        return;
      }

      // Pick the largest scrollable container that can scroll in the desired direction.
      const unique = Array.from(new Set(candidates.filter(Boolean)));
      const viable = unique.filter((el) => canScrollInDirection(el, dx, dy));
      if (viable.length === 0) {
        stop();
        return;
      }

      let best = viable[0];
      let bestArea = 0;
      for (const el of viable) {
        const area = Math.max(1, el.clientWidth) * Math.max(1, el.clientHeight);
        if (area > bestArea) {
          bestArea = area;
          best = el;
        }
      }

      updateFromPointer(x, y, best);
    };

    const onEnd = () => stop();

    // Capture so we still receive events even if components stopPropagation.
    document.addEventListener('dragover', onDragOver, { passive: true, capture: true } as any);
    document.addEventListener('drop', onEnd as any);
    document.addEventListener('dragend', onEnd as any);

    return () => {
      document.removeEventListener('dragover', onDragOver as any, true as any);
      document.removeEventListener('drop', onEnd as any);
      document.removeEventListener('dragend', onEnd as any);
      stop();
    };
  }, []);
};

