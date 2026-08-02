import { AlertTriangle, Bot, Box, Crosshair, DoorOpen, PackageOpen, PackagePlus, LockKeyhole, UnlockKeyhole, Wrench } from 'lucide-react';
import type { CellState, MachineMode, MachineOperation } from '../../model/types';
import { Indicator } from '../ui/Indicator';

const MACHINE_MODE: Record<MachineMode, string> = {
  off: 'ВЫКЛЮЧЕН', enabled: 'ВКЛЮЧЕН', processing: 'ОБРАБОТКА', change: 'ЗАМЕНА', error: 'АВАРИЯ',
};

const MACHINE_OPERATION: Record<MachineOperation, string> = {
  NONE: 'Нет операции', LOAD: 'Загрузка заготовки', UNLOAD: 'Выгрузка детали', CHANGE: 'Замена детали',
};

export interface MachineCardProps {
  index: number;
  state: CellState['machines'][number];
  step: string;
  active: boolean;
  onClick: () => void;
}

export function MachineCard({ index, state, step, active, onClick }: MachineCardProps) {
  const tone = state.mode === 'error' ? 'red' : state.mode === 'processing' ? 'green' : state.mode === 'change' ? 'yellow' : state.mode === 'enabled' ? 'orange' : 'off';
  const progress = state.cycleExpectedS > 0 ? Math.min(100, state.cycleElapsedS / state.cycleExpectedS * 100) : 0;
  const status = state.disablePending ? 'ОТКЛЮЧЕНИЕ' : MACHINE_MODE[state.mode];
  const indicatorTone = tone === 'yellow' || tone === 'orange' ? 'amber' : tone === 'off' ? 'green' : tone;
  const operation = MACHINE_OPERATION[state.recommendedOperation];
  const OperationIcon = state.mode === 'error' ? AlertTriangle
    : state.mode === 'processing' ? Crosshair
      : state.recommendedOperation === 'CHANGE' ? Wrench
        : state.recommendedOperation === 'UNLOAD' ? PackageOpen : PackagePlus;
  const robotStatus = state.canAcceptService ? 'ГОТОВ К ПРИЁМУ' : state.serviceRequired ? 'ТРЕБУЕТСЯ' : 'НЕ ТРЕБУЕТСЯ';

  return (
    <button className={`machine-card tone-${tone} ${active ? 'active' : ''}`} type="button" onClick={onClick} aria-label={`Открыть станок ${index + 1}`}>
      <div className="machine-card-head">
        <div className="machine-number"><span>СТАНОК</span><strong>{index + 1}</strong></div>
        <span className={`mode ${tone}`}><Indicator active={tone !== 'off'} tone={indicatorTone} />{status}</span>
      </div>

      <div className="machine-card-main">
        <div className="machine-art"><OperationIcon /></div>
        <div className={`machine-current-step ${step ? '' : 'empty'}`}>
          <span>ТЕКУЩИЙ ШАГ</span>
          <strong>{step || '\u00A0'}</strong>
          {state.mode === 'processing'
            ? <div className="cycle-compact"><div><span>Цикл обработки</span><b>{state.cycleElapsedS} / {state.cycleExpectedS} с</b></div><i><em style={{ width: `${progress}%` }} /></i></div>
            : <div className="machine-operation"><span>Операция</span><b>{operation}</b></div>}
        </div>
      </div>

      <div className="machine-signals">
        <div><i><DoorOpen /></i><span>ДВЕРЬ</span><b>{state.doorOpen ? 'Открыта' : state.doorClosed ? 'Закрыта' : 'Движение'}</b></div>
        <div><i>{state.chuckClosed ? <LockKeyhole /> : <UnlockKeyhole />}</i><span>ПАТРОН</span><b>{state.chuckOpen ? 'Открыт' : state.chuckClosed ? 'Закрыт' : 'Движение'}</b></div>
        <div><i><Box /></i><span>ИЗДЕЛИЕ</span><b>{state.partState !== 'LOADED' ? state.partState === 'EMPTY' ? 'Пусто' : 'Неизвестно' : state.partType === 'BLANK' ? 'Заготовка' : state.partType === 'DETAIL' ? 'Деталь' : 'Неизвестно'}</b></div>
      </div>
      <div className="machine-card-footer">
        <Bot /><span>РОБОТ:</span><Indicator active={state.canAcceptService || state.serviceRequired} /><b>{robotStatus}</b>
      </div>
    </button>
  );
}
