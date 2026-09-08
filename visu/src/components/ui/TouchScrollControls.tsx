import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TOUCH_SCROLL_SELECTOR = [
  '.touch-scroll-surface',
  '.side-panel',
  '.magazine-screen',
  '.magazine-map',
  '.magazine-side-column',
  '.cell-control-panel',
  '.test-scenario-scroll',
  '.test-editor-scroll',
  '.test-run-history',
  '.magazine-matrix-card-map',
  '.alarm-table',
  '.cell-event-filter-content',
  '.cell-event-table',
  '.statistics-content',
  '.statistics-settings-content',
  '.robot-extended-scroll',
  '.robot-extended-tabs',
  '.cell-settings-topic-viewport',
].join(', ');

const SCROLL_EPSILON = 2;

type ScrollTarget = {
  id: number;
  element: HTMLElement;
  label: string;
  top: number;
  bottom: number;
  left: number;
  canScrollUp: boolean;
  canScrollDown: boolean;
};

function isScrollableAndVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width >= 96
    && rect.height >= 112
    && rect.right > 0
    && rect.bottom > 0
    && rect.left < window.innerWidth
    && rect.top < window.innerHeight
    && style.visibility !== 'hidden'
    && style.display !== 'none'
    && style.opacity !== '0'
    && element.dataset.touchScrollControls !== 'off'
    && element.scrollHeight - element.clientHeight > SCROLL_EPSILON
  );
}

function visibleModalScope() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .at(-1) ?? null;
}

function selectScrollOwners(elements: HTMLElement[]) {
  const modal = visibleModalScope();
  const scoped = modal
    ? elements.filter((element) => element === modal || modal.contains(element))
    : elements;

  // When a scrollable surface contains another scrollable surface, only the
  // deepest one owns touch arrows. Native wheel/drag scrolling remains on the
  // ancestor, but duplicate arrow pairs no longer pile up at the same edge.
  return scoped.filter((element) => !scoped.some((descendant) => (
    descendant !== element
    && element.contains(descendant)
    && descendant.dataset.touchScrollControls !== 'off'
  )));
}

export function TouchScrollControls() {
  const [targets, setTargets] = useState<ScrollTarget[]>([]);
  const targetIdsRef = useRef(new WeakMap<HTMLElement, number>());
  const nextTargetIdRef = useRef(1);
  const animationFrameRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(TOUCH_SCROLL_SELECTOR))
      .filter(isScrollableAndVisible);
    const nextTargets = selectScrollOwners(candidates)
      .map((element) => {
        let id = targetIdsRef.current.get(element);
        if (id === undefined) {
          id = nextTargetIdRef.current;
          nextTargetIdRef.current += 1;
          targetIdsRef.current.set(element, id);
        }

        const rect = element.getBoundingClientRect();
        const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);

        return {
          id,
          element,
          label: element.getAttribute('aria-label') ?? 'область',
          top: Math.round(Math.max(8, Math.min(window.innerHeight - 52, rect.top + 8))),
          bottom: Math.round(Math.max(8, Math.min(window.innerHeight - 52, rect.bottom - 52))),
          left: Math.round(Math.max(8, Math.min(window.innerWidth - 52, rect.right - 52))),
          canScrollUp: element.scrollTop > SCROLL_EPSILON,
          canScrollDown: element.scrollTop < maxScrollTop - SCROLL_EPSILON,
        };
      });

    setTargets((currentTargets) => {
      const unchanged = currentTargets.length === nextTargets.length
        && currentTargets.every((target, index) => {
          const next = nextTargets[index];
          return target.element === next.element
            && target.top === next.top
            && target.bottom === next.bottom
            && target.left === next.left
            && target.canScrollUp === next.canScrollUp
            && target.canScrollDown === next.canScrollDown;
        });

      return unchanged ? currentTargets : nextTargets;
    });
  }, []);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (animationFrameRef.current !== null) return;

      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        refresh();
      });
    };

    const mutations = new MutationObserver(scheduleRefresh);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

    window.addEventListener('resize', scheduleRefresh);
    document.addEventListener('scroll', scheduleRefresh, true);
    scheduleRefresh();

    return () => {
      mutations.disconnect();
      window.removeEventListener('resize', scheduleRefresh);
      document.removeEventListener('scroll', scheduleRefresh, true);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [refresh]);

  const scroll = (target: ScrollTarget, direction: 1 | -1) => {
    target.element.scrollBy({
      top: direction * Math.max(96, Math.min(360, Math.round(target.element.clientHeight * 0.72))),
      behavior: 'smooth',
    });
  };

  if (targets.length === 0) return null;

  return createPortal(
    <div className="touch-scroll-controls-layer">
      {targets.flatMap((target) => [
        target.canScrollUp ? <button
          key={`${target.id}-up`}
          className="touch-scroll-control"
          type="button"
          style={{ top: target.top, left: target.left }}
          aria-label={`Прокрутить вверх: ${target.label}`}
          onClick={() => scroll(target, -1)}
        >
          <ChevronUp aria-hidden="true" />
        </button> : null,
        target.canScrollDown ? <button
          key={`${target.id}-down`}
          className="touch-scroll-control"
          type="button"
          style={{ top: target.bottom, left: target.left }}
          aria-label={`Прокрутить вниз: ${target.label}`}
          onClick={() => scroll(target, 1)}
        >
          <ChevronDown aria-hidden="true" />
        </button> : null,
      ])}
    </div>,
    document.body,
  );
}
