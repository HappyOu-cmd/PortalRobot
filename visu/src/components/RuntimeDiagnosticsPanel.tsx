import { useState } from 'react';
import { Icon } from '@iconify/react';
import monitorHeartOutlineIcon from '@iconify-icons/material-symbols/monitor-heart-outline';
import sensorsIcon from '@iconify-icons/material-symbols/sensors';
import { X } from 'lucide-react';
import type { PlcCommand, PlcConnectionInfo, RuntimeDiagnostics } from '../plc/client';
import type { PhysicalIoState } from '../plc/physicalIo';
import { PhysicalIoDiagnostics } from './PhysicalIoDiagnostics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs';
import './runtime-diagnostics.css';

const SERVER_STATES: Record<number, string> = {
  0: 'Работает', 1: 'Ошибка', 2: 'Нет конфигурации', 3: 'Приостановлен',
  4: 'Завершается', 5: 'Тестовый режим', 6: 'Ошибка связи', 7: 'Неизвестно',
};

const dateTime = (value: number | string | null) => {
  if (value === null) return 'Нет данных';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Нет данных'
    : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
};

function Field({ label, value }: { label: string; value: string | number }) {
  return <div className="runtime-diagnostics-field"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function RuntimeDiagnosticsPanel({ diagnostics, connection, physicalIo, ioOnline, canManageIo, onIoCommand, onClose, className }: {
  diagnostics: RuntimeDiagnostics;
  connection: PlcConnectionInfo;
  physicalIo: PhysicalIoState;
  ioOnline: boolean;
  canManageIo: boolean;
  onIoCommand: (command: PlcCommand) => unknown;
  onClose: () => void;
  className?: string;
}) {
  const [section, setSection] = useState('runtime');
  const gatewayAvailable = connection.endpoint !== '' || connection.status === 'degraded' || connection.status === 'connected';
  const transport = gatewayAvailable ? diagnostics.transport : 'offline';
  const applicationMode = transport === 'online' ? diagnostics.application.mode : 'unknown';
  const applicationText = applicationMode === 'running' ? 'Циклы выполняются'
    : applicationMode === 'stalled' ? 'Циклы не выполняются'
      : applicationMode === 'verifying' ? 'Проверяем счётчик'
        : 'Состояние неизвестно';
  const appTone = applicationMode === 'running' ? 'ok' : applicationMode === 'stalled' ? 'alarm' : 'muted';
  const transportText = transport === 'online' ? 'На связи' : transport === 'connecting' ? 'Подключение' : 'Нет связи';
  const server = transport === 'online' ? diagnostics.server : null;

  return <section className={`runtime-diagnostics-panel ${section === 'io' ? 'is-io' : ''} ${className ?? ''}`} aria-label="Диагностика контроллера" onPointerDown={(event) => event.stopPropagation()}>
    <header className="runtime-diagnostics-header">
      <span className="runtime-diagnostics-heading-icon"><Icon icon={monitorHeartOutlineIcon} aria-hidden="true" /></span>
      <div><small>СИСТЕМА · КОНТРОЛЛЕР</small><h2>Диагностика</h2><p>Контроллер, связь и дискретные сигналы ячейки</p></div>
      <button type="button" onClick={onClose} aria-label="Закрыть диагностику" title="Закрыть"><X aria-hidden="true" /></button>
    </header>

    <Tabs value={section} onValueChange={setSection} className="runtime-diagnostics-tabs">
      <TabsList className="runtime-diagnostics-tabs-list" aria-label="Раздел диагностики">
        <TabsTrigger value="runtime"><Icon icon={monitorHeartOutlineIcon} aria-hidden="true" />Контроллер и связь</TabsTrigger>
        <TabsTrigger value="io"><Icon icon={sensorsIcon} aria-hidden="true" />Входы и выходы</TabsTrigger>
      </TabsList>
      <TabsContent value="runtime" className="runtime-diagnostics-tab-content"><div className="runtime-diagnostics-scroll">
      <div className="runtime-diagnostics-status-grid">
        <article className="runtime-diagnostics-status" data-tone={appTone}>
          <span>ПРИЛОЖЕНИЕ PLC</span><strong>{applicationText}</strong>
          <p>{applicationMode === 'stalled'
            ? 'OPC UA отвечает, но счётчик циклов не меняется более 4 секунд. Вероятен STOP приложения или остановка задачи.'
            : applicationMode === 'running'
              ? 'Счётчик обновляется программой PLC_PRG.'
              : applicationMode === 'verifying'
                ? 'Первое значение получено. Ждём изменения счётчика.'
                : 'Нет свежего подтверждения выполнения PLC-программы.'}</p>
        </article>
        <article className="runtime-diagnostics-status" data-tone={transport === 'online' ? 'ok' : 'muted'}>
          <span>СЕРВЕР OPC UA</span><strong>{transportText}</strong>
          <p>Состояние сервера связи не равно режиму RUN/STOP приложения.</p>
        </article>
        <article className="runtime-diagnostics-status" data-tone={connection.status === 'connected' ? 'ok' : connection.status === 'degraded' ? 'warning' : 'muted'}>
          <span>ТЕГИ HMI</span><strong>{connection.status === 'connected' ? 'Подключены' : connection.status === 'degraded' ? 'Частично доступны' : 'Нет данных'}</strong>
          <p>{connection.symbols > 0 ? `${connection.symbols} тегов · отсутствует ${connection.missing.length}` : 'Основной снимок ячейки недоступен.'}</p>
        </article>
      </div>

      <div className="runtime-diagnostics-details">
        <section className="runtime-diagnostics-card">
          <h3>Контроллер и связь</h3>
          <dl>
            <Field label="Устройство" value={server?.productName ?? 'Нет данных'} />
            <Field label="Версия" value={server?.softwareVersion ?? 'Нет данных'} />
            <Field label="OPC UA ServerStatus" value={server ? (SERVER_STATES[server.stateCode] ?? `Код ${server.stateCode}`) : 'Нет данных'} />
            <Field label="Уровень сервиса OPC UA" value={server?.serviceLevel === null || server?.serviceLevel === undefined ? 'Нет данных' : `${server.serviceLevel} / 255`} />
            <Field label="Адрес" value={diagnostics.endpoint || connection.endpoint || 'Нет данных'} />
            <Field label="Запуск OPC UA" value={dateTime(server?.startTime ?? null)} />
            <Field label="Время OPC UA" value={dateTime(server?.currentTime ?? null)} />
          </dl>
        </section>
        <section className="runtime-diagnostics-card">
          <h3>Контроль выполнения программы</h3>
          <dl>
            <Field label="Счётчик PLC_PRG" value={transport === 'online' && diagnostics.application.counter !== null ? diagnostics.application.counter : 'Нет данных'} />
            <Field label="Последнее изменение" value={dateTime(transport === 'online' ? diagnostics.application.lastAdvancedAt : null)} />
            <Field label="Последнее чтение" value={dateTime(transport === 'online' ? diagnostics.application.lastReadAt : null)} />
            <Field label="Последний опрос сервера" value={dateTime(transport === 'online' ? diagnostics.observedAt : null)} />
          </dl>
          <p className="runtime-diagnostics-note">Счётчик взят из существующего <code>GVL_HMI.udiPlcHeartbeat</code>. При STOP программа не обновляет его, поэтому для точного режима и причины остановки проверь в CODESYS PLC Shell команду <code>getprgstat Application</code> и журнал контроллера.</p>
          {(diagnostics.error || (!gatewayAvailable && connection.message)) && <p className="runtime-diagnostics-error">{!gatewayAvailable ? connection.message : diagnostics.error}</p>}
        </section>
      </div>

      </div></TabsContent>
      <TabsContent value="io" className="runtime-diagnostics-tab-content">
        <PhysicalIoDiagnostics data={physicalIo} online={ioOnline && applicationMode === 'running'} canManage={canManageIo} onCommand={onIoCommand} />
      </TabsContent>
    </Tabs>
  </section>;
}
