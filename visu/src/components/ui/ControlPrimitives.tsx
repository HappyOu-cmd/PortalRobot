import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type ControlOption = {
  value: string;
  label: ReactNode;
  className?: string;
  disabled?: boolean;
  ariaDisabled?: boolean;
};

export function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return <label className={cn('ui-toggle', disabled && 'is-disabled', className)}>
    <span className="ui-toggle__copy">
      <span className="ui-toggle__label">{label}</span>
      {description && <span className="ui-toggle__description">{description}</span>}
    </span>
    <input
      className="ui-toggle__input"
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className="ui-toggle__track" aria-hidden="true"><span /></span>
  </label>;
}

export function SegmentedControl({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  animated = true,
  className,
}: {
  value: string;
  options: readonly ControlOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  animated?: boolean;
  className?: string;
}) {
  type SegmentPosition = {
    left: number;
    top: number;
    width: number;
    height: number;
  };

  type SegmentAnimation = {
    from: SegmentPosition;
    mid: SegmentPosition;
    to: SegmentPosition;
    direction: 'forward' | 'backward';
    key: number;
  };

  const trackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const animationRef = useRef<SegmentAnimation | null>(null);
  const animationKeyRef = useRef(0);
  const activeIndex = options.findIndex((option) => option.value === value);
  const [thumbPosition, setThumbPosition] = useState<SegmentPosition | null>(null);
  const [animation, setAnimation] = useState<SegmentAnimation | null>(null);
  const [ripple, setRipple] = useState<{ left: number; top: number; key: number } | null>(null);

  const getPosition = (index: number): SegmentPosition | null => {
    const button = buttonRefs.current[index];
    if (!button) return null;

    return {
      left: button.offsetLeft,
      top: button.offsetTop,
      width: button.offsetWidth,
      height: button.offsetHeight,
    };
  };

  useLayoutEffect(() => {
    if (animationRef.current || activeIndex < 0) return;

    const syncThumbPosition = () => {
      const position = getPosition(activeIndex);
      if (position) setThumbPosition(position);
    };

    syncThumbPosition();

    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(syncThumbPosition);
    observer.observe(track);
    return () => observer.disconnect();
  }, [activeIndex, options.length]);

  const handleChange = (nextValue: string) => {
    const nextIndex = options.findIndex((option) => option.value === nextValue);
    const from = getPosition(activeIndex);
    const to = getPosition(nextIndex);

    if (activeIndex >= 0 && nextIndex >= 0 && activeIndex !== nextIndex && from && to) {
      setThumbPosition(to);
      if (!animated) {
        setAnimation(null);
        setRipple(null);
        onChange(nextValue);
        return;
      }

      const nextAnimation: SegmentAnimation = {
        from,
        mid: activeIndex < nextIndex
          ? {
            left: from.left,
            top: from.top,
            width: to.left + to.width - from.left,
            height: from.height,
          }
          : {
            left: to.left,
            top: to.top,
            width: from.left + from.width - to.left,
            height: from.height,
          },
        to,
        direction: activeIndex < nextIndex ? 'forward' : 'backward',
        key: ++animationKeyRef.current,
      };

      animationRef.current = nextAnimation;
      setAnimation(nextAnimation);
      setRipple({ left: to.left + to.width / 2, top: to.top + to.height / 2, key: nextAnimation.key });
    }

    onChange(nextValue);
  };

  const thumbStyle = thumbPosition ? {
    '--thumb-left': `${thumbPosition.left}px`,
    '--thumb-top': `${thumbPosition.top}px`,
    '--thumb-width': `${thumbPosition.width}px`,
    '--thumb-height': `${thumbPosition.height}px`,
    ...(animation ? {
      '--thumb-from-left': `${animation.from.left}px`,
      '--thumb-from-width': `${animation.from.width}px`,
      '--thumb-mid-left': `${animation.mid.left}px`,
      '--thumb-mid-width': `${animation.mid.width}px`,
      '--thumb-to-left': `${animation.to.left}px`,
      '--thumb-to-width': `${animation.to.width}px`,
      animation: `ui-segmented-thumb-${animation.direction} 520ms cubic-bezier(.16, 1, .3, 1) both`,
    } : {}),
  } as CSSProperties : undefined;

  return <div
    className={cn('ui-segmented', !animated && 'is-static', disabled && 'is-disabled', className)}
    role="group"
    aria-label={ariaLabel}
    style={{ '--segment-count': Math.max(options.length, 1) } as CSSProperties}
  >
    <div ref={trackRef} className="ui-segmented__track">
      {ripple && <span
        key={ripple.key}
        className="ui-segmented__ripple"
        style={{ left: ripple.left, top: ripple.top }}
        aria-hidden="true"
        onAnimationEnd={() => setRipple(null)}
      />}
      {thumbPosition && <span
        key={animation?.key ?? 'thumb'}
        className="ui-segmented__thumb"
        style={thumbStyle}
        aria-hidden="true"
        onAnimationEnd={() => {
          if (!animation) return;
          animationRef.current = null;
          setThumbPosition(animation.to);
          setAnimation(null);
        }}
      />}
      {options.map((option, index) => {
        const isActive = option.value === value;

        return <button
          key={option.value}
          ref={(element) => { buttonRefs.current[index] = element; }}
          type="button"
          className={cn('ui-segmented__option', option.className, isActive && 'is-active')}
          disabled={disabled || option.disabled || isActive}
          aria-disabled={option.ariaDisabled || undefined}
          aria-pressed={isActive}
          onClick={() => handleChange(option.value)}
        >{option.label}</button>;
      })}
    </div>
  </div>;
}

export function RangeInput({
  id,
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  disabled = false,
  className,
  style,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const progress = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;

  return <input
    id={id}
    className={cn('ui-range-input', className)}
    type="range"
    min={min}
    max={max}
    step={step}
    value={value}
    disabled={disabled}
    aria-label={ariaLabel}
    style={{ '--control-progress': `${progress}%`, ...style } as CSSProperties}
    onChange={(event) => onChange(Number(event.target.value))}
  />;
}

export function RangeSlider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  valueLabel,
  disabled = false,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  label: ReactNode;
  valueLabel: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const inputId = useId();

  return <label className={cn('ui-range', disabled && 'is-disabled', className)} htmlFor={inputId}>
    <span className="ui-range__head"><span>{label}</span><output>{valueLabel}</output></span>
    <RangeInput
      id={inputId}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      ariaLabel={typeof label === 'string' ? label : 'Ползунок'}
      onChange={onChange}
    />
  </label>;
}
