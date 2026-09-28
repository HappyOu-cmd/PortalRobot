import { useState, useSyncExternalStore } from 'react';
import { MagazineMatrix } from './magazine/MagazineMatrix';
import { twinSignalPattern, type TwinState } from '../model/twoPalletControl';
import type { PalletId, TwoPalletPreviewController } from '../model/twoPalletPreview';
import './two-pallet-preview.css';

export function TwoPalletPreviewControl({ controller, twin, magazineNumber, onFocus, onPalletChange, onSwap, onReset, onSelect, onLockChange, onStopChange }: {
  controller: TwoPalletPreviewController;
  twin: TwinState;
  magazineNumber: number;
  onFocus: () => void;
  onPalletChange: (pallet: PalletId, action: 'fill' | 'clear' | 'slot', slot?: number) => void;
  onSwap: () => void;
  onReset: (pallet: PalletId) => void;
  onSelect: (pallet: PalletId) => void;
  onLockChange: (extended: boolean) => void;
  onStopChange: (extended: boolean) => void;
}) {
  const pose = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [pallet, setPallet] = useState<PalletId>(1);
  const inventory = twin.pallets[pallet - 1];
  const carriagePalletPosition = pose.selected === 1 ? pose.p1 : pose.p2;
  const expected = twinSignalPattern(twin.config, pose.selected);
  const lockOut = twin.manualLockOut ?? expected.lockOut;
  const stopOut = twin.manualStopOut ?? expected.stopOut;
  const couplingReady = lockOut === expected.lockOut && stopOut === expected.stopOut;
  const canMove = !pose.busy && couplingReady && pose.lift <= 0.001 && Math.abs(carriagePalletPosition - pose.carriage) < 0.001;

  return <div className="two-pallet-preview" aria-label={`Локальное управление двухпалетным магазином ${magazineNumber}`}>
    <section>
      <h3>Механизм магазина {magazineNumber}</h3>
      <p className="two-pallet-step" role="status">{pose.label}</p>
      <div className="two-pallet-readouts">
        <div><span>У робота</span><strong>П{pose.p1 > 0.999 ? 1 : pose.p2 > 0.999 ? 2 : '—'}</strong></div>
        <div><span>Каретка</span><strong>{pose.carriage > 0.999 ? 'У робота' : pose.carriage < 0.001 ? 'У оператора' : 'В движении'}</strong></div>
        <div><span>Палета П2</span><strong>{pose.lift > 0.999 ? 'Поднята' : pose.lift < 0.001 ? 'Опущена' : 'В движении'}</strong></div>
        <div><span>Зацеплена</span><strong>П{pose.selected}</strong></div>
      </div>
      <div className="two-pallet-actions">
        <button type="button" onClick={onFocus}>Показать крупно</button>
        <button type="button" disabled={!pose.busy} onClick={() => controller.togglePause()}>{pose.paused ? 'Продолжить' : 'Пауза'}</button>
        <button type="button" onClick={() => onReset(1)}>Исходно: П1 у робота</button>
        <button type="button" onClick={() => onReset(2)}>Исходно: П2 у робота</button>
      </div>
      <label className="two-pallet-speed"><span>Скорость анимации</span><strong>{pose.speed.toFixed(2)}×</strong>
        <input type="range" min="0.25" max="2" step="0.25" value={pose.speed} onChange={(event) => controller.setSpeed(Number(event.target.value))} />
      </label>
    </section>

    <section>
      <h3>Ручное движение палет</h3>
      <div className="two-pallet-actions">
        <button type="button" className="primary" disabled={!pose.canSwap || !couplingReady} onClick={onSwap}>Обменять палеты</button>
        <button type="button" disabled={!pose.busy} onClick={() => controller.stop()}>Стоп движения</button>
      </div>
      <div className="two-pallet-control-group"><strong>Подъём П2</strong><div className="two-pallet-actions">
        <button type="button" disabled={pose.busy || pose.lift <= 0.001} onClick={() => controller.lift(false)}>Опустить</button>
        <button type="button" disabled={!pose.canRaise || pose.lift >= 0.999} onClick={() => controller.lift(true)}>Поднять</button>
      </div></div>
      <div className="two-pallet-control-group"><strong>Каретка и зацепленная палета</strong><div className="two-pallet-actions">
        <button type="button" disabled={!canMove || pose.carriage <= 0.001} onClick={() => controller.move(false)}>К оператору</button>
        <button type="button" disabled={!canMove || pose.carriage >= 0.999} onClick={() => controller.move(true)}>К роботу</button>
      </div></div>
      <div className="two-pallet-control-group"><strong>Замок и фиксатор</strong><div className="two-pallet-actions">
        <button type="button" aria-pressed={pose.selected === 1} disabled={!pose.canSelect || pose.selected === 1} onClick={() => onSelect(1)}>Зацепить П1</button>
        <button type="button" aria-pressed={pose.selected === 2} disabled={!pose.canSelect || pose.selected === 2} onClick={() => onSelect(2)}>Зацепить П2</button>
      </div></div>
      <div className="two-pallet-control-group"><strong>Замок каретки</strong><div className="two-pallet-actions">
        <button type="button" aria-pressed={!lockOut} disabled={pose.busy} onClick={() => onLockChange(false)}>Втянуть</button>
        <button type="button" aria-pressed={lockOut} disabled={pose.busy} onClick={() => onLockChange(true)}>Выдвинуть</button>
      </div></div>
      <div className="two-pallet-control-group"><strong>Фиксатор палеты</strong><div className="two-pallet-actions">
        <button type="button" aria-pressed={!stopOut} disabled={pose.busy} onClick={() => onStopChange(false)}>Втянуть</button>
        <button type="button" aria-pressed={stopOut} disabled={pose.busy} onClick={() => onStopChange(true)}>Выдвинуть</button>
      </div></div>
      <p className="panel-note">Для ручной смены палеты: опустите П2, верните каретку к оператору, смените зацепление, подайте палету к роботу и поднимите П2.</p>
    </section>

    <section>
      <h3>Содержимое палет · 2 × 96 мест</h3>
      <div className="two-pallet-actions">
        {([1, 2] as const).map((id) => <button key={id} type="button" aria-pressed={pallet === id} onClick={() => setPallet(id)}>Палета П{id}</button>)}
      </div>
      <div className="two-pallet-actions">
        <button type="button" onClick={() => onPalletChange(pallet, 'fill')}>Заполнить заготовками</button>
        <button type="button" onClick={() => onPalletChange(pallet, 'clear')}>Очистить</button>
      </div>
      <p className="panel-note">Нажмите на место, чтобы выбрать: пусто → заготовка → деталь.</p>
      <MagazineMatrix slots={inventory.slots} productTypes={inventory.productTypes} columns={8}
        onSlotClick={(slot) => onPalletChange(pallet, 'slot', slot)} />
    </section>

    <section>
      <h3>Синий конвейер · контроль деталей</h3>
      <div className="two-pallet-actions">
        <button type="button" aria-pressed={pose.beltDirection === -1} onClick={() => controller.setBelt(-1)}>К оператору</button>
        <button type="button" onClick={() => controller.setBelt(0)}>Стоп ленты</button>
        <button type="button" aria-pressed={pose.beltDirection === 1} onClick={() => controller.setBelt(1)}>К роботу</button>
      </div>
      <div className="two-pallet-actions">
        <button type="button" disabled={pose.sample !== null} onClick={() => controller.addSample()}>Положить тестовую деталь</button>
        <button type="button" disabled={pose.sample === null} onClick={() => controller.removeSample()}>Убрать деталь</button>
      </div>
      <p className="panel-note">Локальная анимация без команд в PLC. Тестовая деталь останавливается у края ленты.</p>
    </section>
  </div>;
}
