"""Execute production statistics ST without CODESYS or a connected PLC."""
from copy import deepcopy
from types import SimpleNamespace as NS

import pytest

from robot_simulator.plc_model.st_runtime import Block, Program, Registry, StArray, clean


@pytest.fixture(scope="module")
def registry():
    return Registry()


class StatisticsRig:
    def __init__(self, registry):
        self.registry = registry
        self.fb = Block(registry, "FB/FB_STATISTIC/FB_STATISTIC.st", {})
        self.inputs = {}

    def scan(self, now, **changes):
        self.inputs.update(changes)
        self.fb(udiNowMs=now & 0xFFFFFFFF, **self.inputs)
        return self.fb.stStatistic


def test_one_scan_operation_survives_between_calculations(registry):
    rig = StatisticsRig(registry)
    assert rig.scan(0).stRobotStat.tCNC_1 == 0
    assert rig.fb.xUpdated
    rig.scan(4, xBusyMachine_1=True)
    assert not rig.fb.xUpdated
    rig.scan(8, xBusyMachine_1=False)
    assert rig.fb.Sample.auliCompletedCount[5] == 1
    assert rig.scan(99).stRobotStat.tCNC_1 == 0
    assert not rig.fb.xUpdated
    assert rig.scan(100).stRobotStat.tCNC_1 == 4
    assert rig.fb.xUpdated
    rig.scan(196)
    assert not rig.fb.xUpdated
    rig.scan(200)
    assert rig.fb.xUpdated


def test_several_short_operations_are_counted_separately(registry):
    rig = StatisticsRig(registry)
    rig.scan(0)
    rig.scan(4, xBusyMachine_1=True)
    rig.scan(8, xBusyMachine_1=False)
    rig.scan(12, xBusyMachine_1=True)
    rig.scan(20, xBusyMachine_1=False)
    assert rig.scan(100).stRobotStat.tCNC_1 == 6
    assert rig.fb.Sample.auliCompletedCount[5] == 2


@pytest.mark.parametrize("index,output", [(5, "tCNC_1"), (6, "tCNC_2"), (7, "tCNC_3"),
                                        (8, "tMoveCNC_1"), (9, "tMoveCNC_2"), (10, "tMoveCNC_3"), (11, "tMagazine")])
def test_each_average_channel_keeps_its_published_meaning(registry, index, output):
    rig = StatisticsRig(registry)
    rig.scan(0)
    if index <= 7:
        on, off = {f"xBusyMachine_{index - 4}": True}, {f"xBusyMachine_{index - 4}": False}
    elif index <= 10:
        on = {"xBusyRobot": True, "eActiveAction": registry.enums["E_ROBOT_ACTION"].MOVE_TO_POINT,
              "eActivePoint": getattr(registry.enums["E_POINT_NAME"], f"MACHINE_{index - 7}_ABOVE")}
        off = {"xBusyRobot": False}
    else:
        on, off = {"xBusyMagazine": True}, {"xBusyMagazine": False}
    rig.scan(4, **on)
    rig.scan(16, **off)
    result = rig.scan(100).stRobotStat
    assert getattr(result, output) == 12
    assert rig.fb.Sample.auliCompletedCount[index] == 1
    for other in ("tCNC_1", "tCNC_2", "tCNC_3", "tMoveCNC_1", "tMoveCNC_2", "tMoveCNC_3", "tMagazine"):
        if other != output:
            assert getattr(result, other) == 0


def test_load_includes_current_interval_but_average_requires_completion(registry):
    rig = StatisticsRig(registry)
    rig.scan(0, xBusyRobot=True, xBusyMachine_1=True, xCycleActiveMachine_1=True)
    result = rig.scan(100)
    assert result.stRobotStat.rRobot == 100
    assert result.stMachineStat.rLoadCNC_1 == 100
    assert result.stRobotStat.tCNC_1 == 0
    rig.scan(120, xBusyRobot=False, xBusyMachine_1=False, xCycleActiveMachine_1=False)
    result = rig.scan(200)
    assert result.stRobotStat.rRobot == 60
    assert result.stMachineStat.rLoadCNC_1 == 60
    assert result.stMachineStat.rLoadCNC_2 == result.stMachineStat.rLoadCNC_3 == 0
    assert result.stRobotStat.tCNC_1 == 120


def test_new_start_resets_immediately_and_held_start_does_not_reset_again(registry):
    rig = StatisticsRig(registry)
    rig.scan(0, xBusyMachine_1=True)
    rig.scan(20, xBusyMachine_1=False)
    assert rig.scan(100).stRobotStat.tCNC_1 == 20
    reset = rig.scan(104, xStart=True, xBusyMachine_1=True)
    assert rig.fb.xUpdated
    assert reset.stRobotStat.tCNC_1 == reset.stRobotStat.rRobot == 0
    assert rig.fb.Sample.uliElapsedMs == 0
    rig.scan(108, xBusyMachine_1=False)
    assert not rig.fb.xUpdated
    assert rig.scan(204).stRobotStat.tCNC_1 == 4
    assert rig.fb.Sample.auliCompletedCount[5] == 1
    rig.scan(208, xStart=False)
    assert rig.scan(212, xStart=True).stRobotStat.tCNC_1 == 0


def test_time_wrap_preserves_duration_and_calculation_period(registry):
    rig = StatisticsRig(registry)
    start = 0xFFFFFFFF - 19
    rig.scan(start)
    rig.scan(start + 4, xBusyRobot=True, xBusyMachine_1=True)
    rig.scan(start + 12, xBusyRobot=False, xBusyMachine_1=False)
    result = rig.scan(start + 100)
    assert rig.fb.xUpdated
    assert result.stRobotStat.tCNC_1 == 8
    assert result.stRobotStat.rRobot == 8
    assert rig.fb.Sample.uliElapsedMs == 100


@pytest.mark.parametrize("factor,effective", [(0, 1), (1, 1), (2, 2), (250, 250), (999, 250)])
def test_simulation_scaling_does_not_accelerate_calculation_cadence(registry, factor, effective):
    rig = StatisticsRig(registry)
    rig.scan(0, uiSimulationTimeFactor=factor)
    rig.scan(4, xBusyRobot=True, xBusyMachine_1=True)
    rig.scan(8, xBusyRobot=False, xBusyMachine_1=False)
    rig.scan(96)
    assert not rig.fb.xUpdated
    result = rig.scan(100)
    assert rig.fb.xUpdated
    assert result.stRobotStat.tCNC_1 == 4 * effective
    assert result.stRobotStat.rRobot == 4
    assert rig.fb.Sample.uliElapsedMs == 100 * effective


def test_factor_change_scales_only_the_interval_where_it_applied(registry):
    rig = StatisticsRig(registry)
    rig.scan(0, uiSimulationTimeFactor=2, xBusyRobot=True, xBusyMachine_1=True)
    rig.scan(10, uiSimulationTimeFactor=5)
    rig.scan(20, xBusyRobot=False, xBusyMachine_1=False)
    result = rig.scan(100)
    assert result.stRobotStat.tCNC_1 == 70
    assert result.stRobotStat.rRobot == pytest.approx(70 / 470 * 100)
    assert rig.fb.Sample.uliElapsedMs == 470


def test_operation_count_survives_the_old_uint_boundary(registry):
    rig = StatisticsRig(registry)
    rig.scan(0)
    rig.fb.Sample.auliCompletedCount[5] = 65535
    rig.fb.Sample.auliCompletedBusyMs[5] = 65535 * 4
    rig.scan(4, xBusyMachine_1=True)
    rig.scan(8, xBusyMachine_1=False)
    assert rig.scan(100).stRobotStat.tCNC_1 == 4
    assert rig.fb.Sample.auliCompletedCount[5] == 65536


def test_elapsed_accumulator_continues_across_more_than_one_time_range(registry):
    rig = StatisticsRig(registry)
    rig.scan(0, xBusyRobot=True)
    rig.scan(0x80000000)
    result = rig.scan(0x100000000 + 100)
    assert rig.fb.Sample.uliElapsedMs == 0x100000000 + 100
    assert result.stRobotStat.rRobot == 100


def test_published_time_saturates_instead_of_wrapping_and_load_is_bounded(registry):
    sample = registry.value("ST_STATISTIC_SAMPLE", {})
    sample.uliElapsedMs = 0x100000000 + 100
    sample.auliBusyMs[1] = sample.uliElapsedMs * 2
    sample.auliCompletedBusyMs[5] = 0x100000000 + 123
    sample.auliCompletedCount[5] = 1
    calc = Block(registry, "FB/FB_STATISTIC/FB_CALCULATE.st", {})
    calc(Sample=sample)
    assert calc.stStatistic.stMachineStat.rLoadCNC_1 == 100
    assert calc.stStatistic.stRobotStat.tCNC_1 == 0xFFFFFFFF
    assert calc.stStatistic.stRobotStat.tCNC_2 == 0


def test_main_hook_owns_collection_and_publication_and_old_task_is_inert(registry):
    owner = Block(registry, "FB/FB_STATISTIC/FB_STATISTIC.st", {})
    now = [0]
    machines = StArray(1, [NS(xBusy=False, stIo=NS(xCycleActive=False)) for _ in range(3)], "ST_MACHINE_PUBLIC")
    magazines = StArray(1, [NS(xBusy=False), NS(xBusy=False)], "ST_MAGAZINE_STATUS")
    statistic = NS(stStatistic=registry.value("ST_STATISTIC", {}))
    environment = {**registry.enums, "_types": {}, "TIME": lambda: now[0], "STATISTIC_MAIN": owner,
                   "GVL_STATISTIC": statistic, "GVL_CELL_MANAGER": NS(Status=NS(xRunning=False)),
                   "GVL_CELL_SETTINGS": NS(uiSimulationTimeFactorApplied=1),
                   "GVL_MACHINE": NS(Status=machines), "GVL_MAGAZINE": NS(astStatus=magazines),
                   "GVL_ROBOT": NS(Status=NS(xBusy=False), Diag=NS(eActiveAction=0, eActivePoint=0))}
    hook = registry.program("PLC_PRG.RunStatistics.st")
    hook.execute(environment)
    now[0] = 4; magazines[2].xBusy = True; hook.execute(environment)
    now[0] = 8; magazines[2].xBusy = False; hook.execute(environment)
    assert statistic.stStatistic.stRobotStat.tMagazine == 0
    now[0] = 100; hook.execute(environment)
    assert statistic.stStatistic.stRobotStat.tMagazine == 4
    old = registry.program("STATISTIC.st")
    before = deepcopy(statistic.stStatistic)
    old.execute(environment)
    assert old.python.strip() == ""
    assert statistic.stStatistic.stRobotStat.tMagazine == before.stRobotStat.tMagazine
    main = clean((registry.root / "PLC_PRG.st").read_text(encoding="utf-8-sig"))
    assert main.count("RunStatistics();") == 1
    assert main.index("RunRobot();") < main.index("RunStatistics();") < main.index("PublishHmi();")
    calculator = clean((registry.root / "FB/FB_STATISTIC/FB_CALCULATE.st").read_text(encoding="utf-8-sig"))
    assert "TIME()" not in calculator and "R_TRIG" not in calculator and "F_TRIG" not in calculator
