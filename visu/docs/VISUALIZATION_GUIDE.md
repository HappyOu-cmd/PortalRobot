# Руководство по разработке визуализации Portal Robot

Это руководство описывает текущую архитектуру проекта и полный путь разработки:

1. Создать новый элемент интерфейса.
2. Проверить его отдельно в Storybook.
3. Добавить элемент на существующий экран.
4. Создать новый экран и добавить его в меню.
5. Запрограммировать поведение элемента.
6. Передать статус или команду через OPC UA.
7. Проверить всю цепочку без риска для PLC.

## 1. Как устроен проект

В проекте используются четыре независимых уровня:

```text
CODESYS / PLC
    ↓ OPC UA
gateway/server.mjs
    ↓ WebSocket
src/plc/client.ts
    ↓ CellState и callbacks
React-компоненты и Three.js
```

### Ответственность уровней

| Уровень | Что делает |
| --- | --- |
| CODESYS | Управляет оборудованием, проверяет разрешения и формирует статусы |
| OPC UA gateway | Читает опубликованные теги и записывает разрешённые команды |
| `plc/client.ts` | Переводит значения PLC в понятную модель HMI |
| React | Показывает состояние и передаёт действия оператора |
| Storybook | Показывает React-компоненты без PLC и без запуска всей HMI |

Главное правило: React-компонент не должен самостоятельно знать NodeId OPC UA и открывать WebSocket. Он получает данные через `props` и сообщает о действиях через callbacks.

## 2. Что такое Storybook

Storybook запускает отдельный стенд для компонентов. Каждый файл `*.stories.tsx` содержит набор состояний одного компонента.

Например, карточка станка имеет истории:

- готов к работе;
- обработка;
- авария;
- выбран оператором.

Storybook не является рабочей HMI и не подключается к PLC. Изменение состояния в Storybook не влияет на оборудование.

### Запуск

```powershell
cd "C:\Users\KOKSHAROV IR\Desktop\Project\Portal robot\visu"
npm install
npm run storybook
```

Открыть:

```text
http://127.0.0.1:6006/
```

Рабочая HMI запускается отдельно:

```powershell
npm run dev:live
```

```text
http://127.0.0.1:5173/
```

### Основные области Storybook

- Слева находится список компонентов и их состояний.
- По центру отображается компонент.
- В панели Controls можно менять входные параметры компонента.
- Переключение `args` заставляет компонент сразу перерисоваться.
- Вкладка Accessibility помогает находить проблемы с кнопками, контрастом и подписями.

Storybook автоматически ищет истории по правилу из `.storybook/main.ts`:

```ts
stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)']
```

Поэтому историю следует хранить рядом с компонентом.

## 3. Создание нового элемента

Рассмотрим индикатор готовности магазина.

### Шаг 1. Создать компонент

Файл:

```text
src/components/magazine/MagazineReadyBadge.tsx
```

```tsx
import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';

export interface MagazineReadyBadgeProps {
  ready: boolean;
  busy: boolean;
  error: boolean;
}

export function MagazineReadyBadge({ ready, busy, error }: MagazineReadyBadgeProps) {
  if (error) {
    return <div className="equipment-badge error"><AlertCircle />Авария магазина</div>;
  }

  if (busy) {
    return <div className="equipment-badge busy"><LoaderCircle />Выполняется операция</div>;
  }

  return (
    <div className={`equipment-badge ${ready ? 'ready' : 'off'}`}>
      <CheckCircle2 />
      {ready ? 'Готов к работе' : 'Не готов'}
    </div>
  );
}
```

Компонент ничего не знает про PLC. Его задача — правильно показать три входных значения.

### Шаг 2. Добавить стили

В `src/styles/global.css`:

```css
.equipment-badge {
  min-height: var(--touch-target);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-weight: 700;
}

.equipment-badge.ready { color: var(--color-success); }
.equipment-badge.busy { color: var(--color-warning); }
.equipment-badge.error { color: var(--color-danger); }
```

Цвета следует брать из `src/styles/theme.css`, а не прописывать заново в каждом компоненте.

### Шаг 3. Создать истории

Файл:

```text
src/components/magazine/MagazineReadyBadge.stories.tsx
```

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MagazineReadyBadge } from './MagazineReadyBadge';

const meta = {
  title: 'Магазин/Индикатор готовности',
  component: MagazineReadyBadge,
  tags: ['autodocs'],
  args: { ready: true, busy: false, error: false },
} satisfies Meta<typeof MagazineReadyBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Готов: Story = {};
export const Занят: Story = { args: { ready: false, busy: true } };
export const Авария: Story = { args: { ready: false, error: true } };
export const Выключен: Story = { args: { ready: false } };
```

После сохранения Storybook автоматически добавит компонент в раздел `Магазин`.

## 4. Добавление элемента на существующий экран

Экран магазина сейчас находится в функции `MagazineScreen` файла `src/App.tsx`.

### Шаг 1. Импортировать компонент

```tsx
import { MagazineReadyBadge } from './components/magazine/MagazineReadyBadge';
```

### Шаг 2. Добавить его в JSX

Например, в заголовок экрана:

```tsx
<MagazineReadyBadge
  ready={state.ready}
  busy={state.busy}
  error={state.error}
/>
```

`state` здесь имеет тип `CellState['magazineState']`. Его значения заполняются либо локальной моделью, либо `mapPlcSnapshot()`.

### Шаг 3. Проверить

```powershell
npm run build
```

Затем открыть рабочую HMI и проверить четыре состояния:

1. Магазин выключен.
2. Магазин включен и готов.
3. Магазин выполняет операцию.
4. Магазин находится в ошибке.

## 5. Программирование логики кнопки

Компонент кнопки должен только сообщать о нажатии. Решение о допустимости команды принимает уровень выше, а окончательное разрешение всегда остаётся в PLC.

### Презентационный компонент

```tsx
interface ResetButtonProps {
  disabled: boolean;
  onReset: () => void;
}

export function ResetButton({ disabled, onReset }: ResetButtonProps) {
  return (
    <button type="button" disabled={disabled} onClick={onReset}>
      Сбросить аварию
    </button>
  );
}
```

### Подключение поведения в экране

```tsx
<ResetButton
  disabled={!state.error}
  onReset={onReset}
/>
```

Экран принимает `onReset` через props:

```tsx
interface MagazineScreenProps {
  state: CellState['magazineState'];
  onReset: () => void;
}
```

В `App` создаётся обработчик:

```tsx
const resetMagazine = () => {
  if (usePlcData) {
    plcClient.current?.send({ command: 'cell.reset' });
    return;
  }

  updateMagazineState({ error: false, activeErrors: [] });
};
```

Так сохраняется два режима:

- с OPC UA команда уходит в PLC;
- без OPC UA изменяется только локальная модель.

Не следует сразу окрашивать магазин как исправный после отправки команды. Фактическое состояние должно вернуться из PLC через `stMagazineStatus` и `stMagazineError`.

## 6. Создание нового экрана

Рассмотрим экран статистики.

### Шаг 1. Создать страницу

```text
src/pages/StatisticsScreen.tsx
```

```tsx
import type { CellState } from '../model/types';

interface StatisticsScreenProps {
  state: CellState;
  onClose: () => void;
}

export function StatisticsScreen({ state, onClose }: StatisticsScreenProps) {
  const processed = state.magazine.filter((slot) => slot === 'detail').length;

  return (
    <section className="statistics-screen">
      <header>
        <div><span>АНАЛИТИКА</span><h2>Статистика ячейки</h2></div>
        <button type="button" onClick={onClose}>Закрыть</button>
      </header>
      <strong>{processed}</strong>
      <span>готовых деталей в магазине</span>
    </section>
  );
}
```

### Шаг 2. Добавить тип страницы

В `App.tsx`:

```tsx
type Page = 'monitoring' | 'machines' | 'robot' | 'magazine' |
  'manual' | 'events' | 'alarms' | 'settings' | 'statistics';
```

### Шаг 3. Добавить пункт меню

```tsx
{ page: 'statistics', label: 'Статистика', icon: ChartNoAxesCombined }
```

### Шаг 4. Отобразить страницу

```tsx
{page === 'statistics' && (
  <StatisticsScreen
    state={cellState}
    onClose={() => setPage('monitoring')}
  />
)}
```

### Шаг 5. Добавить Storybook

Создать `StatisticsScreen.stories.tsx` и передать сценарии из `src/model/scenarios.ts`:

```tsx
args: {
  state: HMI_SCENARIOS.normal(),
  onClose: () => undefined,
}
```

Для полноценного экрана у истории рекомендуется:

```tsx
parameters: { layout: 'fullscreen' }
```

## 7. Полный пример существующей OPC UA-команды

Проследим команду общего сброса.

### 7.1. Кнопка React

В `App.tsx`:

```tsx
<CommandButton
  label="Сброс"
  icon={RotateCcw}
  onClick={() => sendCellCommand('cell.reset', () => setGlobalError(false))}
/>
```

### 7.2. Клиент HMI

`createPlcClient().send()` в `src/plc/client.ts` отправляет по WebSocket:

```json
{
  "type": "command",
  "command": "cell.reset",
  "requestId": "..."
}
```

### 7.3. Разрешённая команда gateway

В `gateway/server.mjs`:

```js
'cell.reset': {
  path: 'xCellReset',
  dataType: DataType.Boolean,
  pulse: true,
}
```

Gateway записывает `TRUE`, ждёт 150 мс и возвращает `FALSE`. Поэтому в PLC получается импульс.

### 7.4. Переменная CODESYS

В `GVL/GVL_HMI.gvl.st`:

```iecst
xCellReset : BOOL; // Общий сброс ошибок ячейки
```

Для явной публикации новой переменной применяется атрибут:

```iecst
{attribute 'symbol' := 'readwrite'}
xNewCommand : BOOL;
```

Для статуса, который HMI не должна изменять:

```iecst
{attribute 'symbol' := 'read'}
xNewStatus : BOOL;
```

### 7.5. Передача в программу

В `PLC_PRG.st`:

```iecst
GVL_CELL_CONTROL.xReset := GVL_HMI.xCellReset;
```

Далее `GVL_CELL_CONTROL.xReset` передаётся в оси, группу, станки, магазин, робот и менеджер ячейки.

## 8. Как добавить новый OPC UA-статус

Допустим, требуется статус `uiMagazineBlankCount`.

### Шаг 1. Добавить переменную в CODESYS

```iecst
{attribute 'symbol' := 'read'}
uiMagazineBlankCount : UINT; // Число заготовок в магазине
```

### Шаг 2. Рассчитать значение в PLC

Расчёт должен происходить в логике PLC, а не в HMI, если значение используется автоматикой или диагностикой.

```iecst
GVL_HMI.uiMagazineBlankCount := GVL_MAGAZINE.Status.uiBlankCount;
```

Если такого поля в `ST_MAGAZINE_STATUS` нет, сначала следует добавить его туда и заполнить внутри `FB_MAGAZINE`.

### Шаг 3. Обновить экспорт CODESYS

В репозитории хранятся `.st` и `.xml`. После изменения проекта в CODESYS необходимо экспортировать обновлённый XML. Если файлы редактируются напрямую, текст ST и содержимое XML должны оставаться синхронизированы.

Проверить также `Symbols.xml`, если конфигурация символов не подхватила новое поле автоматически.

### Шаг 4. Добавить обязательную проверку gateway

В `requiredSymbols` файла `gateway/server.mjs`:

```js
'uiMagazineBlankCount',
```

Это необязательно для чтения, но полезно: при отсутствии переменной HMI покажет `ЧАСТИЧНЫЕ ДАННЫЕ`.

### Шаг 5. Добавить поле модели

В `src/model/types.ts`:

```ts
export interface MagazineState {
  blankCount: number;
}
```

В `src/model/defaults.ts`:

```ts
blankCount: 0,
```

### Шаг 6. Прочитать значение

В `mapPlcSnapshot()` файла `src/plc/client.ts`:

```ts
blankCount: numberValue(
  values,
  'uiMagazineBlankCount',
  current.magazineState.blankCount,
),
```

### Шаг 7. Передать в компонент

```tsx
<Counter
  label="Заготовки"
  value={cellState.magazineState.blankCount}
/>
```

## 9. Как добавить новую OPC UA-команду

Допустим, требуется `magazine.confirmService`.

### CODESYS

```iecst
{attribute 'symbol' := 'readwrite'}
xMagazineConfirmService : BOOL;
```

Передать её в нужный блок через `PLC_PRG`, например:

```iecst
xHmiConfirmService := GVL_HMI.xMagazineConfirmService,
```

Функциональный блок должен сам проверить:

- магазин не занят;
- команда разрешена в текущем состоянии;
- отсутствует конфликт с автоматическим циклом;
- команда обработана один раз по фронту или импульсу.

### Gateway

```js
'magazine.confirmService': {
  path: 'xMagazineConfirmService',
  dataType: DataType.Boolean,
  pulse: true,
},
```

### React

```tsx
plcClient.current?.send({ command: 'magazine.confirmService' });
```

Нельзя разрешать произвольный путь OPC UA из браузера. Все команды должны быть явно перечислены в `commandMap` gateway.

## 10. Проверка после изменений

### Проверка React и TypeScript

```powershell
npm run build
```

### Проверка Storybook

```powershell
npm run build-storybook
```

### Проверка gateway

```powershell
node --check gateway/server.mjs
```

### Проверка OPC UA

Запустить gateway и открыть:

```text
http://127.0.0.1:3001/api/health
```

Проверить:

- `status` имеет значение `connected`;
- новый тег отсутствует в `missing`;
- `symbols` больше нуля;
- при нажатии кнопки gateway возвращает успешный `ack`;
- фактический статус после команды приходит обратно из PLC.

## 11. Что можно делать полностью без PLC

Без PLC можно:

- создавать компоненты;
- менять стили;
- собирать новые экраны;
- проверять аварийные и переходные состояния;
- проверять адаптацию под 1920 × 1080;
- моделировать нажатия;
- управлять локальной 3D-моделью;
- писать Storybook-сценарии.

PLC необходим для проверки:

- реальных NodeId;
- типов CODESYS;
- разрешения команд;
- импульсных сигналов;
- автомата состояний;
- реакции оборудования;
- восстановления после потери связи.

## 12. Типичные ошибки

### `Переменная ... не опубликована`

Переменная отсутствует в OPC UA или не разрешена в символах. Проверить `GVL_HMI`, атрибут `symbol`, `Symbols.xml`, экспорт и повторную загрузку PLC.

### `Команда ... не разрешена`

Имя отсутствует в `commandMap` файла `gateway/server.mjs` или написано иначе в React.

### Storybook показывает старый компонент

Перезапустить `npm run storybook` и обновить страницу с очисткой кеша.

### HMI сразу показывает успешное действие

Не следует менять фактический статус только по нажатию. Нужно дождаться нового снимка PLC.

### Команда выполняется несколько раз

Проверить `pulse: true`, сброс бита gateway и обработку фронта внутри функционального блока.

## 13. Рекомендуемый порядок работы

1. Описать назначение элемента и его состояния.
2. Проверить будущие связи с существующими блоками и структурами.
3. Создать типы и компонент.
4. Создать Storybook-сценарии.
5. Добавить компонент на экран.
6. Добавить локальную модель поведения.
7. Добавить или опубликовать PLC-тег.
8. Подключить gateway.
9. Подключить `mapPlcSnapshot()`.
10. Собрать проекты и проверить `/api/health`.
11. Проверить команду на симуляции PLC.

## 14. Передача проекта в ChatGPT или Codex

Проект визуализации не является слишком большим. Передавать весь каталог целиком не требуется.

### Вариант 1. Codex на компьютере

Это предпочтительный способ для разработки. Нужно открыть рабочей папкой:

```text
C:\Users\KOKSHAROV IR\Desktop\Project\Portal robot
```

Codex сам читает необходимые файлы, выполняет сборку и видит изменения Git. Загружать файлы в чат не нужно.

### Вариант 2. Репозиторий GitHub в ChatGPT

Разместить актуальную визуализацию в репозитории и подключить GitHub через `Settings → Apps → GitHub`. После подключения в запросе следует явно указать:

```text
Работай с репозиторием HappyOu-cmd/PortalRobot.
Визуализация находится в папке visu.
Сначала изучи VISUALIZATION_GUIDE.md, model/types.ts и plc/client.ts.
```

Обычное подключение GitHub в ChatGPT предназначено прежде всего для чтения и анализа. Для непосредственного редактирования локальных файлов, сборки и отправки изменений удобнее использовать Codex.

### Вариант 3. ChatGPT Project с файлами

Загрузить только исходные и конфигурационные файлы:

```text
package.json
src/**
gateway/server.mjs
vite.config.ts
HMI_DEVELOPMENT.md
VISUALIZATION_GUIDE.md
OPC_UA_TAGS.md
AGENTS.md
```

Не нужно загружать:

```text
node_modules/
dist/
storybook-static/
artifacts/
*.log
```

GLB-модели следует добавлять только тогда, когда задача относится к 3D-геометрии. Для обсуждения React, Storybook или OPC UA они не нужны.

### Как формулировать запрос

Хороший запрос содержит область изменения, требуемое поведение и проверку:

```text
Изучи src/components/magazine, model/types.ts и plc/client.ts.
Добавь индикатор готовности магазина на экран MagazineScreen.
Не меняй PLC-логику. Добавь четыре Storybook-состояния.
После изменения выполни npm run build и npm run build-storybook.
```

Не стоит просить ChatGPT одновременно полностью перепроектировать интерфейс, PLC и OPC UA. Надёжнее работать законченными вертикальными задачами: один компонент, один экран или одна цепочка тегов за раз.
