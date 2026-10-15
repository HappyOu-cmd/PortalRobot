import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, CheckCircle2, ChevronDown, TriangleAlert, X } from 'lucide-react';
import { geometryReadinessConditions, type GeometryStation } from '../../model/geometryControl';

export function GeometryReadinessMenu({ station, stationId, online }: {
  station: GeometryStation; stationId: number; online: boolean;
}) {
  const [blockingOpen, setBlockingOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(true);
  const conditions = geometryReadinessConditions(station, online);
  const blocking = conditions.filter(condition => !condition.ready);
  const completed = conditions.filter(condition => condition.ready);
  const needsConfirmation = station.recoveryRequired || station.confirmationActive;
  const ready = online && (station.enabled || (station.enableAllowed && !needsConfirmation));
  const summary = !online ? 'Нет связи с контроллером' : station.enabled ? 'ГК включён'
    : !station.enableAllowed ? 'Включение запрещено'
      : needsConfirmation ? 'Требуется подтверждение пустоты' : 'Включение разрешено';
  const groups = [
    { key: 'blocked', title: 'Требуется действие', items: blocking, open: blockingOpen, toggle: () => setBlockingOpen(value => !value) },
    { key: 'ready', title: 'Выполненные условия', items: completed, open: completedOpen, toggle: () => setCompletedOpen(value => !value) },
  ];

  return <>
    <header>
      <div className="geometry-readiness-heading">
        <Dialog.Title asChild><h3>Готовность ГК {stationId} к включению</h3></Dialog.Title>
        <Dialog.Close asChild><button type="button" aria-label="Закрыть условия ГК"><X aria-hidden="true" /></button></Dialog.Close>
      </div>
      <div className={`cell-start-readiness-summary ${ready ? 'ready' : 'blocked'}`}>
        {ready ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
        <div><strong>{summary}</strong><span>{completed.length} из {conditions.length} условий</span></div>
      </div>
    </header>
    {groups.map(group => <section className="cell-readiness-group" key={group.key}>
      <button type="button" aria-expanded={group.open} onClick={group.toggle}>
        <span>{group.title}</span><b>{group.items.length}</b><ChevronDown aria-hidden="true" />
      </button>
      {group.open && <div className="cell-readiness-list">
        {group.key === 'blocked' && group.items.length === 0
          ? <div className="cell-readiness-empty"><CheckCircle2 aria-hidden="true" />Блокирующих условий нет</div>
          : group.items.map(condition => <div className={`cell-readiness-condition ${group.key}`} key={condition.key}>
            {condition.ready ? <CheckCircle2 aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
            <div><strong>{condition.title}</strong><span>{condition.ready ? condition.done : condition.blocked}</span></div>
          </div>)}
      </div>}
    </section>)}
    <p className="geometry-readiness-note">Работа ячейки и движение робота у другого оборудования не мешают включению ГК.</p>
  </>;
}
