# Portal Robot HMI

Исходники интерфейса находятся в `src`, OPC UA gateway — в `gateway`, а подробные инструкции для разработки — в [docs](docs/README.md). Общая документация PLC и HMI расположена в папке `DOKS` в корне проекта.

## Запуск с PLC

PLC должен публиковать `GVL_HMI` через OPC UA. Текущий локальный endpoint:

```text
opc.tcp://127.0.0.1:4840
```

Разработка с автоматическим запуском шлюза и Vite:

```powershell
npm run dev:live
```

Промышленный запуск собранного интерфейса:

```powershell
npm run build
npm start
```

После этого HMI доступен по адресу `http://127.0.0.1:3001`.

## Настройка адресов

Адрес PLC и порты можно переопределить переменными окружения:

```powershell
$env:OPCUA_ENDPOINT='opc.tcp://192.168.0.181:4840'
$env:GATEWAY_PORT='3001'
npm start
```

По умолчанию шлюз принимает подключения только с текущего компьютера. Для панели в отдельном устройстве необходимо отдельно настроить защиту командного канала, после чего разрешить сетевой интерфейс:

```powershell
$env:GATEWAY_HOST='0.0.0.0'
```

Состояние связи доступно по `http://127.0.0.1:3001/api/health`.

## Проверка перед коммитом

```powershell
npm run build
node --check gateway/server.mjs
```

Каталоги `node_modules`, `dist`, `storybook-static` и `artifacts` генерируются локально и не должны попадать в Git.
