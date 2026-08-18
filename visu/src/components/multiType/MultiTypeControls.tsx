import { useEffect, useState } from 'react';
import { Boxes, CheckCircle2, ChevronRight, Clock3, EthernetPort, MapPin, TriangleAlert } from 'lucide-react';
import type { ProductType } from '../../model/types';
import type { PlcCellSettings, PlcRobotModbusInfo, PlcTestEnvironmentInfo } from '../../plc/client';

const TEST_ENVIRONMENT_LABELS = ['Обычная ячейка', 'Симуляция', 'Стенд SC-500'];
const TEST_REJECT_REASONS = [
	'',
	'оборудование или цикл ещё заняты',
	'неизвестная тестовая среда',
	'для стенда нужны Modbus и физический ключ',
	'PLC не видит признак Python-симулятора',
	'FAST разрешён только в остановленной симуляции',
];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  1: 'Тип 1',
  2: 'Тип 2',
  3: 'Тип 3',
};

export function ProductTypeSelector({ value, count, disabled, onChange, label }: {
  value: ProductType;
  count: number;
  disabled?: boolean;
  onChange: (value: ProductType) => void;
  label?: string;
}) {
  const types = ([1, 2, 3] as ProductType[]).slice(0, Math.max(1, Math.min(3, count)));
  return <div className="product-type-control">
    {label && <span>{label}</span>}
    <div className={`product-type-selector count-${types.length}`} role="group" aria-label={label ?? 'Тип заготовки'}>
      {types.map((type) => <button
        key={type}
        type="button"
        className={`product-type-${type} ${value === type ? 'active' : ''}`}
        disabled={disabled}
        aria-pressed={value === type}
        onClick={() => onChange(type)}
      ><i />{PRODUCT_TYPE_LABELS[type]}</button>)}
    </div>
  </div>;
}

export function ProductTypeBadge({ type }: { type: ProductType }) {
  return <span className={`product-type-badge product-type-${type}`}><i />{PRODUCT_TYPE_LABELS[type]}</span>;
}

function CellSettingField({ label, value, unit, min, max, step, disabled, onChange }: {
	label: string;
	value: number;
	unit: string;
	min: number;
	max: number;
	step: number;
	disabled: boolean;
	onChange: (value: number) => void;
}) {
	const [draft, setDraft] = useState(String(value));
	const [editing, setEditing] = useState(false);
	useEffect(() => {
		if (!editing) setDraft(String(value));
	}, [editing, value]);
	const commit = () => {
		setEditing(false);
		const numeric = Number(draft);
		if (!Number.isFinite(numeric)) {
			setDraft(String(value));
			return;
		}
		const bounded = Math.max(min, Math.min(max, numeric));
		setDraft(String(bounded));
		onChange(bounded);
	};
	return <label className="cell-setting-field">
		<span>{label}</span>
		<div><input
			type="number"
			value={draft}
			min={min}
			max={max}
			step={step}
			disabled={disabled}
			onFocus={() => setEditing(true)}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur();
			}}
		/><em>{unit}</em></div>
	</label>;
}

export function CellSettingsPanel({ online, modbusMode, modbus, testEnvironment, configurationValid, typeCount, typeCountAllowed, magazineConfigAllowed, settings, accelerationEnabled, accelerationActive, accelerationAllowed, onModeChange, onTestEnvironmentChange, onTypeCountChange, onAutoDistribute, onModbusSettingChange, onModbusApply, onSettingChange, onAccelerationChange, onClose, className }: {
	online: boolean;
	modbusMode: boolean;
	modbus: PlcRobotModbusInfo;
	testEnvironment: PlcTestEnvironmentInfo;
	configurationValid: boolean;
	typeCount: number;
	typeCountAllowed: boolean;
	magazineConfigAllowed: boolean;
	settings: PlcCellSettings;
	accelerationEnabled: boolean;
	accelerationActive: boolean;
	accelerationAllowed: boolean;
	onModeChange: (modbus: boolean) => void;
	onTestEnvironmentChange: (environment: number) => void;
	onTypeCountChange: (count: number) => void;
	onAutoDistribute: () => void;
	onModbusSettingChange: (command: string, value: number) => void;
	onModbusApply: () => void;
	onSettingChange: (command: string, value: number) => void;
	onAccelerationChange: (enabled: boolean) => void;
	onClose: () => void;
	className?: string;
}) {
	const editable = online && settings.changeAllowed;
	const modbusEditable = online && modbus.settingsChangeAllowed;
	const [timeoutsOpen, setTimeoutsOpen] = useState(true);
	const field = (label: string, command: string, value: number, unit: string, min: number, max: number, step: number, enabled = editable) => <CellSettingField
		key={command}
		label={label}
		value={value}
		unit={unit}
		min={min}
		max={max}
		step={step}
		disabled={!enabled}
		onChange={(next) => command.startsWith('robot.modbus.')
			? onModbusSettingChange(command, next)
			: onSettingChange(command, next)}
	/>;

	return <aside className={`side-panel cell-settings-panel ${className ?? ''}`}>
		<div className="panel-heading"><div><span>ИНЖЕНЕРНЫЕ ПАРАМЕТРЫ</span><h2>Настройки ячейки</h2></div><button onClick={onClose} title="Закрыть"><ChevronRight /></button></div>
		<section className="cell-config-section test-environment-settings">
			<div className="cell-config-title"><Boxes /><div><h3>Среда выполнения</h3><p>Не зависит от выбора SoftMotion / Modbus TCP и не сохраняется после перезапуска PLC.</p></div></div>
			<div className="robot-mode-selector three" role="group" aria-label="Тестовая среда">
				{TEST_ENVIRONMENT_LABELS.map((label, value) => <button key={label} type="button" className={testEnvironment.applied === value ? 'active' : ''} disabled={!online || !testEnvironment.changeAllowed || testEnvironment.applied === value} onClick={() => onTestEnvironmentChange(value)}>{label}</button>)}
			</div>
			<p className="panel-note">Запрошено: {TEST_ENVIRONMENT_LABELS[testEnvironment.requested] ?? `код ${testEnvironment.requested}`}; применено: {TEST_ENVIRONMENT_LABELS[testEnvironment.applied] ?? `код ${testEnvironment.applied}`}. Python: {testEnvironment.simulatorActive ? 'опознан' : 'нет'}; ключ стенда: {testEnvironment.benchKey ? 'включён' : testEnvironment.benchKeyLost ? 'потерян' : 'выключен'}.</p>
			{testEnvironment.rejectReason > 0 && <p className="panel-note warning">PLC отклонил переключение: {TEST_REJECT_REASONS[testEnvironment.rejectReason] ?? `код ${testEnvironment.rejectReason}`}.</p>}
		</section>
		<section className="cell-config-section robot-interface-settings">
			<div className="cell-config-title"><EthernetPort /><div><h3>Источник управления роботом</h3><p>PLC применяет режим только после проверки остановки и состояния приводов.</p></div></div>
			<div className="robot-mode-selector" role="group" aria-label="Источник управления роботом">
				<button type="button" className={!modbusMode ? 'active' : ''} disabled={!online || !modbus.modeChangeAllowed || !modbusMode} onClick={() => onModeChange(false)}>SoftMotion</button>
				<button type="button" className={modbusMode ? 'active' : ''} disabled={!online || !modbus.modeChangeAllowed || modbusMode} onClick={() => onModeChange(true)}>Modbus TCP</button>
			</div>
			<p className="panel-note">Запрошено: {modbus.requestedMode === 1 ? 'Modbus TCP' : 'SoftMotion'}; применено: {modbusMode ? 'Modbus TCP' : 'SoftMotion'}.</p>
			<p className={`cell-settings-access ${modbus.modeChangeAllowed ? 'allowed' : ''}`}>{!online ? 'Нет связи с PLC.' : modbus.modeChangeAllowed ? 'Переключение разрешено PLC.' : 'Для переключения остановите ячейку, робот и технологические операции.'}</p>
			<div className="cell-settings-grid modbus-grid">
				{modbus.ip.map((value, index) => field(`IP октет ${index + 1}`, `robot.modbus.ip${index + 1}`, value, '', index === 0 ? 1 : 0, index === 0 ? 223 : 255, 1, modbusEditable))}
				{field('TCP-порт', 'robot.modbus.port', modbus.port, '', 1, 65535, 1, modbusEditable)}
				{field('Unit ID', 'robot.modbus.unitId', modbus.unitId, '', 0, 255, 1, modbusEditable)}
				{field('Таймаут ответа', 'robot.modbus.responseTimeout', modbus.responseTimeoutMs, 'мс', 50, 10000, 10, modbusEditable)}
				{field('Период опроса', 'robot.modbus.pollInterval', modbus.pollIntervalMs, 'мс', 10, 5000, 10, modbusEditable)}
				{field('Таймаут heartbeat', 'robot.modbus.heartbeatTimeout', modbus.heartbeatTimeoutMs, 'мс', 500, 30000, 100, modbusEditable)}
			</div>
			<button className="modbus-apply-button" type="button" disabled={!online || !modbus.settingsChangeAllowed} onClick={onModbusApply}>Применить соединение</button>
			<div className="modbus-status-grid">
				{[
					['TCP', modbus.connected], ['Обмен', modbus.communicationAlive], ['Контроллер', modbus.controllerOn],
					['Auto', modbus.automaticMode], ['Remote', modbus.remoteEnabled], ['Приводы', modbus.drivesEnabled],
					['Homed', modbus.homed], ['Координаты', modbus.positionValid], ['Ready', modbus.ready],
				].map(([label, value]) => <span key={String(label)} className={value ? 'ready' : ''}><i />{String(label)}</span>)}
				<span className={modbus.emergencyStop ? 'fault' : ''}><i />E-Stop</span>
				<span className={modbus.robotAlarm ? 'fault' : ''}><i />Alarm {modbus.alarmCode || ''}</span>
			</div>
			{(modbus.transportError > 0 || modbus.resultCode > 0) && <p className="panel-note warning">Ошибка транспорта: {modbus.transportError}; результат команды: {modbus.resultCode}.</p>}
		</section>
		<section className="cell-config-section">
			<div className="cell-config-title"><MapPin /><div><h3>Точка HOME_SAFETY</h3><p>Безопасная позиция повторного запуска и допустимый диапазон вокруг неё.</p></div></div>
			<div className="cell-settings-grid">
				{field('Координата X', 'cell.settings.safetyHomeX', settings.safetyHome.x, 'мм', -100000, 100000, 0.1)}
				{field('Координата Y', 'cell.settings.safetyHomeY', settings.safetyHome.y, 'мм', -100000, 100000, 0.1)}
				{field('Координата Z', 'cell.settings.safetyHomeZ', settings.safetyHome.z, 'мм', -100000, 100000, 0.1)}
				{field('Коэффициент скорости', 'cell.settings.safetyHomeSpeed', settings.safetyHome.speedFactor, '×', 0.11, 1, 0.01)}
				{field('Допуск X', 'cell.settings.safetyHomeToleranceX', settings.safetyHome.toleranceX, 'мм', 0.1, 1000, 0.1)}
				{field('Допуск Y', 'cell.settings.safetyHomeToleranceY', settings.safetyHome.toleranceY, 'мм', 0.1, 1000, 0.1)}
				{field('Допуск Z', 'cell.settings.safetyHomeToleranceZ', settings.safetyHome.toleranceZ, 'мм', 0.1, 1000, 0.1)}
			</div>
			<p className={`cell-settings-access ${editable ? 'allowed' : ''}`}>{editable ? 'Изменение разрешено PLC.' : !online ? 'Нет связи с PLC.' : 'Для изменения остановите ячейку и все движения, снимите активные ошибки.'}</p>
		</section>
		<details className="cell-settings-disclosure" open={timeoutsOpen} onToggle={(event) => setTimeoutsOpen(event.currentTarget.open)}>
			<summary><Clock3 /><div><strong>TIMEOUT технологических ошибок</strong><span>Предельное ожидание подтверждений, 1–600 секунд</span></div><ChevronRight /></summary>
			<div className="cell-settings-grid timeout-grid">
				{field('Движение робота', 'cell.settings.timeoutRobotMove', settings.timeouts.robotMove, 'с', 1, 600, 1)}
				{field('Действие захвата', 'cell.settings.timeoutRobotAction', settings.timeouts.robotAction, 'с', 1, 600, 1)}
				{field('Освобождение интерфейса', 'cell.settings.timeoutRobotRelease', settings.timeouts.robotRelease, 'с', 1, 600, 1)}
				{field('Открытие двери', 'cell.settings.timeoutDoorOpen', settings.timeouts.doorOpen, 'с', 1, 600, 1)}
				{field('Закрытие двери', 'cell.settings.timeoutDoorClose', settings.timeouts.doorClose, 'с', 1, 600, 1)}
				{field('Разжим патрона', 'cell.settings.timeoutChuckOpen', settings.timeouts.chuckOpen, 'с', 1, 600, 1)}
				{field('Зажим патрона', 'cell.settings.timeoutChuckClose', settings.timeouts.chuckClose, 'с', 1, 600, 1)}
				{field('Подтверждение цикла', 'cell.settings.timeoutCycleStart', settings.timeouts.cycleStart, 'с', 1, 600, 1)}
			</div>
		</details>
		<div className="multi-type-mode-banner enabled">
			<Boxes />
			<div><strong>Универсальный диспетчер</strong><span>Единая маршрутизация для одного, двух или трёх типов</span></div>
		</div>
		<section className="cell-config-section product-type-count-settings">
			<div className="cell-config-title"><Boxes /><div><h3>Типы изделий на ячейке</h3><p>Количество активных типов и начальное распределение 120 слотов магазина.</p></div></div>
			<div className="robot-mode-selector three" role="group" aria-label="Количество типов изделий">
				{[1, 2, 3].map((count) => <button key={count} type="button" className={`${typeCount === count ? 'active' : ''} ${typeCountAllowed ? '' : 'command-unavailable'}`} disabled={!online || typeCount === count} aria-disabled={!typeCountAllowed} onClick={() => onTypeCountChange(count)}>{count} {count === 1 ? 'тип' : count < 5 ? 'типа' : 'типов'}</button>)}
			</div>
			<button className={`modbus-apply-button ${magazineConfigAllowed ? '' : 'command-unavailable'}`} type="button" disabled={!online} aria-disabled={!magazineConfigAllowed} onClick={onAutoDistribute}>Распределить слоты автоматически</button>
			<p className={`cell-settings-access ${typeCountAllowed && magazineConfigAllowed ? 'allowed' : ''}`}>{!online ? 'Нет связи с PLC.' : typeCountAllowed && magazineConfigAllowed ? 'Изменение конфигурации разрешено PLC.' : 'Для изменения остановите ячейку и магазины.'}</p>
		</section>
    <section className="multi-type-scope-note">
      <Boxes />
      <div><h3>Область работы</h3><p>Автоматический цикл использует выбранный интерфейс. В Modbus-режиме отдельные оси недоступны, но именованные точки и захваты работают через SC-500.</p></div>
    </section>
		<section className="simulation-acceleration-settings">
			<h3>Ускорение симуляции</h3>
			<label className={`toggle-row ${(!online || modbusMode || !accelerationAllowed) ? 'disabled' : ''}`}>
				<span>Разрешить ускорение</span>
				<input disabled={!online || modbusMode || !accelerationAllowed} type="checkbox" checked={accelerationEnabled} onChange={(event) => onAccelerationChange(event.target.checked)} />
				<i />
			</label>
			<p className="panel-note">Коэффициент ускоряет виртуальные таймеры симуляции. Скорости и ускорения осей робота задаются отдельно в настройках SoftMotion. Переключатель доступен при остановленной ячейке, без движения, ошибок и Modbus.</p>
			<p className={`simulation-acceleration-status ${accelerationActive ? 'active' : ''}`}>{accelerationActive ? 'Ускорение применено к симуляции.' : 'Ускорение выключено.'}</p>
		</section>
		<section className={`multi-type-validation ${configurationValid ? 'valid' : 'invalid'}`}>
			{configurationValid ? <CheckCircle2 /> : <TriangleAlert />}
			<div><h3>{configurationValid ? 'Конфигурация готова' : 'Конфигурация не завершена'}</h3><p>{!online ? 'Нет связи с PLC.' : modbusMode && !modbus.ready ? 'Modbus выбран, ожидается готовность SC-500.' : !configurationValid ? 'Назначьте каждому типу станок и хотя бы один слот.' : 'Проверка выполняется в PLC.'}</p></div>
		</section>
	</aside>;
}
