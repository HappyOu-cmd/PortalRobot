"""Execute the small ST mailbox decisions; this is not a CODESYS compiler."""
import json
from pathlib import Path
import re

import pytest

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'Portal_robot/Device/application'
CONTRACT = (ROOT / 'visu/gateway/command-contract.mjs').read_text(encoding='utf-8')
PATHS = json.loads(CONTRACT.split('export const pulsePaths = ')[1].split(';')[0])
COMMANDS = (APP / 'PLC_PRG.ReadHmiCommands.st').read_text(encoding='utf-8-sig')
PUBLISH = (APP / 'PLC_PRG.PublishHmi.st').read_text(encoding='utf-8-sig')
INPUTS = (APP / 'PLC_PRG.ReadHmiInputs.st').read_text(encoding='utf-8-sig')
SLOT = COMMANDS.split(' DO\n', 1)[1].split('END_FOR;', 1)[0].replace('[uiHmiCommandIndex]', '[1]')
ACK = PUBLISH.rsplit(' DO\n', 1)[1].split('END_FOR;', 1)[0].replace('[uiHmiCommandIndex]', '[1]')
SETTING = INPUTS[INPUTS.index('xCellSettingRejected :='):INPUTS.index('// =============================================================================', INPUTS.index('xCellSettingRejected :='))]
FRESH = (APP / 'PLC_PRG.IsHmiCommandFresh.st').read_text(encoding='utf-8-sig').split('// --- BEGIN IMPLEMENTATION ---')[1]


def execute(source, state):
    """Only IF, CASE, assignments and the named numeric conversions are supported."""
    source = re.sub(r'//[^\n]*', '', source).strip()
    source = re.sub(r'IsHmiCommandFresh\(udiIssuedAtMs := ([\w.\[\]]+)\)', r'fresh(\1)', source)
    case = re.search(r'CASE (.*?) OF(.*?)END_CASE;', source, re.S)
    if case:
        branches = re.findall(r'UINT#(\d+):(.*?)(?=UINT#\d+:|$)', case[2], re.S)
        replacement = '\n'.join(f'{"IF" if i == 0 else "ELSIF"} {case[1]} = UINT#{value} THEN {body}' for i, (value, body) in enumerate(branches)) + '\nEND_IF;'
        source = source[:case.start()] + replacement + source[case.end():]
    token = re.compile(r'(?:(IF|ELSIF)\s+(.*?)\s+THEN\b|(ELSE)\b|(END_IF);|([\w.\[\]]+)\s*:=\s*(.*?);)', re.S)

    def expression(text):
        text = re.sub(r'(?:U?D?INT|ULINT)#(\d+)', r'\1', text)
        names = {'TRUE': 'True', 'FALSE': 'False', 'NOT': 'not', 'AND': 'and', 'OR': 'or'}
        text = re.sub(r'\b(?:TRUE|FALSE|NOT|AND|OR)\b', lambda m: names[m[0]], text)
        text = text.replace('<>', '!=')
        text = re.sub(r'(?<![!<>=])=(?!=)', '==', text)
        text = re.sub(r'\b[A-Za-z_]\w*(?:\.\w+)*(?:\[\d+\])?', lambda m: m[0] if m[0] in {'True', 'False', 'not', 'and', 'or', 'fresh', 'LREAL_TO_REAL', 'LREAL_TO_UDINT', 'UDINT_TO_TIME', 'UDINT_TO_ULINT'} else f'state[{m[0]!r}]', text)
        return ' '.join(text.split())

    lines, depth = [], 0
    while source:
        match = token.match(source)
        assert match, source[:120]
        branch, condition, otherwise, end, target, value = match.groups()
        if branch == 'ELSIF' or otherwise or end:
            depth -= 1
        if branch:
            lines.append('    ' * depth + ('if ' if branch == 'IF' else 'elif ') + expression(condition) + ':')
            depth += 1
        elif otherwise:
            lines.append('    ' * depth + 'else:')
            depth += 1
        elif target:
            lines.append('    ' * depth + f'state[{target!r}] = {expression(value)}')
        source = source[match.end():].strip()
    assert depth == 0
    def fresh(issued):
        local = {'udiHmiCommandNowMs': state['now'], 'udiIssuedAtMs': issued}
        execute(FRESH, local)
        return local['IsHmiCommandFresh']
    exec('\n'.join(lines), {'__builtins__': {}, 'state': state, 'fresh': fresh,
         'LREAL_TO_REAL': float, 'LREAL_TO_UDINT': round, 'UDINT_TO_TIME': int, 'UDINT_TO_ULINT': int})


def command_state():
    return {'now': 100, 'axHmiCommandWasHigh[1]': False, 'axHmiInternalPulse[1]': False,
            'GVL_HMI.audiHmiCommandSeq[1]': 0, 'GVL_HMI.audiHmiCommandAckSeq[1]': 0,
            'GVL_HMI.audiHmiCommandIssuedAtMs[1]': 100}


@pytest.mark.parametrize('arrival', ['before_read', 'between_read_and_publish', 'after_publish'])
def test_request_is_not_lost_at_scan_boundaries(arrival):
    state = command_state()
    for boundary in ['before_read', 'between_read_and_publish', 'after_publish']:
        if boundary == arrival:
            state['GVL_HMI.audiHmiCommandSeq[1]'] = 1
        if boundary == 'before_read': execute(SLOT, state)
        if boundary == 'between_read_and_publish': execute(ACK, state)
    pulses = int(state['axHmiCommandPulse[1]'])
    for _ in range(3):
        execute(SLOT, state)
        pulses += state['axHmiCommandPulse[1]']
        execute(ACK, state)
    assert pulses == 1
    assert state['GVL_HMI.audiHmiCommandAckSeq[1]'] == 1


def test_back_to_back_commands_have_a_low_scan_and_two_rising_edges():
    state = command_state()
    state['GVL_HMI.audiHmiCommandSeq[1]'] = 1
    execute(SLOT, state); execute(ACK, state)
    assert state['axHmiCommandPulse[1]']
    state['GVL_HMI.audiHmiCommandSeq[1]'] = 2
    execute(SLOT, state); execute(ACK, state)
    assert not state['axHmiCommandPulse[1]']
    assert state['GVL_HMI.audiHmiCommandAckSeq[1]'] == 1
    execute(SLOT, state); execute(ACK, state)
    assert state['axHmiCommandPulse[1]']
    assert state['GVL_HMI.audiHmiCommandAckSeq[1]'] == 2


@pytest.mark.parametrize('issued,now,accepted', [(100, 3100, True), (100, 3101, False), (0xfffffff0, 20, True), (0xfffffff0, 4000, False)])
def test_expired_commands_are_acknowledged_without_an_output_pulse(issued, now, accepted):
    state = command_state()
    state.update({'now': now, 'GVL_HMI.audiHmiCommandIssuedAtMs[1]': issued, 'GVL_HMI.audiHmiCommandSeq[1]': 1})
    execute(SLOT, state); execute(ACK, state)
    assert state['axHmiCommandPulse[1]'] == accepted
    assert state['GVL_HMI.auiHmiCommandResult[1]'] == (1 if accepted else 2)
    assert state['GVL_HMI.audiHmiCommandAckSeq[1]'] == 1
    execute(SLOT, state)
    assert not state['axHmiCommandPulse[1]']


def test_scenario_event_survives_dispatch_and_does_not_merge_with_network_event():
    state = command_state()
    state.update({'axHmiInternalPulse[1]': True, 'GVL_HMI.audiHmiCommandSeq[1]': 1})
    outputs = []
    for _ in range(4):
        execute(SLOT, state); execute(ACK, state)
        outputs.append(state['axHmiCommandPulse[1]'])
    assert outputs == [True, False, True, False]
    assert state['GVL_HMI.audiHmiCommandAckSeq[1]'] == 1


FIELDS = ['lrSafetyHomeToleranceX', 'lrSafetyHomeToleranceY', 'lrSafetyHomeToleranceZ', 'rPointCheckSpeedPercent'] + [f'stMachineTimeouts.{name}' for name in ['tRobotMove', 'tRobotAction', 'tRobotRelease', 'tDoorOpen', 'tDoorClose', 'tHatchUnlock', 'tChuckOpen', 'tChuckClose', 'tCycleStart']]


def setting_state(index=1, value=25):
    return {'now': 100, 'GVL_HMI.udiCellSettingCommandSeq': 1, 'GVL_HMI.udiCellSettingAckSeq': 0,
            'GVL_HMI.udiCellSettingIssuedAtMs': 100, 'GVL_HMI.uiCellSettingIndex': index,
            'GVL_HMI.lrCellSettingRequest': value, 'GVL_CELL_SETTINGS.xCellSettingsChangeAllowed': True,
            'xPointCheckActive': False, **{f'GVL_CELL_SETTINGS.{field}': 5 for field in FIELDS}}


@pytest.mark.parametrize('index', range(1, 14))
def test_all_settings_change_only_selected_applied_field(index):
    value = 25 if index < 5 else 42000
    state = setting_state(index, value)
    execute(SETTING, state)
    assert state['GVL_HMI.uiCellSettingResult'] == 1
    assert state[f'GVL_CELL_SETTINGS.{FIELDS[index - 1]}'] == value
    assert all(state[f'GVL_CELL_SETTINGS.{field}'] == 5 for i, field in enumerate(FIELDS, 1) if i != index)


@pytest.mark.parametrize('overrides,result', [
    ({'GVL_CELL_SETTINGS.xCellSettingsChangeAllowed': False}, 2),
    ({'GVL_HMI.uiCellSettingIndex': 4, 'xPointCheckActive': True}, 2),
    ({'GVL_HMI.uiCellSettingIndex': 99}, 3),
    ({'GVL_HMI.lrCellSettingRequest': float('nan')}, 3),
    ({'GVL_HMI.lrCellSettingRequest': float('inf')}, 3),
    ({'GVL_HMI.lrCellSettingRequest': -1}, 3),
    ({'now': 3101}, 4),
])
def test_rejected_setting_does_not_apply_later(overrides, result):
    state = setting_state(); state.update(overrides)
    execute(SETTING, state)
    assert state['GVL_HMI.uiCellSettingResult'] == result
    assert all(state[f'GVL_CELL_SETTINGS.{field}'] == 5 for field in FIELDS)
    assert state['xCellSettingRejected']
    execute('GVL_HMI.udiCellSettingAckSeq := udiCellSettingSnapshot;', state)
    state.update({'GVL_CELL_SETTINGS.xCellSettingsChangeAllowed': True, 'xPointCheckActive': False, 'now': 100})
    execute(SETTING, state)
    assert not state['xCellSettingRejected']
    assert all(state[f'GVL_CELL_SETTINGS.{field}'] == 5 for field in FIELDS)


def test_wire_mapping_ownership_and_scan_order():
    mapping = re.findall(r'GVL_HMI\.([\w.\[\]]+) := axHmiCommandPulse\[(\d+)\];', COMMANDS)
    assert mapping == [(path, str(i)) for i, path in enumerate(PATHS, 1)]
    assert len(PATHS) == len(set(PATHS)) == 121
    program = (APP / 'PLC_PRG.st').read_text(encoding='utf-8-sig')
    assert program.index('ReadHmiCommands();') < program.index('ReadHmiInputs();') < program.index('RunSafety();') < program.index('PublishHmi();')
    assert 'GVL_HMI.xPointCheckStop := FALSE' not in INPUTS
    request_names = r'(?:audiHmiCommandSeq\[[^\]]+\]|audiHmiCommandIssuedAtMs\[[^\]]+\]|udiCellSettingCommandSeq|uiCellSettingIndex|lrCellSettingRequest|udiCellSettingIssuedAtMs)'
    for file in APP.rglob('*.st'):
        assert not re.search(r'GVL_HMI\.' + request_names + r'\s*:=', file.read_text(encoding='utf-8-sig')), file
