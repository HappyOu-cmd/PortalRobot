import { useEffect, useId, useState } from 'react';
import { cva } from 'class-variance-authority';
import { Icon } from '@iconify/react';
import expandLessRoundedIcon from '@iconify-icons/material-symbols/expand-less-rounded';
import expandMoreRoundedIcon from '@iconify-icons/material-symbols/expand-more-rounded';
import northEastRoundedIcon from '@iconify-icons/material-symbols/north-east-rounded';
import { cn } from '../../lib/utils';
import { GEOMETRY_CALL_STATES, GEOMETRY_REASONS, geometryOverviewStatus, geometryPartPosition, type GeometryPartPosition, type GeometrySnapshot } from '../../model/geometryControl';
import { geometryCommand, type GeometryCommand } from './GeometryControlMenus';
import './geometry-overview.css';

const POSITION_LABELS: Record<GeometryPartPosition, string> = {
  empty: 'На ленте нет детали',
  placed: 'Робот установил деталь',
  conveying: 'Деталь движется по ленте',
  operator: 'Деталь у оператора',
  unknown: 'Положение не подтверждено',
};
const BELT_STEPS = ['placed', 'conveying', 'operator'] as const;
const EXPANDED_STORAGE_KEY = 'portal-robot.geometry-overview-expanded';
const callButton = cva('geometry-overview__call', {
  variants: {
    called: { true: 'geometry-overview__call--called', false: '' },
    cancel: { true: 'geometry-overview__call--cancel', false: '' },
  },
});

export function GeometryOverviewCard({ snapshot, online, onCommand, onStationSelect }: {
  snapshot?: GeometrySnapshot;
  online: boolean;
  onCommand: GeometryCommand;
  onStationSelect: (stationId: 1 | 2) => void;
}) {
  const bodyId = useId();
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(EXPANDED_STORAGE_KEY) !== 'false'; }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(EXPANDED_STORAGE_KEY, String(expanded)); }
    catch { /* Без хранилища выбор сохраняется в состоянии компонента. */ }
  }, [expanded]);
  const current = online && !!snapshot?.available;
  const available = current && !!snapshot?.supported;

  return <section className="geometry-overview" aria-label="Геометрический контроль: детали и вызовы" data-interactive>
    <header className="geometry-overview__header">
      <h2>Геометрический контроль</h2>
      <button className="geometry-overview__toggle" type="button" aria-expanded={expanded} aria-controls={bodyId}
        aria-label={expanded ? 'Свернуть панель ГК' : 'Развернуть панель ГК'}
        title={expanded ? 'Свернуть панель ГК' : 'Развернуть панель ГК'} onClick={() => setExpanded(value => !value)}>
        <Icon icon={expanded ? expandLessRoundedIcon : expandMoreRoundedIcon} aria-hidden="true" />
      </button>
    </header>
    <div id={bodyId} className="geometry-overview__reveal" aria-hidden={!expanded}>
    <div className="geometry-overview__body">
    <div className="geometry-overview__stations">
      {([1, 2] as const).map(stationId => {
        const station = snapshot?.stations[stationId - 1];
        const status = geometryOverviewStatus(snapshot, stationId - 1, online);
        const position = geometryPartPosition(station, available);
        const positionLabel = !available ? status.text : position === 'conveying' && !station?.running
          ? 'Деталь на ленте · остановлена' : POSITION_LABELS[position];
        const part = available && station?.partStored
          ? [station.partId ? `№ ${station.partId}` : '', station.productType ? `Тип ${station.productType}` : '', station.machine ? `Станок ${station.machine}` : ''].filter(Boolean).join(' · ')
          : '';
        const detail = !available ? 'Нет актуальных данных' : part || (position === 'empty' ? 'Детали нет' : 'Проверьте состояние ленты');

        return <button key={stationId} className="geometry-overview__station" type="button" disabled={!expanded}
          onClick={() => onStationSelect(stationId)} title={`Открыть управление ГК ${stationId}`}
          aria-label={`Открыть управление ГК ${stationId}: ${status.text}. ${detail}. ${positionLabel}`}>
          <span className="geometry-overview__station-heading">
            <strong>ГК {stationId}</strong>
            <span className={cn('geometry-overview__status', `tone-${status.tone}`)} title={status.text}><i aria-hidden="true" />{status.text}</span>
          </span>
          <span className="geometry-overview__part" title={detail}>{detail}</span>
          <span className="geometry-overview__belt" data-position={position} aria-hidden="true">
            {BELT_STEPS.map(step => <i key={step} className={position === step ? 'has-part' : undefined} />)}
          </span>
          <span className="geometry-overview__position" data-position={position} title={positionLabel}>{positionLabel}</span>
        </button>;
      })}
    </div>
    <div className="geometry-overview__calls">
      <span className="geometry-overview__calls-label">Вызов деталей со станков</span>
      <div className="geometry-overview__call-row">
        {[1, 2, 3].map(machine => {
          const call = snapshot?.calls[machine - 1];
          const called = current && !!call && call.state >= 1 && call.state <= 3;
          const canCancel = current && !!snapshot?.cancelAllowed[machine - 1];
          const allowed = canCancel || (current && !!snapshot?.callAllowed[machine - 1]);
          const callState = call ? GEOMETRY_CALL_STATES[call.state] : '';
          const reason = current && call?.reason ? GEOMETRY_REASONS[call.reason] : '';
          const title = !current ? 'Нет актуальных данных PLC' : canCancel
            ? `Отменить вызов детали со станка ${machine}${call?.id ? ` · № ${call.id}` : ''}` : called
            ? [callState, call?.id ? `№ ${call.id}` : '', reason].filter(Boolean).join(' · ')
            : `Вызвать следующую готовую деталь со станка ${machine}`;

          return <button key={machine} className={cn(callButton({ called, cancel: canCancel }), !allowed && 'command-unavailable')}
            type="button" disabled={!expanded || !current} aria-disabled={!expanded || !allowed} title={title}
            aria-label={`${canCancel ? 'Отменить вызов детали' : 'Вызвать деталь'} со станка ${machine}${called ? `: ${callState}` : ''}`}
            onClick={() => onCommand(geometryCommand(canCancel ? 12 : 8, 0, machine))}>
            <span>Станок {machine}</span>
            {canCancel ? <small>Отменить</small> : called ? <small>Вызвана</small> : <Icon icon={northEastRoundedIcon} aria-hidden="true" />}
          </button>;
        })}
      </div>
    </div>
    </div>
    </div>
  </section>;
}
