import { AlertCircle, ChevronUp, TriangleAlert } from 'lucide-react';
import type { PlcAlarmEvent } from '../plc/client';

interface LatestEventNotificationProps {
  event: PlcAlarmEvent;
  mechanism: string;
  activeCount: number;
  recommendation?: string;
  onCollapse: () => void;
  className?: string;
}

export function LatestEventNotification({
  event,
  mechanism,
  activeCount,
  recommendation,
  onCollapse,
  className,
}: LatestEventNotificationProps) {
  const isAlarm = event.severity === 'alarm';
  const typeLabel = isAlarm ? 'Авария' : 'Предупреждение';
  const EventIcon = isAlarm ? TriangleAlert : AlertCircle;

  return <section
    className={`latest-event-notification ${event.severity} ${className ?? ''}`.trim()}
    aria-label={`Последнее активное событие: ${typeLabel}`}
    aria-live={isAlarm ? 'assertive' : 'polite'}
  >
    <span className="latest-event-icon" aria-hidden="true"><EventIcon /></span>
    <strong className="latest-event-type">{typeLabel}</strong>
    <i className="latest-event-divider" aria-hidden="true" />
    <span className="latest-event-mechanism">{mechanism}</span>
    <i className="latest-event-divider" aria-hidden="true" />
    <span className="latest-event-message">
      <b>{event.text}</b>
      {recommendation && <small>{recommendation}</small>}
    </span>
    <span className="latest-event-count" title={`Активных событий: ${activeCount}`}>
      <AlertCircle aria-hidden="true" />
      <b>{activeCount}</b>
    </span>
    <button type="button" onClick={onCollapse} aria-label="Скрыть уведомление" title="Скрыть уведомление">
      <ChevronUp aria-hidden="true" />
    </button>
  </section>;
}
