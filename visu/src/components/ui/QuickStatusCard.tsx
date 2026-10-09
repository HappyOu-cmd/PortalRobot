import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Indicator } from './Indicator';

export type QuickStatusTone = 'gray' | 'green' | 'blue' | 'amber' | 'red';

export function QuickStatusCard({
  icon: IconComponent,
  title,
  status,
  tone,
  detail,
  className,
  interactive = false,
  onClick,
  ariaExpanded,
  ariaControls,
}: {
  icon: LucideIcon;
  title: string;
  status: ReactNode;
  tone: QuickStatusTone;
  detail?: ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  ariaExpanded?: boolean;
  ariaControls?: string;
}) {
  const cardClassName = `quick-status-card tone-${tone}${className ? ` ${className}` : ''}`;
  const statusTone = tone === 'gray' ? 'blue' : tone;
  const content = <>
    <div className="quick-status-card__heading">
      <span className="quick-status-card__icon"><IconComponent aria-hidden="true" /></span>
      <span className="quick-status-card__copy">
        <strong>{title}</strong>
      </span>
    </div>
    <div className="quick-status-card__state">
      <i aria-hidden="true" />
      <span><Indicator active={tone !== 'gray'} tone={statusTone} />{status}</span>
      {detail && <b>{detail}</b>}
    </div>
  </>;

  if (interactive) {
    return <button className={cardClassName} type="button" onClick={onClick} aria-expanded={ariaExpanded} aria-controls={ariaControls}>{content}</button>;
  }

  return <article className={cardClassName}>{content}</article>;
}
