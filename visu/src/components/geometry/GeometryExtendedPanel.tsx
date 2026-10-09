import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Icon } from '@iconify/react';
import conveyorIcon from '@iconify-icons/material-symbols/conveyor-belt-outline';
import overviewIcon from '@iconify-icons/material-symbols/grid-view-outline';
import settingsIcon from '@iconify-icons/material-symbols/settings-outline';
import sensorsIcon from '@iconify-icons/material-symbols/sensors';
import { CheckCircle2, MapPin, Power, Save, TriangleAlert, X } from 'lucide-react';
import { createGeometrySnapshot, GEOMETRY_STATES, type GeometryConfig, type GeometrySnapshot } from '../../model/geometryControl';
import type { PlcPointEditorCommand, PlcPointEditorReply } from '../../plc/pointEditorRequests';
import { cn } from '../../lib/utils';
import { SegmentedControl } from '../ui/ControlPrimitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { geometryCommand, GeometryCommandButton, GeometryConnectionNotice, GeometryDriveMenu, GeometryDriveSignals, GeometryPartMenu, type GeometryCommand } from './GeometryControlMenus';
import './geometry-control.css';
import './geometry-extended-panel.css';

const EMPTY_GEOMETRY_SNAPSHOT = createGeometrySnapshot();

function ConfigField({ name, label, draft, setDraft, online, min, max, step = 1 }: {
  name: keyof Omit<GeometryConfig, 'configured'>; label: string; draft: GeometryConfig;
  setDraft: Dispatch<SetStateAction<GeometryConfig>>; online: boolean; min?: number; max?: number; step?: number;
}) {
  return <label className="geometry-config-field"><span>{label}</span><input type="number" disabled={!online} min={min} max={max} step={step}
    value={draft[name]} onChange={event => { const value = Number(event.target.value); setDraft(current => ({ ...current, [name]: value })); }} /></label>;
}

export function GeometryExtendedPanel({ snapshot = EMPTY_GEOMETRY_SNAPSHOT, selectedStation, onStationChange, online, simulation, captureAllowed, onPointCommand, onCommand, onRequestState, onOpenAlarms, onClose, className }: {
  snapshot?: GeometrySnapshot; selectedStation: 1 | 2; onStationChange: (station: 1 | 2) => void; online: boolean; simulation: boolean;
  captureAllowed: boolean; onRequestState: (stationId: 1 | 2) => void;
  onPointCommand: (command: PlcPointEditorCommand) => Promise<PlcPointEditorReply>;
  onCommand: GeometryCommand; onOpenAlarms: () => void; onClose: () => void; className?: string;
}) {
  const [tab, setTab] = useState('overview');
  const station = snapshot.stations[selectedStation - 1];
  const [draft, setDraft] = useState(station.config);
  const [pointPending, setPointPending] = useState(false);
  const [pointMessage, setPointMessage] = useState('');
  const pointBusyRef = useRef(false);
  const draftOwnedRef = useRef(false);
  const stationRef = useRef(selectedStation);
  const mountedRef = useRef(true);
  stationRef.current = selectedStation;
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    draftOwnedRef.current = false;
    setDraft(station.config);
    setPointMessage('');
  }, [selectedStation]);
  useEffect(() => {
    if (!draftOwnedRef.current && !pointBusyRef.current) setDraft(station.config);
  }, [station.config.x, station.config.y, station.config.z, station.config.safeZ, station.config.changeZ, station.config.speedFactor]);
  const tone = !online ? 'gray' : station.error ? 'red' : station.state === 5 ? 'amber' : station.ready ? 'green' : station.enabled ? 'blue' : 'gray';
  const send = (action: number) => onCommand(geometryCommand(action, selectedStation));
  const changeDraft: Dispatch<SetStateAction<GeometryConfig>> = value => {
    draftOwnedRef.current = true;
    setDraft(value);
    setPointMessage('');
  };
  const fieldProps = { draft, setDraft: changeDraft, online: online && !pointPending };
  const performPoint = async (action: 'capture' | 'save') => {
    if (pointBusyRef.current || !online) return;
    pointBusyRef.current = true;
    draftOwnedRef.current = true;
    setPointPending(true);
    setPointMessage('Ожидание подтверждённого результата PLC…');
    try {
      const reply = await onPointCommand({
        command: action === 'capture' ? 'robot.point.capture' : 'robot.point.save',
        index: selectedStation + 12,
        draft: { x: draft.x, y: draft.y, z: draft.z, magazineSafeZ: draft.safeZ,
          magazineChangeZ: 0, speedFactor: draft.speedFactor },
      });
      if (!mountedRef.current || stationRef.current !== selectedStation) return;
      if (action === 'capture') {
        setDraft(current => ({ ...current, x: reply.point.x, y: reply.point.y, z: reply.point.z }));
        setPointMessage('XYZ зафиксированы PLC. Для записи нажмите «Сохранить точку и высоты».');
      } else {
        setDraft({ configured: reply.point.configured, x: reply.point.x, y: reply.point.y, z: reply.point.z,
          safeZ: reply.point.magazineSafeZ, changeZ: reply.point.magazineSafeZ, speedFactor: reply.point.speedFactor });
        setPointMessage('Точка и высоты сохранены и подтверждены PLC.');
      }
    } catch (error) {
      if (mountedRef.current && stationRef.current === selectedStation) setPointMessage(error instanceof Error ? error.message : 'PLC не подтвердил команду.');
    } finally {
      pointBusyRef.current = false;
      if (mountedRef.current) setPointPending(false);
    }
  };

  return <aside className={cn('side-panel geometry-extended-panel', className)} aria-label="Расширенное управление геометрическим контролем">
    <header className="geometry-extended-header">
      <span className="geometry-extended-icon"><Icon icon={conveyorIcon} aria-hidden="true" /></span>
      <div><p>Расширенное управление</p><h2>ГК {String(selectedStation).padStart(2, '0')}</h2></div>
      <button type="button" onClick={onClose} aria-label="Закрыть расширенное управление ГК"><X /></button>
    </header>
    <SegmentedControl value={String(selectedStation)} className="geometry-extended-stations" thumbFullHeight ariaLabel="Выбор станции ГК"
      options={snapshot.stations.map((item, index) => ({ value: String(index + 1), label: <><span>ГК <b>{index + 1}</b></span><i className={online && item.error ? 'error' : online && item.enabled ? 'enabled' : ''} /></> }))}
      onChange={value => { if (!pointBusyRef.current) onStationChange(Number(value) as 1 | 2); }} />
    <div className="geometry-extended-state" data-tone={tone}><span><i aria-hidden="true" />{online ? GEOMETRY_STATES[station.state] : 'Нет связи с PLC'}</span><small>{simulation ? 'Симуляция' : 'Реальная ячейка'}</small></div>

    <Tabs value={tab} onValueChange={setTab} className="geometry-extended-tabs">
      <TabsList className="geometry-extended-tabs-list" data-active-tab={tab} aria-label="Разделы расширенного управления ГК">
        <TabsTrigger value="overview"><Icon icon={overviewIcon} />Обзор</TabsTrigger>
        <TabsTrigger value="setup"><Icon icon={settingsIcon} />Наладка</TabsTrigger>
        <TabsTrigger value="diagnostics"><Icon icon={sensorsIcon} />Диагностика</TabsTrigger>
      </TabsList>
      <div className="geometry-extended-scroll">
        <GeometryConnectionNotice online={online} supported={snapshot.supported} />
        <TabsContent value="overview" className="geometry-extended-tab-content">
          <section className="geometry-extended-section">
            <header><h3>Станция контроля</h3><span>{station.configured ? 'Точка настроена' : 'Точка не настроена'}</span></header>
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
        <TabsContent value="setup" className="geometry-extended-tab-content">
          <section className="geometry-extended-section"><header><h3><MapPin />ГК {selectedStation} — базовая точка</h3></header>
            <div className="geometry-config-coordinates"><ConfigField {...fieldProps} name="x" label="X, мм" /><ConfigField {...fieldProps} name="y" label="Y, мм" /><ConfigField {...fieldProps} name="z" label="Z, мм" /></div>
            <GeometryCommandButton online={online && !pointPending} allowed={captureAllowed} className="geometry-config-capture"
              onClick={() => void performPoint('capture')}><MapPin />Взять текущие XYZ</GeometryCommandButton>
          </section>
          <section className="geometry-extended-section"><header><h3>Безопасный подход</h3></header>
            <div className="geometry-config-heights"><ConfigField {...fieldProps} name="safeZ" label="SAFE_Z, смещение мм" /></div>
            <p className="geometry-menu-note">Отрицательное смещение поднимает робот. Маршрут: SAFE_Z → базовая точка → разжим захвата → SAFE_Z.</p>
            <ConfigField {...fieldProps} name="speedFactor" label="Коэффициент скорости" min={0.1} max={1} step={0.1} />
          </section>
          <div className="geometry-config-save"><GeometryCommandButton online={online && !pointPending} allowed={station.pointWriteAllowed} variant="primary"
            onClick={() => void performPoint('save')}><Save />Сохранить точку и высоты</GeometryCommandButton>
            <p className="geometry-menu-note">Редактирование и запись не зависят от режима, блокировок и состояния ГК. PLC проверяет координаты, SAFE_Z и скорость. Настройки реальной ячейки и симуляции сохраняются отдельно.</p>
            {pointMessage && <p className="geometry-menu-note" role="status">{pointMessage}</p>}
          </div>
        </TabsContent>
        <TabsContent value="diagnostics" className="geometry-extended-tab-content">
          <section className="geometry-extended-section"><header><h3>Обратная связь</h3></header><GeometryDriveSignals station={station} online={online} />
            <div className="geometry-feedback-row"><span>Сброс аварии</span><strong>{!online ? 'Нет данных' : station.resetBusy ? 'Импульс активен' : 'Ожидание команды'}</strong></div>
            <button className="geometry-text-button" type="button" onClick={onOpenAlarms}>Открыть журнал аварий</button>
          </section>
          <section className="geometry-extended-section"><header><h3>Допуски управления</h3></header>
            {([['Пуск вручную', station.manualStartAllowed], ['Настройка точки', station.pointWriteAllowed], ['Подтверждение пустоты', station.confirmAllowed]] as const).map(([label, allowed]) => <div key={label} className="geometry-feedback-row"><span>{label}</span><strong>{!online ? 'Нет данных' : allowed ? 'Разрешено' : 'Запрещено'}</strong></div>)}
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
