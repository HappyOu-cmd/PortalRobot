import { useState, type Dispatch, type SetStateAction } from 'react';
import { Icon } from '@iconify/react';
import copyIcon from '@iconify-icons/mdi/content-copy';
import plusIcon from '@iconify-icons/mdi/plus';
import saveIcon from '@iconify-icons/mdi/content-save-outline';
import deleteIcon from '@iconify-icons/mdi/delete-outline';
import { decisions, freshScenario, type Scenario, type Slot } from './testWorkbenchState';

const contents = ['Пусто', 'Заготовка', 'Деталь'];
const machineStates = ['Отключён', 'Пуст и готов', 'Обрабатывает', 'Деталь готова'];
type EditState = (update: (state: Scenario['initialState']) => void) => void;

function MagazineEditor({ scenario, index, editState }: { scenario: Scenario; index: number; editState: EditState }) {
  const [side, setSide] = useState<'slots' | 'operatorSlots'>('slots');
  const [selected, setSelected] = useState(0);
  const m = scenario.initialState.magazines[index];
  const field = scenario.initialState.magazineMode === 1 ? side : 'slots';
  const slots = m[field] ?? m.slots;
  const slot = slots[Math.min(selected, slots.length - 1)];
  const change = (content: number, all = false) => editState(s => {
    const values = s.magazines[index][field]!;
    if (all) values.forEach(item => { item.content = content; });
    else values[Math.min(selected, values.length - 1)].content = content;
  });
  return <section className="tw-editor-section">
    <header><h3>Магазин {index + 1}</h3><label className="tw-check"><input type="checkbox" checked={m.enabled} onChange={e => editState(s => { s.magazines[index].enabled = e.target.checked; })} />Включён</label></header>
    {scenario.initialState.magazineMode === 1 && <div className="tw-editor-row">
      <label>Палета<select value={side} onChange={e => setSide(e.target.value as typeof side)}><option value="slots">У робота · 96 мест</option><option value="operatorSlots">У оператора · 96 мест</option></select></label>
      <label className="tw-check"><input type="checkbox" checked={Boolean(m.operatorLoaded)} onChange={e => editState(s => { s.magazines[index].operatorLoaded = e.target.checked; })} />Загрузка оператора подтверждена</label>
      <label className="tw-check"><input type="checkbox" checked={Boolean(m.autoSwap)} onChange={e => editState(s => { s.magazines[index].autoSwap = e.target.checked; })} />Автообмен</label>
    </div>}
    <div className="tw-slot-tools">
      <strong>Слот {selected + 1}</strong>
      <label>Содержимое<select value={slot.content} onChange={e => change(Number(e.target.value))}>{contents.map((name, value) => <option key={name} value={value}>{name}</option>)}</select></label>
      <label>Общий тип слота<select value={slot.productType} onChange={e => editState(s => {
        const value = Number(e.target.value);
        s.magazines.forEach(mag => { mag.slots[selected].productType = value; if (mag.operatorSlots) mag.operatorSlots[selected].productType = value; });
      })}>{Array.from({ length: scenario.initialState.typeCount }, (_, i) => <option key={i} value={i + 1}>Тип {i + 1}</option>)}</select></label>
      <button type="button" onClick={() => change(slot.content, true)}>Заполнить всю палету</button>
    </div>
    <div className="tw-slot-grid" aria-label={`Магазин ${index + 1}, ${field === 'slots' ? 'роботная' : 'операторская'} палета`}>
      {slots.map((item, i) => <button key={i} type="button" aria-pressed={selected === i} data-content={item.content} data-type={item.productType}
        title={`Слот ${i + 1}: ${contents[item.content]}, тип ${item.productType}`} onClick={() => setSelected(i)}>
        <span>{i + 1}</span><b>{['—', 'З', 'Д'][item.content] ?? '?'}</b><small>Т{item.productType}</small>
      </button>)}
    </div>
    <p className="tw-muted">Выберите слот и задайте содержимое сверху. Тип позиции общий для всех палет.</p>
  </section>;
}

export function TestScenarioEditor({ editor, setEditor, onSave, onRemove, busy }: {
  editor: Scenario; setEditor: Dispatch<SetStateAction<Scenario>>; onSave: () => void; onRemove: () => void; busy: boolean;
}) {
  const editState: EditState = update => setEditor(previous => { const next = structuredClone(previous); update(next.initialState); return next; });
  const types = Array.from({ length: editor.initialState.typeCount }, (_, i) => i + 1);
  const payload = (item: Slot, index: number) => <div key={index} className="tw-editor-row">
    <strong>Захват {index + 1}</strong>
    <label>Содержимое<select value={item.content} onChange={e => editState(s => {
      s.grippers[index].content = Number(e.target.value); s.grippers[index].productType = Number(e.target.value) ? Math.max(1, item.productType) : 0;
    })}>{(index === 0 ? [0, 1] : [0, 2]).map(value => <option key={value} value={value}>{contents[value]}</option>)}</select></label>
    <label>Тип изделия<select disabled={!item.content} value={item.productType} onChange={e => editState(s => { s.grippers[index].productType = Number(e.target.value); })}>
      {!item.content && <option value={0}>Нет груза</option>}{types.map(value => <option key={value} value={value}>Тип {value}</option>)}
    </select></label>
  </div>;
  return <div className="tw-editor">
    <div className="tw-editor-actions">
      <button type="button" onClick={() => setEditor(freshScenario(editor.initialState.magazineMode))}><Icon icon={plusIcon} />Новый</button>
      <button type="button" onClick={() => setEditor({ ...structuredClone(editor), id: undefined, name: `${editor.name} — копия` })}><Icon icon={copyIcon} />Копия</button>
      <button className="tw-primary" type="button" disabled={busy || !editor.name.trim()} onClick={onSave}><Icon icon={saveIcon} />Сохранить</button>
      <button className="tw-danger" type="button" disabled={busy || !editor.id} onClick={onRemove}><Icon icon={deleteIcon} />Удалить</button>
    </div>
    <div className="tw-editor-scroll">
      <section className="tw-editor-section">
        <h3>Начальное состояние</h3>
        <label>Название<input value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
        <label>Описание<textarea rows={2} value={editor.description} onChange={e => setEditor({ ...editor, description: e.target.value })} /></label>
        <div className="tw-editor-row">
          <label>Тип магазинов<select value={editor.initialState.magazineMode} onChange={e => editState(s => {
            const mode = Number(e.target.value), count = mode === 1 ? 96 : 120;
            s.magazineMode = mode;
            const resize = (items: Slot[]) => Array.from({ length: count }, (_, i) => items[i] ?? { content: 0, productType: 1 });
            s.magazines.forEach(m => {
              m.slots = resize(m.slots);
              if (mode === 1) { m.operatorSlots = resize(m.operatorSlots ?? m.slots.map(slot => ({ ...slot, content: 0 }))); m.operatorLoaded ??= false; m.autoSwap ??= false; }
              else { delete m.operatorSlots; delete m.operatorLoaded; delete m.autoSwap; }
            });
          })}><option value={0}>Статичные · 2 × 120</option><option value={1}>Двухпалетные · 4 × 96</option></select></label>
          <label>Типов изделий<select value={editor.initialState.typeCount} onChange={e => editState(s => {
            s.typeCount = Number(e.target.value);
            s.machines.forEach(m => { m.productType = Math.min(m.productType, s.typeCount); });
            s.magazines.forEach(m => [...m.slots, ...(m.operatorSlots ?? [])].forEach(slot => { slot.productType = Math.min(Math.max(1, slot.productType), s.typeCount); }));
            s.grippers.forEach(g => { g.productType = g.content ? Math.min(Math.max(1, g.productType), s.typeCount) : 0; });
          })}>{[1, 2, 3].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Ориентация<select value={editor.initialState.orientation} onChange={e => editState(s => { s.orientation = Number(e.target.value); })}><option value={0}>К заготовке</option><option value={1}>К детали</option></select></label>
        </div>
        <p className="tw-muted">Смена типа здесь меняет сценарий. Режим магазинов PLC выбирается отдельно до прогона.</p>
      </section>
      <section className="tw-editor-section"><h3>Станки и захваты</h3>
        {editor.initialState.machines.map((machine, i) => <div className="tw-editor-row" key={i}>
          <strong>Станок {i + 1}</strong><label>Состояние<select value={machine.state} onChange={e => editState(s => { s.machines[i].state = Number(e.target.value); })}>{machineStates.map((name, value) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label>Тип изделия<select value={machine.productType} onChange={e => editState(s => { s.machines[i].productType = Number(e.target.value); })}>{types.map(value => <option key={value} value={value}>Тип {value}</option>)}</select></label>
        </div>)}
        {editor.initialState.grippers.map(payload)}
      </section>
      <section className="tw-editor-section"><h3>Геометрический контроль</h3>
        <div className="tw-editor-row">{editor.initialState.geometry.enabled.map((enabled, i) => <label className="tw-check" key={i}><input type="checkbox" checked={enabled} onChange={e => editState(s => { s.geometry.enabled[i] = e.target.checked; })} />ГК {i + 1} включён</label>)}</div>
        <div className="tw-editor-row">{editor.initialState.geometry.calls.map((called, i) => <label className="tw-check" key={i}><input type="checkbox" checked={called} onChange={e => editState(s => { s.geometry.calls[i] = e.target.checked; })} />Вызов со станка {i + 1}</label>)}</div>
        <label className="tw-check"><input type="checkbox" checked={editor.initialState.geometry.waitWhenOccupied} onChange={e => editState(s => { s.geometry.waitWhenOccupied = e.target.checked; })} />Ждать свободный ГК; при снятой отметке — обход в магазин</label>
      </section>
      {editor.initialState.magazines.map((_, index) => <MagazineEditor key={`${editor.initialState.magazineMode}-${index}`} scenario={editor} index={index} editState={editState} />)}
      <section className="tw-editor-section"><h3>Ожидаемый результат</h3>
        <label>Первое решение<select value={String(editor.expectations.firstDecision ?? '')} onChange={e => setEditor({ ...editor, expectations: { ...editor.expectations, firstDecision: e.target.value || undefined } })}>
          <option value="">Определить по начальному состоянию</option>{Object.entries(decisions).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>
        <label className="tw-check"><input type="checkbox" checked={editor.expectations.fullCycle !== false} onChange={e => setEditor({ ...editor, expectations: { ...editor.expectations, fullCycle: e.target.checked } })} />Дождаться полного цикла</label>
        <label className="tw-check"><input type="checkbox" checked={Boolean(editor.expectations.applyRejected)} onChange={e => setEditor({ ...editor, expectations: { ...editor.expectations, applyRejected: e.target.checked } })} />Намеренно некорректные данные: ожидается отказ PLC при загрузке</label>
      </section>
      <details className="tw-editor-section"><summary>Начальные маски аварий и дополнительные ожидания</summary>
        <p className="tw-muted">Маска 0 — нет аварии. Допускается один первичный владелец.</p>
        <div className="tw-editor-row">{(['cell', 'robot'] as const).map(owner => <label key={owner}>{owner === 'cell' ? 'Ячейка' : 'Робот'}<input type="number" min={0} max={owner === 'cell' ? 1 : 511} value={editor.initialState.faultMasks[owner]} onChange={e => editState(s => { s.faultMasks[owner] = Number(e.target.value); })} /></label>)}</div>
        <div className="tw-editor-row">{(['magazines', 'machines'] as const).flatMap(owner => editor.initialState.faultMasks[owner].map((mask, i) => <label key={`${owner}-${i}`}>{owner === 'machines' ? 'Станок' : 'Магазин'} {i + 1}<input type="number" min={0} max={owner === 'machines' ? 2047 : 63} value={mask} onChange={e => editState(s => { s.faultMasks[owner][i] = Number(e.target.value); })} /></label>))}</div>
        <pre>{JSON.stringify(editor.expectations, null, 2)}</pre>
      </details>
    </div>
  </div>;
}
