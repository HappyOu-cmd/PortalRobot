import { useEffect, useRef, useState } from 'react';

const PLC_CONFIRM_TIMEOUT_MS = 5000;

function formatValue(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

function parseDraft(draft: string): number | null {
  const normalized = draft.trim().replace(',', '.');
  if (!normalized || normalized === '-' || normalized === '+' || normalized === '.' || normalized === '-.' || normalized === '+.') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function sameValue(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9;
}

export function MagazineSettingField({ label, value, min, max, step = 1, disabled = false, onCommit }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onCommit: (value: number) => boolean;
}) {
  const [draft, setDraft] = useState(() => formatValue(value));
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const valueRef = useRef(value);
  const pendingValueRef = useRef<number | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const skipBlurCommitRef = useRef(false);

  const clearConfirmTimer = () => {
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = null;
  };

  useEffect(() => {
    valueRef.current = value;
    const pendingValue = pendingValueRef.current;
    if (pendingValue !== null && sameValue(value, pendingValue)) {
      pendingValueRef.current = null;
      clearConfirmTimer();
      setMessage('');
      if (!editing) setDraft(formatValue(value));
      return;
    }
    if (!editing && pendingValue === null) setDraft(formatValue(value));
  }, [editing, value]);

  useEffect(() => () => clearConfirmTimer(), []);

  const cancelDraft = () => {
    pendingValueRef.current = null;
    clearConfirmTimer();
    setEditing(false);
    setMessage('');
    setDraft(formatValue(valueRef.current));
  };

  const commitDraft = () => {
    setEditing(false);
    if (disabled) {
      cancelDraft();
      return;
    }
    const nextValue = parseDraft(draft);
    if (nextValue === null || nextValue < min || nextValue > max) {
      pendingValueRef.current = null;
      clearConfirmTimer();
      setMessage(`Допустимо: ${min}…${max}`);
      setDraft(formatValue(valueRef.current));
      return;
    }
    if (pendingValueRef.current !== null && sameValue(nextValue, pendingValueRef.current)) return;
    if (pendingValueRef.current === null && sameValue(nextValue, valueRef.current)) {
      pendingValueRef.current = null;
      clearConfirmTimer();
      setMessage('');
      setDraft(formatValue(valueRef.current));
      return;
    }

    pendingValueRef.current = nextValue;
    clearConfirmTimer();
    setMessage('Ожидание PLC');
    setDraft(formatValue(nextValue));
    if (!onCommit(nextValue)) {
      pendingValueRef.current = null;
      setMessage('Команда не отправлена');
      setDraft(formatValue(valueRef.current));
      return;
    }
    confirmTimerRef.current = window.setTimeout(() => {
      pendingValueRef.current = null;
      confirmTimerRef.current = null;
      setMessage('PLC не подтвердил');
      setDraft(formatValue(valueRef.current));
    }, PLC_CONFIRM_TIMEOUT_MS);
  };

  return <label className={`magazine-setting ${pendingValueRef.current !== null ? 'pending' : ''}`}>
    <span>{label}{message && <small aria-live="polite">{message}</small>}</span>
    <input
      type="text"
      inputMode="decimal"
      pattern="[+-]?[0-9]*([.,][0-9]*)?"
      role="spinbutton"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={parseDraft(draft) ?? undefined}
      value={draft}
      disabled={disabled}
      data-step={step}
      onFocus={() => { setEditing(true); setMessage(''); }}
      onChange={(event) => { setDraft(event.currentTarget.value); setMessage(''); }}
      onBlur={() => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          return;
        }
        commitDraft();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          skipBlurCommitRef.current = true;
          cancelDraft();
          event.currentTarget.blur();
        }
      }}
    />
  </label>;
}
