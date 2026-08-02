# Руководства проекта Portal Robot

Эта папка содержит рабочие инструкции для развития PLC-логики и HMI. Они описывают текущую архитектуру проекта, а не абстрактный пример.

| Руководство | Когда использовать |
| --- | --- |
| [01-errors-warnings.md](01-errors-warnings.md) | Нужно добавить аварию или предупреждение от CODESYS до журнала HMI |
| [02-visual-elements.md](02-visual-elements.md) | Нужно создать экран, карточку, кнопку, 3D-объект или другой элемент интерфейса |
| [03-ui-logic-opcua.md](03-ui-logic-opcua.md) | Нужно связать действие оператора или новый статус с PLC через OPC UA |
| [04-run-and-ip.md](04-run-and-ip.md) | Нужно запустить PLC, gateway и HMI либо изменить адрес оборудования |

## Короткая карта проекта

- PLC-исходники: `Portal_robot/Device/application`.
- Точка соединения PLC и HMI: `GVL_HMI`.
- OPC UA gateway: `visu/gateway/server.mjs`.
- Преобразование OPC UA-снимка в данные React: `visu/src/plc/client.ts`.
- Экраны и локальное состояние HMI: `visu/src/App.tsx`.
- Three.js: `visu/src/three` и `visu/src/components/CellViewport.tsx`.
- Базовые UI-компоненты: `visu/src/components/ui`.

Перед изменением PLC прочитать связанные DUT, GVL и вызывающие FB. Перед изменением UI выполнить `npm run build`, проверить интерфейс при масштабе браузера `100%` и убедиться, что 3D-сцена не сместилась.
