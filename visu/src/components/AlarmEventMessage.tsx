import closeIcon from '@iconify-icons/mdi/close';
import * as Popover from '@radix-ui/react-popover';
import { AlertCircle, TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { hmiAlarmEffectLabel, hmiAlarmSourceLabel, type HmiAlarmEvent } from '../plc/hmiAlarms';
import { Button } from './ui/Button';
import './alarm-event-message.css';

export function AlarmEventMessage({ event }: { event: HmiAlarmEvent }) {
  const titleId = useId();
  const messageId = useId();

  return <Popover.Root>
    <Popover.Trigger asChild>
      <button
        type="button"
        className="alarm-event-text alarm-event-trigger"
        title="Показать полный текст сообщения"
        aria-label={`Показать полный текст сообщения: ${event.text}`}
      >
        {event.severity === 'alarm' ? <TriangleAlert aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
        <b>{event.text}</b>
        <small>{hmiAlarmEffectLabel(event)}</small>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        className="alarm-message-card"
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        hideWhenDetached
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <header className="alarm-message-heading">
          <strong id={titleId}>{event.severity === 'alarm' ? 'Авария' : 'Предупреждение'}</strong>
          <Popover.Close asChild>
            <Button variant="ghost" size="icon" icon={closeIcon} className="alarm-message-close" aria-label="Закрыть полный текст сообщения" title="Закрыть" />
          </Popover.Close>
        </header>
        <p id={messageId} className="alarm-message-body">{event.text}</p>
        <footer className="alarm-message-meta">
          <span>{hmiAlarmSourceLabel(event)}</span>
          <span>{hmiAlarmEffectLabel(event)}</span>
        </footer>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
