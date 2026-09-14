import resetTable from '../../../DOKS/15-equipment-error-reset-table.md?raw';
import type { EquipmentIssue } from './equipmentInspection';

interface Guidance { cause: string; recovery: string; documented: boolean }
const clean = (text: string) => text.replace(/`/g, '').replace(/<br\s*\/?\s*>/gi, '\n').trim();
const hatchTerms = (text: string) => text.replace(/(открытия|закрытия|неисправность) двери/g, '$1 люка')
  .replace(/открытой двери/g, 'открытого люка').replace(/закрытой двери/g, 'закрытого люка');
const rows = new Map<string, Guidance>();
for (const line of resetTable.split(/\r?\n/)) {
  const cells = line.split('|').map(clean);
  const match = cells[1]?.match(/^(.+), (W?\d+)$/);
  if (!match || cells.length < 7) continue;
  rows.set(`${match[1]}:${match[2]}`, { cause: cells[3], recovery: cells[4], documented: true });
}
export function equipmentGuidance(issue: EquipmentIssue): Guidance {
  const source = issue.source;
  let family = source?.startsWith('machine-') ? 'Станок' : source?.startsWith('magazine-') ? 'Магазин'
    : source === 'robot' ? 'Робот' : source === 'gripper' ? 'Захват' : source === 'axis-group' ? 'Группа осей'
      : source === 'motion-manager' ? 'Менеджер движения' : source === 'point-manager' ? 'Менеджер точек'
        : source === 'cell-safety' ? 'Безопасность' : source?.startsWith('axis-') ? 'Ось X/Y/Z' : 'Ячейка';
  if (issue.severity === 'warning') {
    if (family === 'Станок') family = 'Станок 1–3';
    if (family === 'Магазин') family = 'Магазин 1–2';
  }
  const documented = source && issue.code !== undefined ? rows.get(`${family}:${issue.severity === 'warning' ? 'W' : ''}${issue.code}`) : undefined;
  if (documented) {
    // Historical PLC identifiers called the robot hatch a door. Present the actual mechanism.
    if (source?.startsWith('machine-') && issue.node === 'hatch') return {
      ...documented, cause: hatchTerms(documented.cause), recovery: hatchTerms(documented.recovery),
    };
    return documented;
  }
  const diagnostic: Partial<Record<EquipmentIssue['node'], [string, string]>> = {
    'emergency-stop': ['Активен сигнал нажатия аварийной кнопки выбранного поста или шкафа.',
      'Установить причину аварийного останова. После устранения опасности освободить кнопку и убедиться, что её сигнал снят. Выполнить штатный сброс ячейки, когда PLC разрешит его.'],
    'phase-relay': ['PLC сообщает неисправность контроля фаз.',
      'Проверь питание, последовательность фаз и диагностику реле; после восстановления выполни общий сброс ошибок.'],
    'safety-relay': ['PLC сообщает, что реле безопасности не взведено.',
      'Освободи грибки, закрой активные двери и нажми отдельный сброс реле безопасности.'],
    pressure: ['PLC сообщает низкое давление воздуха; значение манометра на модели условное.',
      'Для реальной установки проверить подачу воздуха, установленное рабочее давление и диагностику пневмосистемы по документации оборудования. В демонстрации снять локальную инъекцию.'],
  };
  const detail = diagnostic[issue.node];
  if (detail) return { cause: detail[0], recovery: detail[1], documented: false };
  return {
    cause: `${issue.title}. ${source?.startsWith('axis-') ? 'Это диагностика оси; конкретную аппаратную причину определяют по коду привода или SoftMotion.' : 'Точная первопричина не детализирована в доступном сигнале.'}`,
    recovery: 'Проверить первичную диагностику указанного оборудования и устранить её причину. Использовать штатный сброс только при разрешении PLC. Повторяющийся отказ проверить по журналу и документации оборудования.',
    documented: false,
  };
}
