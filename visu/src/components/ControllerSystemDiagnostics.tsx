import type { ControllerDiagnostics } from '../plc/controllerDiagnostics';

const MISSING = 'Нет данных';
const WEB_STATES = { disabled: 'Не подключена', connecting: 'Подключение', online: 'На связи', offline: 'Нет связи', unauthorized: 'Ошибка авторизации' };
const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
const dateTime = (value: number | null | undefined) => value == null ? MISSING : dateFormatter.format(value);

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="runtime-diagnostics-field"><dt>{label}</dt><dd>{value ?? MISSING}</dd></div>;
}

function ResourceMeter({ label, value }: { label: string; value: number | null | undefined }) {
  return <div className="controller-resource">
    <div><span>{label}</span><strong>{value == null ? MISSING : `${value} %`}</strong></div>
    {value != null && <meter min={0} max={100} value={value} aria-label={label}>{value} %</meter>}
  </div>;
}

export function ControllerSystemDiagnostics({ controller, available }: { controller: ControllerDiagnostics | undefined; available: boolean }) {
  const online = available && controller?.status === 'online';
  const resources = online ? controller.resources : null;
  const identity = available ? controller?.identity.data : null;
  const modules = available ? controller?.modules.data : null;
  const stateText = !available ? 'Нет связи со шлюзом' : controller ? WEB_STATES[controller.status] : 'Не подключена';

  return <>
    <section className="runtime-diagnostics-card">
      <h3>Ресурсы контроллера <small className="controller-web-state" data-online={online}>{stateText}</small></h3>
      <ResourceMeter label="Общая загрузка CPU" value={resources?.cpuLoadPercent} />
      <ResourceMeter label="Использование RAM" value={resources?.memoryUsedPercent} />
      <ResourceMeter label="Использование накопителя (ROM)" value={resources?.storageUsedPercent} />
      <dl>
        <Field label="Температура CPU" value={resources?.temperatureCelsius == null ? null : `${resources.temperatureCelsius} °C`} />
        <Field label="Время работы контроллера" value={resources?.uptime} />
        <Field label="Последний опрос ресурсов" value={dateTime(online ? controller.observedAt : null)} />
      </dl>
      <p className="runtime-diagnostics-note">Веб-сервис сообщает общую загрузку CPU. Отдельная нагрузка каждого ядра недоступна в этом ответе.</p>
      {available && controller?.error && <p className="runtime-diagnostics-error">{controller.error}</p>}
    </section>
    <section className="runtime-diagnostics-card">
      <h3>Коды контроллера и сеть</h3>
      <dl>
        <Field label="Режим выполнения" value={resources?.debugMode == null ? null : resources.debugMode ? 'Debug' : 'Release'} />
        <Field label="Код на индикаторе CPU" value={resources?.led.code} />
        <Field label="Расшифровка состояния" value={resources?.led.message} />
        <Field label="Сеть: передача" value={resources?.networkTxKbPerSecond == null ? null : `${resources.networkTxKbPerSecond} КБ/с`} />
        <Field label="Сеть: приём" value={resources?.networkRxKbPerSecond == null ? null : `${resources.networkRxKbPerSecond} КБ/с`} />
      </dl>
      {resources?.led.normal === false && <p className="runtime-diagnostics-error">Индикатор контроллера: {resources.led.code} · {resources.led.message}</p>}
      <p className="runtime-diagnostics-note">Здесь показан текущий код контроллера. Причину исключения приложения и историю ошибок проверяй в журнале CODESYS.</p>
      {controller?.url && <a className="controller-web-link" href={controller.url} target="_blank" rel="noopener noreferrer">Открыть веб-интерфейс контроллера</a>}
    </section>
    <section className="runtime-diagnostics-card">
      <h3>Паспорт контроллера</h3>
      <dl>
        <Field label="Модель" value={identity?.model} />
        <Field label="Имя устройства" value={identity?.name} />
        <Field label="Серийный номер" value={identity?.serialNumber} />
        <Field label="Производитель" value={identity?.vendor} />
        <Field label="Прошивка контроллера" value={identity?.firmwareVersion} />
        <Field label="Аппаратная версия" value={identity?.hardwareVersion} />
        <Field label="Версия шины" value={identity?.busVersion} />
        <Field label="Версия скоростного I/O" value={identity?.highSpeedIoVersion} />
        <Field label="Сборка прошивки" value={identity?.buildDate} />
        <Field label="Последнее чтение паспорта" value={dateTime(available ? controller?.identity.observedAt : null)} />
      </dl>
      {available && controller?.identity.error && <p className="runtime-diagnostics-error">{controller.identity.error}</p>}
    </section>
    <section className="runtime-diagnostics-card">
      <h3>Модули контроллера</h3>
      {modules == null ? <p className="runtime-diagnostics-note">Нет свежих данных о модулях.</p>
        : modules.length === 0 ? <p className="runtime-diagnostics-note">Контроллер не сообщил о подключённых модулях.</p>
          : <table className="controller-modules-table">
            <thead><tr><th scope="col">Слот</th><th scope="col">Тип</th><th scope="col">Код</th><th scope="col">Состояние</th></tr></thead>
            <tbody>{modules.map((module) => <tr key={module.slot} data-error={module.errorCode != null && module.errorCode !== 0}>
              <td>{module.slot}</td><td>{module.type ?? MISSING}</td><td>{module.errorCode ?? MISSING}</td><td>{module.message}</td>
            </tr>)}</tbody>
          </table>}
      <p className="runtime-diagnostics-note">Слот 0 — встроенный I/O контроллера. Тип и код ошибки переданы производителем.</p>
      <p className="runtime-diagnostics-note">Последнее чтение: {dateTime(available ? controller?.modules.observedAt : null)}</p>
      {available && controller?.modules.error && <p className="runtime-diagnostics-error">{controller.modules.error}</p>}
    </section>
  </>;
}
