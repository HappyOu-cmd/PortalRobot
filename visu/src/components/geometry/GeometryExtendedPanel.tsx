import { useState } from 'react';
import { Icon } from '@iconify/react';
import conveyorIcon from '@iconify-icons/material-symbols/conveyor-belt-outline';
import overviewIcon from '@iconify-icons/material-symbols/grid-view-outline';
import sensorsIcon from '@iconify-icons/material-symbols/sensors';
import { CheckCircle2, Power, TriangleAlert, X } from 'lucide-react';
import { createGeometrySnapshot, GEOMETRY_STATES, type GeometrySnapshot } from '../../model/geometryControl';
import { cn } from '../../lib/utils';
import { SegmentedControl } from '../ui/ControlPrimitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { geometryCommand, GeometryCommandButton, GeometryConnectionNotice, GeometryDriveMenu, GeometryDriveSignals, GeometryPartMenu, type GeometryCommand } from './GeometryControlMenus';
import './geometry-control.css';
import './geometry-extended-panel.css';

const EMPTY_GEOMETRY_SNAPSHOT = createGeometrySnapshot();

export function GeometryExtendedPanel({ snapshot = EMPTY_GEOMETRY_SNAPSHOT, selectedStation, onStationChange, online, simulation, onCommand, onRequestState, onOpenAlarms, onClose, className }: {
  snapshot?: GeometrySnapshot; selectedStation: 1 | 2; onStationChange: (station: 1 | 2) => void; online: boolean; simulation: boolean;
  onRequestState: (stationId: 1 | 2) => void;
  onCommand: GeometryCommand; onOpenAlarms: () => void; onClose: () => void; className?: string;
}) {
  const [tab, setTab] = useState('overview');
  const station = snapshot.stations[selectedStation - 1];
  const tone = !online ? 'gray' : station.error ? 'red' : station.state === 5 ? 'amber' : station.ready ? 'green' : station.enabled ? 'blue' : 'gray';
  const send = (action: number) => onCommand(geometryCommand(action, selectedStation));

  return <aside className={cn('side-panel geometry-extended-panel', className)} aria-label="Расширенное управление геометрическим контролем">
    <header className="geometry-extended-header">
      <span className="geometry-extended-icon"><Icon icon={conveyorIcon} aria-hidden="true" /></span>
      <div><p>Расширенное управление</p><h2>ГК {String(selectedStation).padStart(2, '0')}</h2></div>
      <button type="button" onClick={onClose} aria-label="Закрыть расширенное управление ГК"><X /></button>
    </header>
    <SegmentedControl value={String(selectedStation)} className="geometry-extended-stations" thumbFullHeight ariaLabel="Выбор станции ГК"
      options={snapshot.stations.map((item, index) => ({ value: String(index + 1), label: <><span>ГК <b>{index + 1}</b></span><i className={online && item.error ? 'error' : online && item.enabled ? 'enabled' : ''} /></> }))}
      onChange={value => onStationChange(Number(value) as 1 | 2)} />
    <div className="geometry-extended-state" data-tone={tone}><span><i aria-hidden="true" />{online ? GEOMETRY_STATES[station.state] : 'Нет связи с PLC'}</span><small>{simulation ? 'Симуляция' : 'Реальная ячейка'}</small></div>

    <Tabs value={tab} onValueChange={setTab} className="geometry-extended-tabs">
      <TabsList className="geometry-extended-tabs-list" data-active-tab={tab} aria-label="Разделы расширенного управления ГК">
        <TabsTrigger value="overview"><Icon icon={overviewIcon} />Обзор</TabsTrigger>
        <TabsTrigger value="diagnostics"><Icon icon={sensorsIcon} />Диагностика</TabsTrigger>
      </TabsList>
      <div className="geometry-extended-scroll">
        <GeometryConnectionNotice online={online} supported={snapshot.supported} />
        <TabsContent value="overview" className="geometry-extended-tab-content">
          <section className="geometry-extended-section">
            <header><h3>Станция контроля</h3><span>{station.configured ? 'Точка настроена' : 'Точка не настроена'}</span></header>
            {!station.configured && <p className="geometry-menu-note">Базовую точку, SAFE_Z и скорость ГК задайте в разделе «Точки» расширенного управления роботом.</p>}
            <div className="geometry-extended-metric"><span>Уложено деталей на ГК {selectedStation}</span><b>{online ? station.produced.toLocaleString('ru-RU') : '—'}</b></div>
            <GeometryCommandButton online={online} allowed={station.recoveryRequired || (station.enabled ? station.disableAllowed : station.enableAllowed)}
              onClick={() => station.recoveryRequired ? onRequestState(selectedStation) : send(station.enabled ? 2 : 1)} className="geometry-extended-power">{station.recoveryRequired ? <CheckCircle2 /> : <Power />}{station.recoveryRequired ? 'Указать состояние ГК' : station.enabled ? 'Выключить ГК' : 'Включить ГК'}</GeometryCommandButton>
          </section>
          <section className="geometry-extended-section"><header><h3>Конвейер</h3></header>
            <GeometryDriveMenu station={station} stationId={selectedStation} online={online} onCommand={onCommand} />
          </section>
          <section className="geometry-extended-section"><header><h3>Деталь на контроле</h3></header>
            <GeometryPartMenu station={station} stationId={selectedStation} online={online} simulation={simulation} onCommand={onCommand} />
          </section>
        </TabsContent>
        <TabsContent value="diagnostics" className="geometry-extended-tab-content">
          <section className="geometry-extended-section"><header><h3>Обратная связь</h3></header><GeometryDriveSignals station={station} online={online} />
            <div className="geometry-feedback-row"><span>Сброс аварии</span><strong>{!online ? 'Нет данных' : station.resetBusy ? 'Импульс активен' : 'Ожидание команды'}</strong></div>
            <button className="geometry-text-button" type="button" onClick={onOpenAlarms}>Открыть журнал аварий</button>
          </section>
          <section className="geometry-extended-section"><header><h3>Допуски управления</h3></header>
            {([['Пуск вручную', station.manualStartAllowed], ['Подтверждение пустоты', station.confirmAllowed]] as const).map(([label, allowed]) => <div key={label} className="geometry-feedback-row"><span>{label}</span><strong>{!online ? 'Нет данных' : allowed ? 'Разрешено' : 'Запрещено'}</strong></div>)}
          </section>
          {simulation && <section className="geometry-extended-section"><header><h3><TriangleAlert />Симуляция аварии привода</h3></header>
            <div className="geometry-simulation-actions"><GeometryCommandButton online={online} allowed={station.simulationAlarmAllowed} onClick={() => send(14)}>Имитировать аварию</GeometryCommandButton>
              <GeometryCommandButton online={online} allowed={station.simulationAlarmAllowed} onClick={() => send(15)}>Убрать причину аварии</GeometryCommandButton></div>
            <p className="geometry-menu-note">После снятия причины нажмите общий сброс аварий в журнале событий.</p>
          </section>}
        </TabsContent>
      </div>
    </Tabs>
  </aside>;
}
