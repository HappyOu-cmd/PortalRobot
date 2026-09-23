import checkIcon from '@iconify-icons/mdi/check';
import chevronRightIcon from '@iconify-icons/mdi/chevron-right';
import closeIcon from '@iconify-icons/mdi/close';
import { Icon } from '@iconify/react';
import { cva } from 'class-variance-authority';
import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import './operator-confirmation.css';

export function OperatorConfirmationLayout({
  title, context, description, icon, steps, step, cancelLabel, cancelDisabled = false,
  status, onCancel, children, className,
}: {
  title: string;
  context: string;
  description: string;
  icon: ReactNode;
  steps: string[];
  step: number;
  cancelLabel: string;
  cancelDisabled?: boolean;
  status: string;
  onCancel: () => void;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return <div className={cn('confirmation-overlay operator-confirmation', className)} role="dialog" aria-modal="true" aria-labelledby={headingId} onPointerDown={(event) => event.stopPropagation()}>
    <div className="confirmation-modal">
      <aside className="confirmation-context">
        <span className="confirmation-context-label">{context}</span>
        <div className="confirmation-machine-identity">
          <div className="confirmation-equipment-icon" aria-hidden="true">{icon}</div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <ol className="confirmation-stepper" aria-label="Этапы подтверждения">
          {steps.map((label, index) => <li key={label} className={index + 1 === step ? 'active' : index + 1 < step ? 'done' : ''} aria-current={index + 1 === step ? 'step' : undefined}>
            <i aria-hidden="true">{index + 1 < step ? <Icon icon={checkIcon} /> : index + 1}</i>
            <span>{label}</span>
          </li>)}
        </ol>
      </aside>
      <section className="confirmation-workflow">
        <header>
          <div><h2 id={headingId}>Подтверждение оператора<span className="confirmation-sr-only"> · {title}</span></h2><span>Шаг {step} из {steps.length}</span></div>
          <button type="button" disabled={cancelDisabled} onClick={onCancel} title={cancelLabel} aria-label={cancelLabel}><Icon icon={closeIcon} aria-hidden="true" /></button>
        </header>
        <div className="confirmation-question" aria-live="polite">{children}</div>
        <footer>
          <button type="button" disabled={cancelDisabled} onClick={onCancel}>{cancelLabel}</button>
          <span role="status">{status}</span>
        </footer>
      </section>
    </div>
  </div>;
}

const choiceStyles = cva('confirmation-choice', {
  variants: { tone: { blank: 'blank', detail: 'detail' } },
});

export function ConfirmationChoice({ icon, title, description, badge, tone, className, disabled = false, onClick }: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: ReactNode;
  tone?: 'blank' | 'detail';
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return <button className={cn(choiceStyles({ tone }), className)} type="button" disabled={disabled} onClick={onClick}>
    <span className="confirmation-choice-top"><span className="confirmation-choice-icon" aria-hidden="true">{icon}</span>{badge}</span>
    <strong>{title}</strong>
    <span className="confirmation-choice-description">{description}</span>
    <span className="confirmation-choice-action" aria-hidden="true">Выбрать<Icon icon={chevronRightIcon} /></span>
  </button>;
}
