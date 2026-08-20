# Запуск проекта и изменение IP

## Что требуется

- Node.js 20+ и npm для HMI/gateway;
- CODESYS Runtime или PLC с запущенным OPC UA server;
- Chromium-браузер для проверки HMI.

Зависимости восстанавливаются из `visu/package-lock.json`; чужую папку
`node_modules` не копировать.

## Первый запуск

```powershell
cd 'C:\Users\KOKSHAROV IR\Desktop\Project\Portal robot\visu'
npm install
npm run dev:live
```

`dev:live` запускает gateway и Vite. По умолчанию:

- HMI: `http://127.0.0.1:5173/`;
- gateway health: `http://127.0.0.1:3001/api/health`;
- WebSocket: `ws://127.0.0.1:3001/ws`.

Для отдельной проверки компонентов использовать `npm run storybook` и порт
`6006`. Production-проверка: `npm run build`.

## IP PLC

Перед запуском gateway задать endpoint в текущем окне PowerShell:

```powershell
$env:OPCUA_ENDPOINT = 'opc.tcp://192.168.0.181:4840'
$env:OPCUA_GVL = 'GVL_HMI'
$env:GATEWAY_PORT = '3001'
npm run gateway
```

Заменить `192.168.0.181` на фактический IP PLC. Для Runtime на этом компьютере
использовать `opc.tcp://127.0.0.1:4840`. Переменная действует только в текущем
окне; после изменения перезапустить gateway.

## IP веб-интерфейса и доступ с панели

На компьютере HMI запускать Vite с внешним bind:

```powershell
$env:GATEWAY_HOST = '0.0.0.0'
npm run dev:live
```

Открывать с панели `http://<IP-компьютера-HMI>:5173/`. Если gateway находится
на другой машине, перед запуском Vite задать:

```powershell
$env:VITE_GATEWAY_URL = 'ws://<IP-компьютера-gateway>:3001/ws'
npm run dev:web
```

Разрешить входящие TCP-порты `5173` и `3001` в Windows Firewall. Не добавлять
локальные IP и секреты в Git.

## Проверка связи

1. В `/api/health` проверить `status: connected` и пустой `missing` для
   обязательных символов.
2. В HMI дождаться смены «Нет связи» на рабочий статус.
3. Если символ отсутствует, проверить опубликованный `GVL_HMI`, endpoint PLC,
   загрузку программы и перезапустить gateway.
4. `ERR_CONNECTION_REFUSED` на `5173` означает, что Vite не запущен или порт
   заблокирован; отказ на `3001` — аналогично для gateway.
