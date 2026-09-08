import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RangeSlider, SegmentedControl, ToggleSwitch } from './ControlPrimitives';
import './control-primitives.css';

const meta = {
  title: 'Базовые элементы/Контролы HMI — референс',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlPrototype() {
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState('jog');
  const [speed, setSpeed] = useState(25);
  const [step, setStep] = useState('continuous');

  return <main className="control-prototype">
    <header className="control-prototype__header">
      <div>
        <span className="control-prototype__eyebrow">HMI CONTROL SYSTEM</span>
        <h1>Единый стиль переключателей и ползунков</h1>
        <p>Прототип по референсам: белая активная поверхность, мягкая тень и быстрый тактильный отклик.</p>
      </div>
      <span className="control-prototype__status"><i /> Прототип</span>
    </header>

    <section className="control-prototype__grid">
      <article className="control-prototype__card">
        <span className="control-prototype__eyebrow">ON / OFF</span>
        <h2>Переключатель</h2>
        <p>Для настроек, эффектов, разрешений и флагов оборудования.</p>
        <ToggleSwitch checked={enabled} onChange={setEnabled} label="Ускорение симуляции" description={enabled ? 'Разрешено' : 'Выключено'} />
        <ToggleSwitch checked={false} onChange={() => undefined} label="Недоступное состояние" description="Нет связи с PLC" disabled />
      </article>

      <article className="control-prototype__card">
        <span className="control-prototype__eyebrow">SEGMENTED</span>
        <h2>Переключатель режима</h2>
        <p>Активная кнопка физически «выдавлена» поверх общего светлого основания.</p>
        <div className="control-prototype__stack">
          <SegmentedControl value={mode} options={[{ value: 'points', label: 'Точки' }, { value: 'jog', label: 'Пульт JOG' }]} onChange={setMode} ariaLabel="Режим управления" />
          <SegmentedControl value={step} options={[{ value: 'continuous', label: 'Непрерывный' }, { value: 'step', label: 'Шаговый' }]} onChange={setStep} ariaLabel="Тип движения" />
        </div>
      </article>

      <article className="control-prototype__card control-prototype__card--wide">
        <span className="control-prototype__eyebrow">RANGE / SPEED</span>
        <h2>Ползунок скорости</h2>
        <p>Тонкая цветная дорожка, крупный бело-синий бегунок и пресеты как на пульте.</p>
        <RangeSlider value={speed} min={0} max={100} step={1} onChange={setSpeed} label="Скорость JOG" valueLabel={`${speed}%`} />
        <div className="control-prototype__presets" aria-label="Предустановки скорости">
          {[10, 25, 50, 100].map((preset) => <button key={preset} type="button" className={preset === speed ? 'is-active' : ''} onClick={() => setSpeed(preset)}>{preset}%</button>)}
        </div>
        <RangeSlider value={speed} min={0} max={100} step={1} onChange={setSpeed} label="Недоступный ползунок" valueLabel="Нет данных" disabled />
      </article>
    </section>
  </main>;
}

export const Референс: Story = { render: () => <ControlPrototype /> };
