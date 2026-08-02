# Структура проекта Portal Robot

## Корень проекта

```text
Portal robot/
|-- AGENTS.md              Правила разработки для Codex
|-- DOKS/                  Сквозные руководства PLC, OPC UA и HMI
|-- Portal_robot/          Исходный проект CODESYS и экспорт Codescribe
|-- PlcLogic/              Вспомогательные материалы PLC
|-- visu/                  React + Three.js HMI и OPC UA gateway
|-- Файлы по проекту/      CAD, GLB, размеры и исходные материалы
|-- *.project              Рабочий бинарный проект CODESYS
`-- *.xml                  Штатный экспорт проекта CODESYS
```

Рабочие исходники PLC изменяются в `Portal_robot/Device/application`. Бинарный `.project` и сгенерированный XML вручную не редактируются.

## PLC-часть

```text
Portal_robot/Device/application/
|-- FB/                    Функциональные блоки и их методы
|-- GVL/                   Глобальные переменные и интерфейс GVL_HMI
|-- ST/                    DUT, структуры и перечисления
|-- PLC_PRG.st             Главная программа и координация блоков
|-- STATISTIC.st           Программа статистики
|-- Symbols.xml            Конфигурация публикуемых символов
`-- Task Configuration.xml Конфигурация задач CODESYS
```

Файлы `*.gvl.xml` и другие XML рядом с ST создаются штатным экспортом Codescribe и нужны для восстановления объектов CODESYS. Перед изменением FB нужно прочитать его DUT, GVL, методы, место вызова в `PLC_PRG.st` и блоки, которые используют его статусы. Новый HMI-сигнал сначала оформляется в существующих `Command`, `Status`, `Diag` или `Error`, затем выводится через `GVL_HMI`.

## Визуализация

```text
visu/
|-- .storybook/            Конфигурация каталога компонентов
|-- docs/                  Подробные руководства только по HMI
|-- gateway/               OPC UA <-> WebSocket gateway
|-- src/
|   |-- assets/
|   |   |-- branding/      Логотипы и фирменная графика
|   |   `-- models/        GLB-модели оборудования
|   |-- components/
|   |   |-- ui/            Базовые Button, Dialog, Tabs, Select и индикаторы
|   |   |-- machine/       Компоненты станков
|   |   `-- magazine/      Компоненты магазина
|   |-- lib/               Общие утилиты
|   |-- model/             Типы, значения по умолчанию и локальные сценарии
|   |-- plc/               Клиент WebSocket и преобразование PLC-снимка
|   |-- styles/            Tailwind, токены темы и глобальные стили
|   |-- three/             Сцена, портал, станки, магазин и 3D-эффекты
|   |-- App.tsx            Главная компоновка и состояние экранов
|   `-- main.tsx           Точка входа React
|-- index.html             HTML-точка входа Vite
|-- package.json           Команды и зависимости
|-- vite.config.ts         Конфигурация сборки
`-- tsconfig*.json         Конфигурация TypeScript
```

`App.tsx` управляет компоновкой и локальным состоянием интерфейса. Повторяемую разметку нужно выносить в `components`, данные PLC преобразовывать только в `src/plc/client.ts`, а Three.js-объекты создавать и освобождать в `src/three`.

## Поток данных

```text
Функциональный блок ST
  -> PLC_PRG
  -> GVL_HMI
  -> OPC UA server
  -> visu/gateway/server.mjs
  -> visu/src/plc/client.ts
  -> React / Three.js
```

Команда идёт в обратную сторону. React отправляет только разрешённое имя команды; сопоставление с конкретным тегом находится в `commandMap` gateway. PLC повторно проверяет режим, состояние и разрешения безопасности.

## Что не является исходным кодом

Следующие каталоги и файлы создаются инструментами и не хранятся в Git:

- `visu/node_modules` — установленные npm-зависимости;
- `visu/dist` — production-сборка Vite;
- `visu/storybook-static` — собранный Storybook;
- `visu/artifacts` — временные снимки и профили браузера;
- `*.tsbuildinfo`, `vite.config.js`, `vite.config.d.ts` — результаты TypeScript;
- локальные сертификаты, журналы и временные файлы.

Их можно восстановить командами `npm install`, `npm run build` и `npm run build-storybook`.

## Где вносить типовые изменения

| Задача | Основные файлы |
| --- | --- |
| Изменить алгоритм механизма | `Portal_robot/Device/application/FB`, связанные `ST`, `GVL` и `PLC_PRG.st` |
| Добавить статус на HMI | `GVL_HMI`, `PLC_PRG`, `gateway/server.mjs`, `src/plc/client.ts`, React-компонент |
| Добавить команду оператора | `GVL_HMI`, `PLC_PRG`, `commandMap` gateway, callback React |
| Добавить карточку или экран | `src/components`, при необходимости `App.tsx`, Storybook |
| Изменить 3D-модель | `src/assets/models`, `src/three`, `CellViewport.tsx` |
| Изменить цвета и размеры UI | `src/styles/theme.css`, затем `src/styles/global.css` |

## Проверка перед коммитом

1. Для PLC выполнить импорт штатным Codescribe, затем `Clean` и `Build` в CODESYS.
2. В `visu` выполнить `npm run build`.
3. Выполнить `node --check gateway/server.mjs`.
4. Проверить HMI при разрешении `1920x1080` и масштабе браузера `100%`.
5. Убедиться, что `node_modules`, `dist`, `storybook-static`, `artifacts`, сертификаты и журналы не попали в Git.

Коммиты и push выполняются только из отдельного клона `C:\Users\KOKSHAROV IR\Desktop\Project\PortalRobot-GitHub`.
