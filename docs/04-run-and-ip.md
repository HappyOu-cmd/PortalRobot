# Как запускать проект и менять IP

## Что должно работать

Для живой HMI нужны три части:

1. CODESYS Runtime или PLC с загруженной программой и включённым OPC UA server.
2. OPC UA gateway из `visu/gateway/server.mjs`.
3. React + Three.js HMI из папки `visu`.

PLC публикует `GVL_HMI` через OPC UA. Gateway читает её, отдаёт WebSocket браузеру и безопасно записывает разрешённые команды.

## Первый запуск HMI

Открыть PowerShell в папке `visu`:

```powershell
cd 'C:\Users\KOKSHAROV IR\Desktop\Project\Portal robot\visu'
npm install
npm run dev:live
```

После запуска:

- HMI на этом компьютере: `http://127.0.0.1:5173/`.
- Gateway health: `http://127.0.0.1:3001/api/health`.
- Storybook компонентов: `npm run storybook`, затем `http://127.0.0.1:6006/`.

`npm run dev:live` запускает gateway и Vite одновременно. Для проверки production-сборки использовать `npm run build`.

## Настройка IP PLC

Перед запуском gateway задать endpoint текущего PLC:

```powershell
$env:OPCUA_ENDPOINT = 'opc.tcp://192.168.0.181:4840'
$env:OPCUA_GVL = 'GVL_HMI'
$env:GATEWAY_PORT = '3001'
npm run gateway
```

Заменить `192.168.0.181` на фактический IP PLC. Если CODESYS Runtime работает на этом же компьютере, использовать `127.0.0.1`:

```powershell
$env:OPCUA_ENDPOINT = 'opc.tcp://127.0.0.1:4840'
```

Переменные, заданные через `$env:`, действуют только в текущем окне PowerShell. Это удобно для испытаний и не добавляет локальный IP в Git.

## Доступ с панели или другого компьютера

Запустить Vite не только на localhost:

```powershell
npm run dev:web
```

Открыть на панели адрес компьютера с HMI, например `http://192.168.0.50:5173/`.

Если gateway запущен на том же компьютере, браузер сам использует `ws://<IP-HMI>:3001/ws`. Если gateway находится на другой машине, задать перед стартом Vite:

```powershell
$env:VITE_GATEWAY_URL = 'ws://192.168.0.50:3001/ws'
npm run dev:web
```

Проверить, что Windows Firewall разрешает входящие подключения к нужным TCP-портам `5173` и `3001`. Для production-панели лучше использовать постоянный сервис и фиксированные порты, но это отдельная задача настройки промышленного ПК.

## Как понять, что связь установлена

1. Открыть `http://127.0.0.1:3001/api/health`.
2. `status` должен быть `connected`.
3. Массив `missing` должен быть пустым. Если там есть `GVL_HMI.<переменная>`, выполнить экспорт, импорт, сборку и загрузку PLC заново.
4. В верхней панели HMI статус системы должен смениться с «Нет связи» на рабочий.

## Типичные проблемы

| Симптом | Что проверить |
| --- | --- |
| `ERR_CONNECTION_REFUSED` на `5173` | Vite не запущен или запущен в другом окне PowerShell |
| HMI пишет «Нет связи» | Gateway не запущен, неверный `OPCUA_ENDPOINT`, OPC UA server PLC выключен или порт заблокирован |
| «Переменная ... не опубликована» | В `GVL_HMI` нет атрибута `symbol`, в PLC загружен старый экспорт или gateway ожидает новое поле |
| «Команда ... не разрешена» | Нет записи в `commandMap` gateway либо команда не проходит условия PLC |
| Изменение IP не подействовало | Перезапустить gateway после изменения `$env:OPCUA_ENDPOINT` |
