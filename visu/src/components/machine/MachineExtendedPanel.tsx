import { useState } from 'react';
import { cva } from 'class-variance-authority';
import { Icon } from '@iconify/react';
import machineIcon from '@iconify-icons/material-symbols/microwave-gen-outline';
import settingsIcon from '@iconify-icons/material-symbols/settings-outline';
import closeIcon from '@iconify-icons/material-symbols/close';
import powerIcon from '@iconify-icons/material-symbols/power-settings-new';
import arrowIcon from '@iconify-icons/material-symbols/arrow-forward';
import overviewIcon from '@iconify-icons/material-symbols/grid-view-outline';
import sensorsIcon from '@iconify-icons/material-symbols/sensors';
import timerIcon from '@iconify-icons/material-symbols/timer-outline';
import robotIcon from '@iconify-icons/material-symbols/precision-manufacturing-outline';
import partIcon from '@iconify-icons/material-symbols/inventory-2-outline';
import errorIcon from '@iconify-icons/material-symbols/error-outline';
import doorIcon from '@iconify-icons/material-symbols/door-open-outline';
import hatchIcon from '@iconify-icons/material-symbols/crop-free';
import lockIcon from '@iconify-icons/material-symbols/lock-outline';
import chuckIcon from '@iconify-icons/material-symbols/radio-button-checked';
import type { MachineState, ProductType } from '../../model/types';
import { cn } from '../../lib/utils';
import { ProductTypeBadge, ProductTypeSelector } from '../multiType/MultiTypeControls';
import { SegmentedControl } from '../ui/ControlPrimitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { isMachineMotionAllowed, type MachineMechanism, type MachineMechanismAction } from './MachineManualControl';
import './machine-extended-panel.css';

const OPERATIONS = { NONE: 'Нет операции', LOAD: 'Загрузка заготовки', UNLOAD: 'Выгрузка детали', CHANGE: 'Замена детали' };
const MECHANISMS: { id: MachineMechanism; label: string; open: string; close: string }[] = [
  { id: 'door', label: 'Операторская дверь', open: 'Открыть', close: 'Закрыть' },
  { id: 'hatch', label: 'Роботный люк', open: 'Открыть', close: 'Закрыть' },
  { id: 'lock', label: 'Замок люка', open: 'Отпереть', close: 'Запереть' },
  { id: 'chuck', label: 'Патрон', open: 'Разжать', close: 'Зажать' },
];
const MECHANISM_ICONS = { door: doorIcon, hatch: hatchIcon, lock: lockIcon, chuck: chuckIcon };
const secondsText = (value: number) => Number.isFinite(value) ? `${Math.max(0, value).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с` : '—';
const commandButton = cva('mx-button', {
  variants: { unavailable: { true: 'command-unavailable', false: '' }, enabled: { true: 'is-enabled', false: '' } },
});

function feedback(state: MachineState, id: MachineMechanism) {
  if (id === 'lock') return state.hatchLocked ? 'Заперт' : 'Не заперт';
  const open = id === 'door' ? state.doorOpen : id === 'hatch' ? state.hatchOpen : state.chuckOpen;
  const closed = id === 'door' ? state.doorClosed : id === 'hatch' ? state.hatchClosed : state.chuckClosed;
  if (open && closed) return 'Противоречие датчиков';
  if (!open && !closed) return 'Нет подтверждения';
  if (id === 'chuck') return open ? 'Разжат' : 'Зажат';
  return open ? 'Открыто' : 'Закрыто';
}

function CycleSettings({ state, editable, onApply }: {
  state: MachineState;
  editable: boolean;
  onApply: (useHmi: boolean, seconds?: number) => void;
}) {
  const [draftMode, setDraftMode] = useState<boolean | null>(null);
  const [draftSeconds, setDraftSeconds] = useState<string | null>(null);
  const useHmi = draftMode ?? state.useHmiCycleTime;
  const value = draftSeconds ?? String(state.cycleExpectedS);
  const numeric = Number(value);
  const valid = !useHmi || (value.trim() !== '' && Number.isFinite(numeric) && numeric >= 1 && numeric <= 86400);
  const changed = useHmi !== state.useHmiCycleTime || (useHmi && numeric !== state.cycleExpectedS);
  const reset = () => { setDraftMode(null); setDraftSeconds(null); };

  return <form className="mx-cycle-form" onSubmit={(event) => {
    event.preventDefault();
    if (!editable || !valid || !changed) return;
    onApply(useHmi, useHmi ? numeric : undefined);
    reset();
  }}>
    <SegmentedControl value={useHmi ? 'hmi' : 'measured'}
      options={[{ value: 'measured', label: 'По замеру' }, { value: 'hmi', label: 'Задать вручную' }]}
      disabled={!editable} onChange={(value) => setDraftMode(value === 'hmi')} ariaLabel="Источник оценки времени цикла" />
    <p className="mx-note">Оценка нужна для планирования обслуживания роботом. Она не меняет программу обработки станка.</p>
    {useHmi && <label className="mx-time-field"><span>Ожидаемое время, с</span><input type="number" min={1} max={86400} step="any"
      value={value} disabled={!editable} aria-invalid={!valid} onChange={(event) => setDraftSeconds(event.target.value)} /></label>}
    {!valid && <p className="mx-error" role="alert">Введите время от 1 до 86 400 секунд.</p>}
    <div className="mx-row"><span>Последний корректный замер</span><strong>{state.measuredCycleS > 0 ? secondsText(state.measuredCycleS) : 'Ещё нет замера'}</strong></div>
    <div className="mx-form-actions"><button className="mx-button mx-primary" type="submit" disabled={!editable || !valid || !changed}>Применить</button>
      <button className="mx-button" type="button" disabled={draftMode === null && draftSeconds === null} onClick={reset}>Отменить правку</button></div>
  </form>;
}

export function MachineExtendedPanel({ index, state, machines, dataMode, editable, manualMode, multiTypeCount, productTypeChangeAllowed,
  onSelect, onClose, onToggleEnabled, onCycleSettings, onProductType, onManualMotion, onOpenAlarms, className,
}: {
  index: number;
  state: MachineState;
  machines: MachineState[];
  dataMode: 'live' | 'local' | 'offline';
  editable: boolean;
  manualMode: boolean;
  multiTypeCount: number;
  productTypeChangeAllowed: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
  onToggleEnabled: () => void;
  onCycleSettings: (useHmi: boolean, seconds?: number) => void;
  onProductType: (type: ProductType) => void;
  onManualMotion: (mechanism: MachineMechanism, action: MachineMechanismAction) => void;
  onOpenAlarms: () => void;
  className?: string;
}) {
  const [tab, setTab] = useState('overview');
  const available = dataMode !== 'offline';
  const canCommand = editable && available;
  const hasAlarm = state.alarm || state.mode === 'error' || state.activeErrors.length > 0;
  const status = !available ? 'Нет связи с PLC' : hasAlarm ? 'Авария станка' : state.disablePending ? 'Отключение после операции'
    : !state.enabled ? 'Станок выключен' : state.mode === 'processing' ? 'Обработка' : state.currentStep || 'Станок включён';
  const tone = !available ? 'muted' : hasAlarm ? 'danger' : state.disablePending ? 'warning' : state.enabled ? 'active' : 'muted';
  const progress = available && state.cycleExpectedS > 0 ? Math.max(0, Math.min(100, state.cycleElapsedS / state.cycleExpectedS * 100)) : 0;
  const display = (text: string) => available ? text : '—';
  const part = state.partState === 'UNKNOWN' ? 'Не определено' : state.partState === 'EMPTY' ? 'Патрон пуст'
    : state.partType === 'BLANK' ? 'Заготовка' : state.partType === 'DETAIL' ? 'Готовая деталь' : 'Тип не определён';
  const signals: [string, boolean][] = [
    ['Дверь открыта', state.doorOpen], ['Дверь закрыта', state.doorClosed],
    ['Люк открыт', state.hatchOpen], ['Люк закрыт', state.hatchClosed], ['Замок люка заперт', state.hatchLocked],
    ['Патрон разжат', state.chuckOpen], ['Патрон зажат', state.chuckClosed],
    ['Изделие присутствует', state.partPresent], ['Изделие готово', state.partReady],
  ];

  return <aside className={cn('side-panel machine-extended-panel', className)} aria-label={`Расширенное управление станком ${index + 1}`}>
    <header className="mx-header">
      <div className="mx-heading"><div className="mx-machine-icon"><Icon icon={machineIcon} aria-hidden="true" /></div>
        <div><p>Расширенное управление</p><h2>Станок {String(index + 1).padStart(2, '0')}</h2></div></div>
      <button className="mx-close" type="button" onClick={onClose} aria-label="Закрыть управление станком"><Icon icon={closeIcon} aria-hidden="true" /></button>
    </header>
    <SegmentedControl className="mx-machine-switch" value={String(index)} ariaLabel="Выбор станка" thumbFullHeight
      options={machines.map((machine, machineIndex) => ({ value: String(machineIndex), label: <>
        <span className="mx-machine-label">Станок <b>{String(machineIndex + 1).padStart(2, '0')}</b></span>
        <i className={available && (machine.alarm || machine.mode === 'error' || machine.activeErrors.length > 0) ? 'danger' : available && machine.enabled ? 'active' : ''} />
      </> }))} onChange={(value) => onSelect(Number(value))} />
    <div className="mx-status" data-tone={tone}><div><i /><strong>{status}</strong></div>
      <small>{dataMode === 'offline' ? 'Ожидание связи' : dataMode === 'local' ? 'Локально' : manualMode ? 'Ручной режим' : 'Автоматический режим'}</small></div>
    {available && hasAlarm && <div className="mx-alarm" role="status"><Icon icon={errorIcon} aria-hidden="true" /><div><strong>Требуется внимание</strong><p>{state.activeErrors[0] || 'Станок сообщает об аварии. Откройте список аварий для диагностики.'}</p></div></div>}

    <Tabs value={tab} onValueChange={setTab} className="mx-tabs">
      <TabsList className="mx-tabs-list" data-active-tab={tab} aria-label="Разделы управления станком">
        <TabsTrigger value="overview"><Icon icon={overviewIcon} aria-hidden="true" />Обзор</TabsTrigger>
        <TabsTrigger value="setup"><Icon icon={settingsIcon} aria-hidden="true" />Наладка</TabsTrigger>
        <TabsTrigger value="diagnostics"><Icon icon={sensorsIcon} aria-hidden="true" />Диагностика{available && hasAlarm && <i className="mx-tab-alert" />}</TabsTrigger>
      </TabsList>
      <div className="mx-scroll" key={`${index}-${tab}`}>
        <TabsContent value="overview" className="mx-tab-content">
          <section className="mx-cycle-section">
            <div className="mx-section-heading"><h3><Icon icon={timerIcon} aria-hidden="true" />Цикл обработки</h3><span className="mx-tag">{display(state.useHmiCycleTime ? 'Ручная оценка' : 'По замеру')}</span></div>
            <div className="mx-cycle-primary"><div><span>Прошло времени</span><b>{display(secondsText(state.cycleElapsedS))}</b></div>
              <div className="mx-cycle-estimate"><strong>{display(`${Math.round(progress)}%`)}</strong><span>от оценки цикла</span></div></div>
            <div className={cn('mx-progress', available && state.cycleOvertime && 'is-overtime')} role="progressbar" aria-label="Время обработки относительно оценки" aria-valuemin={0} aria-valuemax={100} aria-valuenow={available ? Math.round(progress) : undefined}><i style={{ width: `${progress}%` }} /></div>
            <div className="mx-cycle-values"><div><span>Осталось ≈</span><b>{display(secondsText(dataMode === 'local' ? state.cycleExpectedS - state.cycleElapsedS : state.cycleRemainingS))}</b></div>
              <div><span>Ожидается</span><b>{display(secondsText(state.cycleExpectedS))}</b></div>
              <div><span>Последний замер</span><b>{display(state.measuredCycleS > 0 ? secondsText(state.measuredCycleS) : '—')}</b></div></div>
            {available && state.cycleOvertime && <p className="mx-warning"><Icon icon={errorIcon} aria-hidden="true" />Ожидаемое время обработки превышено.</p>}
          </section>

          <section>
            <div className="mx-section-heading"><h3>Ход работы</h3><span className="mx-tag">{display(`Шаг ${state.plcState}`)}</span></div>
            <div className="mx-step"><i aria-hidden="true" /><div><span>Текущий шаг</span><strong>{display(state.currentStep || 'Не определён')}</strong></div></div>
            <div className="mx-operation-flow"><div><span>Выполняется</span><strong>{display(OPERATIONS[state.actualOperation])}</strong></div><Icon icon={arrowIcon} aria-hidden="true" /><div><span>Следующая операция</span><strong>{display(OPERATIONS[state.recommendedOperation])}</strong></div></div>
            <div className="mx-service"><Icon icon={robotIcon} aria-hidden="true" /><span>Обслуживание роботом</span><strong className={available && state.canAcceptService ? 'mx-positive' : ''}>{display(state.canAcceptService ? 'Разрешено' : state.serviceRequired ? 'Требуется · допуск закрыт' : 'Не требуется')}</strong></div>
          </section>

          <section>
            <div className="mx-section-heading"><h3>Механизмы</h3><button type="button" className="mx-text-button" onClick={() => setTab('setup')}>Управление<Icon icon={arrowIcon} aria-hidden="true" /></button></div>
            <div className="mx-feedback-grid">{MECHANISMS.map(({ id, label }) => <button type="button" key={id} onClick={() => setTab('setup')} aria-label={`${label}: ${display(feedback(state, id))}. Открыть наладку`}>
              <Icon icon={MECHANISM_ICONS[id]} aria-hidden="true" /><div><span>{label}</span><strong>{display(feedback(state, id))}</strong></div>
            </button>)}</div>
          </section>

          <section className="mx-product-section"><div className="mx-product-icon"><Icon icon={partIcon} aria-hidden="true" /></div><div className="mx-product-copy"><span>Изделие в патроне</span><strong>{display(part)}</strong><small>{display(state.partReady ? 'Готовность к выгрузке подтверждена' : 'Готовность к выгрузке не подтверждена')}</small></div>{available && <ProductTypeBadge type={state.productType} />}</section>
        </TabsContent>

        <TabsContent value="setup" className="mx-tab-content">
          <section><div className="mx-section-heading"><h3>Ручное управление</h3><span className="mx-tag">4 механизма</span></div>
            <p className="mx-note">Выберите механизм и действие. Перед движением появится подтверждение безопасности.</p>
            <div className="mx-mechanisms">{MECHANISMS.map(({ id, label, open, close }, mechanismIndex) => <div className="mx-mechanism" key={id}>
              <div className="mx-mechanism-heading"><Icon icon={MECHANISM_ICONS[id]} aria-hidden="true" /><div><strong>{label}</strong><span>{display(feedback(state, id))}</span></div><small>{String(mechanismIndex + 1).padStart(2, '0')}</small></div>
              <div className="mx-mechanism-actions">{(['open', 'close'] as const).map((action) => {
                const allowed = available && isMachineMotionAllowed(state, id, action, dataMode === 'live');
                return <button type="button" key={action} className={commandButton({ unavailable: !allowed })} disabled={!canCommand}
                  aria-label={`${label}: ${action === 'open' ? open : close}`} aria-disabled={!canCommand || !allowed}
                  title={!available ? 'Нет связи с PLC' : allowed ? 'Команда разрешена' : 'Команда не разрешена'} onClick={() => onManualMotion(id, action)}>{action === 'open' ? open : close}</button>;
              })}</div>
            </div>)}</div></section>
          <section><div className="mx-section-heading"><h3><Icon icon={partIcon} aria-hidden="true" />Тип заготовки</h3>{available && <ProductTypeBadge type={state.productType} />}</div>
            <ProductTypeSelector value={state.productType} count={multiTypeCount} disabled={!canCommand || !productTypeChangeAllowed} onChange={onProductType} />
            <p className="mx-note">Для смены типа станок должен быть выключен и остановлен. Разрешение определяет PLC.</p></section>
          <section><div className="mx-section-heading"><h3><Icon icon={timerIcon} aria-hidden="true" />Оценка времени цикла</h3></div>
            {available ? <CycleSettings key={index} state={state} editable={canCommand} onApply={onCycleSettings} /> : <p className="mx-note">Настройки появятся после восстановления связи.</p>}</section>
        </TabsContent>

        <TabsContent value="diagnostics" className="mx-tab-content">
          <section><div className="mx-section-heading"><h3>Разрешения PLC</h3><span className="mx-tag">{display(`Шаг ${state.plcState}`)}</span></div>
            <div className="mx-permissions">{([['Включение / отключение', state.powerAllowed], ['Сброс аварии станка', state.resetAllowed], ['Ручное управление', state.manualControlAllowed], ['Приём робота', state.canAcceptService]] as const).map(([label, allowed]) => <div key={label} data-allowed={available && allowed}><span>{label}</span><strong><i />{display(allowed ? 'Разрешено' : 'Не разрешено')}</strong></div>)}</div>
            <p className="mx-note">Разрешения отдельных движений — во вкладке «Наладка».</p></section>
          <section><div className="mx-section-heading"><h3>Обратная связь и датчики</h3><span className="mx-tag">{display(`${signals.filter(([, value]) => value).length} / ${signals.length} активны`)}</span></div>
            <div className="mx-signals">{signals.map(([label, value]) => <div key={label} data-active={available && value}><i /><span>{label}</span><b>{display(value ? '1' : '0')}</b></div>)}</div>
            <p className="mx-note">1 — активен, 0 — неактивен. Активный сигнал сам по себе не означает готовность станка.</p></section>
          <section><div className="mx-section-heading"><h3>Активные ошибки</h3><span className="mx-tag" data-alert={available && hasAlarm}>{display(String(state.activeErrors.length))}</span></div>
            {!available ? <p className="mx-note">Данные об ошибках недоступны.</p> : state.activeErrors.length > 0 ? <ul className="mx-error-list">{state.activeErrors.map((error, errorIndex) => <li key={`${errorIndex}-${error}`}>{error}</li>)}</ul>
              : <p className={hasAlarm ? 'mx-warning' : 'mx-positive'}>{hasAlarm ? 'Станок сообщает об аварии; описание не получено.' : 'Активных ошибок нет'}</p>}
            <h4>Последние ошибки</h4>{available && state.lastErrors.length > 0 ? <ul className="mx-history-list">{state.lastErrors.map((error, errorIndex) => <li key={`${errorIndex}-${error}`}>{error}</li>)}</ul> : <p className="mx-note">{available ? 'Нет сохранённых ошибок' : 'Данные недоступны'}</p>}</section>
        </TabsContent>
      </div>
    </Tabs>

    <footer className="mx-footer">
      <div className="mx-power-bar"><button type="button" className={cn(commandButton({ enabled: state.enabled, unavailable: available && !state.powerAllowed }), 'mx-power')}
        disabled={!canCommand} aria-disabled={!canCommand || !state.powerAllowed} onClick={onToggleEnabled}
        data-plc-command={state.disablePending || !state.enabled ? `GVL_HMI.axMachineEnable[${index + 1}]` : `GVL_HMI.axMachineDisable[${index + 1}]`}>
        <Icon icon={powerIcon} aria-hidden="true" />{state.disablePending ? 'Отменить отключение' : state.enabled ? 'Выключить станок' : 'Включить станок'}</button>
        <button type="button" className="mx-button mx-alarm-button" data-alert={available && hasAlarm} onClick={onOpenAlarms}><Icon icon={errorIcon} aria-hidden="true" />Аварии и сброс</button>
      </div>
      <div className="mx-footer-meta"><span className="mx-connection" data-mode={dataMode}><i />{dataMode === 'live' ? 'Связь с PLC' : dataMode === 'offline' ? 'Нет связи с PLC' : 'Локальная модель · без команд в PLC'}</span><span>{editable ? 'Управление станком' : 'Только просмотр'}</span></div>
      {!editable && <p className="mx-access-note">Для управления войдите в аккаунт.</p>}
    </footer>
  </aside>;
}
