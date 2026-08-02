# Разработка HMI без CODESYS

Полное пошаговое руководство с примерами компонентов, экранов, логики и OPC UA находится в [VISUALIZATION_GUIDE.md](./VISUALIZATION_GUIDE.md).

Визуализация является обычным приложением React + Three.js. Большую часть интерфейса можно разрабатывать без PLC, OPC UA и CODESYS.

## Быстрый запуск

```powershell
cd "C:\Users\KOKSHAROV IR\Desktop\Project\Portal robot\visu"
npm install
npm run dev
```

Каталог отдельных компонентов:

```powershell
npm run storybook
```

## Где что находится

- `src/components/ui` — кнопки, индикаторы и другие базовые элементы.
- `src/components/machine` — карточки и будущие экраны станков.
- `src/components/magazine` — матрица и статистика магазина.
- `src/components/CellViewport.tsx` — React-контейнер 3D-сцены.
- `src/three` — геометрия и анимация 3D-модели.
- `src/model/types.ts` — единый контракт данных интерфейса.
- `src/model/scenarios.ts` — тестовые состояния без PLC.
- `src/plc/client.ts` — перевод OPC UA-снимка в модель HMI.
- `gateway/server.mjs` — чтение тегов и запись команд OPC UA.
- `src/styles/theme.css` — цвета, радиусы и размеры дизайн-системы.

## Как добавить элемент

1. Создать компонент в тематической папке `src/components`.
2. Передавать данные через типизированные `props`, не читать OPC UA внутри компонента.
3. Добавить рядом файл `ComponentName.stories.tsx` с нормальным, аварийным и отключенным состояниями.
4. Подключить компонент к экрану в `App.tsx`.
5. Проверить `npm run build` и `npm run build-storybook`.

## Как добавить экран

1. Создать `src/pages/ScreenName.tsx`.
2. Передавать в экран готовое состояние и callbacks команд.
3. Добавить тип страницы и пункт навигации в `App.tsx`.
4. Не размещать в экране адреса OPC UA. Экран должен оставаться работоспособным на данных из `scenarios.ts`.

## Правило для сенсорной панели

Минимальная область нажатия — `44 × 44 px`. Команда должна иметь заблокированное состояние, понятную подпись и визуальное подтверждение фактического статуса от PLC.
