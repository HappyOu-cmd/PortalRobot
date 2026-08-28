import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent } from 'react';
import { cn } from '../../lib/utils';

export interface VercelTab<T extends string = string> {
  id: T;
  label: string;
}

interface VercelTabsProps<T extends string> extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs: readonly VercelTab<T>[];
  activeTab: T;
  onTabChange: (tabId: T) => void;
  ariaLabel: string;
  panelId?: string;
}

interface IndicatorStyle extends CSSProperties {
  left: number;
  width: number;
}

const EMPTY_INDICATOR: IndicatorStyle = { left: 0, width: 0 };

export function VercelTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  panelId,
  className,
  ...props
}: VercelTabsProps<T>) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoverStyle, setHoverStyle] = useState<IndicatorStyle>(EMPTY_INDICATOR);
  const [activeStyle, setActiveStyle] = useState<IndicatorStyle>(EMPTY_INDICATOR);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab));

  const measureTab = (index: number): IndicatorStyle => {
    const element = tabRefs.current[index];
    return element ? { left: element.offsetLeft, width: element.offsetWidth } : EMPTY_INDICATOR;
  };

  useLayoutEffect(() => {
    const updateIndicators = () => {
      setActiveStyle(measureTab(activeIndex));
      if (hoveredIndex !== null) setHoverStyle(measureTab(hoveredIndex));
    };

    updateIndicators();
    const observer = new ResizeObserver(updateIndicators);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, [activeIndex, hoveredIndex]);

  const selectAt = (index: number) => {
    const normalizedIndex = (index + tabs.length) % tabs.length;
    tabRefs.current[normalizedIndex]?.focus();
    onTabChange(tabs[normalizedIndex].id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectAt(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectAt(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectAt(tabs.length - 1);
    }
  };

  return (
    <div className={cn('vercel-tabs', className)} {...props}>
      <div
        className="vercel-tabs__track"
        ref={trackRef}
        role="tablist"
        aria-label={ariaLabel}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <span
          className="vercel-tabs__hover"
          aria-hidden="true"
          style={{ ...hoverStyle, opacity: hoveredIndex === null ? 0 : 1 }}
        />
        <span className="vercel-tabs__active" aria-hidden="true" style={activeStyle} />
        <div className="vercel-tabs__items">
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                className={cn('vercel-tabs__tab', isActive && 'active')}
                key={tab.id}
                ref={(element) => { tabRefs.current[index] = element; }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                onMouseEnter={() => {
                  setHoveredIndex(index);
                  setHoverStyle(measureTab(index));
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
