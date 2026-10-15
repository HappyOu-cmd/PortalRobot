import { readFileSync } from 'node:fs';

const root = new URL('../../../Portal_robot/Device/application/', import.meta.url);
export const readPlc = file => readFileSync(new URL(file, root), 'utf8');
const copy = value => value && typeof value === 'object' ? structuredClone(value) : value;

// Небольшой исполнитель используемого подмножества ST. Проверяем сам исходник;
// моделируем TON и типизированное присваивание, без запуска CODESYS.
export function compileSt(source) {
  let code = source.split('// --- BEGIN IMPLEMENTATION ---').at(-1)
    .replace(/\(\*[\s\S]*?\*\)/g, '').replace(/\/\/[^\r\n]*/g, '')
    .replace(/\bT#(\d+)(MS|S)\b/g, (_, n, unit) => String(Number(n) * (unit === 'S' ? 1000 : 1)))
    .replace(/\b(?:UINT|UDINT|SINT|DWORD|REAL|LREAL)#([\d.]+)/g, '$1');
  // Сначала внутренний CASE, затем внешний; labels — числа или enum.property.
  while (/\bCASE\b/.test(code)) code = code.replace(/CASE\s+([^\r\n]+)\s+OF((?:(?!\bCASE\b)[\s\S])*?)END_CASE\s*;/g, (_, selector, body) => {
    let ifDepth = 0;
    const branches = body.replace(/\b(IF|END_IF|ELSE)\b/g, token => {
      if (token === 'IF') ifDepth++;
      if (token === 'END_IF') ifDepth--;
      return token === 'ELSE' && ifDepth === 0 ? '__CASE_DEFAULT__' : token;
    }).replace(/^\s*((?:[\w.]+)(?:\s*,\s*[\w.]+)*)\s*:(?!=)\s*/gm,
      (_, labels) => `break; ${labels.split(',').map(label => `case ${label.trim()}:`).join(' ')} `).replace(/^\s*break;/, '')
      .replace(/\b__CASE_DEFAULT__\b/g, 'break; default:');
    return `switch (${selector}) { ${branches} break; }`;
  });
  // Named-argument calls с выражениями, в том числе вложенными MAX/SEL.
  const namedCalls = /\b(a?ton\w+(?:\[\w+\])?|F_GEOMETRY_\w+|IsMachineEligible|IsMachineCompatible)\(/g;
  code = code.replace(namedCalls, '$1({').replace(/([\w.\[\]]+)\s*:=/g, '$1 __ASSIGN__');
  // Закрываем объект named arguments по парным скобкам.
  for (const match of [...code.matchAll(/\b(?:a?ton\w+(?:\[\w+\])?|F_GEOMETRY_\w+|IsMachineEligible|IsMachineCompatible)\(\{/g)].reverse()) {
    let depth = 1, pos = match.index + match[0].length;
    for (; pos < code.length; pos++) { if (code[pos] === '(') depth++; if (code[pos] === ')' && --depth < 1) break; }
    const start = match.index + match[0].length;
    code = code.slice(0, start) + code.slice(start, pos).replace(/\b(\w+) __ASSIGN__/g, '$1:') + '}' + code.slice(pos);
  }
  code = code.replace(/FOR\s+(\w+) __ASSIGN__\s*([\s\S]*?)\s+TO\s+([\s\S]*?)\s+DO/g, 'for ($1 __JS_ASSIGN__ $2; $1 <= $3; $1++) {').replace(/END_FOR\s*;/g, '}')
    .replace(/ELSIF\s+([\s\S]*?)\s+THEN/g, '} else if ($1) {')
    .replace(/\bIF\s+([\s\S]*?)\s+THEN/g, 'if ($1) {').replace(/\bELSE\b/g, '} else {').replace(/END_IF\s*;/g, '}');
  code = code.replace(/([\w.\[\]]+) __ASSIGN__\s*([^;]+);/g, (_, target, expression) => {
    if (target.split('.').at(-1).startsWith('dw')) expression = expression.replace(/\bOR\b/g, '|').replace(/\bAND\b/g, '&');
    const field = target.split('.').at(-1);
    let value = `stCopy(${expression})`;
    if (field.startsWith('udi')) value = `((${value}) >>> 0)`;
    if (field.startsWith('ui')) value = `((${value}) & 65535)`;
    return `${target} __JS_ASSIGN__ ${value};`;
  }).replace(/\bMOD\b/g, '%').replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||').replace(/\bNOT\b/g, '!')
    .replace(/\bTRUE\b/g, 'true').replace(/\bFALSE\b/g, 'false').replace(/<>/g, '!==')
    .replace(/(?<![<>!:=])=(?!=)/g, '===').replace(/__JS_ASSIGN__/g, '=');
  const execute = Function('state', `with (state) { ${code} }`);
  return state => { state.stCopy = copy; execute(state); };
}

export function defaultsFromSt(source, block = 'VAR') {
  const declarations = source.match(new RegExp(`(?:^|\\n)${block}\\r?\\n([\\s\\S]*?)END_VAR`))?.[1] ?? '';
  return Object.fromEntries([...declarations.matchAll(/(\w+)\s*:\s*(BOOL|UDINT|UINT|REAL|TIME|DWORD|ST_GEOMETRY_CALL)\b/g)].map(([, name, type]) => [name, type === 'BOOL' ? false : type === 'ST_GEOMETRY_CALL' ? emptyCall() : 0]));
}
export const emptyCall = () => ({ udiId: 0, uiMachine: 0, uiProductType: 0, uiStation: 0, xForced: false, uiState: 0, uiReason: 0, uiMagazine: 0, uiPallet: 0, uiSlot: 0 });
const firstCallSource = readPlc('FB/F_GEOMETRY_FIRST_CALL.st');
const selectFirstCall = compileSt(firstCallSource);
export function firstGeometryCall(gvl) {
  const s = { ...defaultsFromSt(firstCallSource), GVL_GEOMETRY_CONTROL: gvl, F_GEOMETRY_FIRST_CALL: 0 };
  selectFirstCall(s); return s.F_GEOMETRY_FIRST_CALL;
}
export const conversions = { MAX: Math.max, MIN: Math.min, SEL: (condition, a, b) => condition ? b : a,
  TO_UINT: Number, UINT_TO_UDINT: Number, UINT_TO_REAL: Number, UDINT_TO_UINT: Number,
  UDINT_TO_TIME: Number, TIME_TO_UDINT: Number, TIME_TO_REAL: Number, UDINT_TO_REAL: Number, SINT_TO_UINT: Number };
export function ton(state) {
  let started = null;
  const timer = ({ IN, PT }) => {
    if (!IN) { started = null; timer.ET = 0; timer.Q = false; }
    else { started ??= state.now; timer.ET = Math.min(PT, state.now - started); timer.Q = state.now - started >= PT; }
  };
  timer.ET = 0; timer.Q = false; return timer;
}
