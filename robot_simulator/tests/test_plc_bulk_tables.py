"""Execute production ST for change-driven inventories, alarms and HMI copies."""
from types import SimpleNamespace as NS

import pytest

from robot_simulator.plc_model.cell import Cell, record
from robot_simulator.plc_model.st_runtime import Block, Program, StArray


def count_summary_calls(magazine):
    calls = []
    original = magazine.state["UpdateTypeStatus"]

    def counted(**args):
        calls.append(True)
        return original(**args)

    magazine.state["UpdateTypeStatus"] = counted
    return calls


def test_idle_magazines_reuse_their_summary_without_scanning_any_slots():
    cell = Cell(autostart=False, enabled=(False, False))
    calls = [count_summary_calls(magazine) for magazine in cell.magazines]
    for _ in range(100):
        cell.scan()
    assert calls == [[], []]
    assert not any(magazine.xInventoryUpdated for magazine in cell.magazines)


@pytest.mark.parametrize("field", ["xHmiClear", "xHmiFillBlanks", "xHmiApplySlot", "xHmiCycleSlot"])
def test_accepted_manual_edits_rebuild_once_and_are_not_repeated_while_held(field):
    cell = Cell(autostart=False, enabled=(False, False))
    magazine = cell.magazines[0]
    calls = count_summary_calls(magazine)
    magazine.uiHmiEditSlot = 2
    magazine.uiHmiEditDetailType = 2
    magazine.uiHmiEditProductType = 1
    setattr(magazine, field, True)
    magazine()
    assert magazine.xInventoryUpdated
    assert len(calls) == 1
    magazine()
    assert not magazine.xInventoryUpdated
    assert len(calls) == 1


def test_external_bank_change_and_test_initialization_invalidate_cached_contents():
    cell = Cell(autostart=False, enabled=(False, False), magazines=[[1], [1]])
    magazine = cell.magazines[0]
    calls = count_summary_calls(magazine)
    magazine.stInventory.aSlots[1].xInPosition = False
    magazine(xInventoryChanged=True)
    assert magazine.Status.iCurrentBlank == 0
    assert magazine.Status.stTypeStatus.auiBlankCount[1] == 0
    assert not magazine.xInventoryUpdated  # External writer already owns the store.
    magazine(xInventoryChanged=False)
    assert len(calls) == 1
    magazine.stInventory.aSlots[2].xInPosition = True
    magazine.stInventory.aSlots[2].eDetailType = 1
    magazine.stInventory.aSlots[2].uiProductType = 1
    magazine(xTestInitialize=True)
    assert magazine.Status.iCurrentBlank == 2
    assert magazine.Status.stTypeStatus.auiBlankCount[1] == 1
    assert len(calls) == 2


def test_summary_tracks_geometry_and_type_count_without_an_inventory_write():
    cell = Cell(autostart=False, enabled=(False, False), slots=96, magazines=[[1], [1]])
    magazine = cell.magazines[0]
    calls = count_summary_calls(magazine)
    magazine(uiColumns=10, uiTypeCount=3)
    assert magazine.iActiveSlotCount == 120
    assert magazine.Status.stTypeStatus.auiFreeCount.values == [119, 119, 119]
    assert magazine.Status.stTypeStatus.aiFreeSlot.values == [2, 2, 2]
    assert len(calls) == 1
    magazine(uiTypeCount=0)
    assert magazine.Status.stTypeStatus.auiFreeCount.values == [0, 0, 0]
    assert magazine.Status.iCurrentBlank == 1
    assert len(calls) == 2


def alarm_rig():
    cell = Cell(autostart=False)
    r = cell.registry
    alarm = Block(r, "FB/FB_ALARM_MANAGER.st", cell.g)
    update_source = alarm.state["UpdateSource"]

    def bind_previous_mask(**args):
        index = alarm.uiIndex
        update_source(**args)
        alarm.adwPreviousAlarm[index] = update_source.in_out_values["dwPrevious"]

    alarm.state["UpdateSource"] = bind_previous_mask
    sources = r.value("ARRAY [1..22] OF ST_ALARM_SOURCE_DATA", cell.manager.state)
    sources[1].eSource = r.enums["E_ALARM_SOURCE"].CELL
    alarm(Sources=sources)
    return alarm, sources, r


def test_nested_alarm_methods_preserve_sequence_write_index_and_event_change_flag():
    alarm, sources, _ = alarm_rig()
    sources[1].dwAlarmActive = 24
    alarm(Sources=sources)
    assert alarm.xEventsUpdated
    assert alarm.Events[1].udiSequence == 1 and alarm.Events[2].udiSequence == 2
    assert alarm.Status.uiActiveAlarmCount == 2
    assert alarm.uiWriteIndex == 3 and alarm.udiSequence == 2


def test_alarm_deactivation_marks_the_table_changed_without_a_new_event_sequence():
    alarm, sources, _ = alarm_rig()
    assert not alarm.xEventsUpdated
    sources[1].dwAlarmActive = 8
    alarm(Sources=sources)
    assert alarm.xEventsUpdated and alarm.Status.uiActiveAlarmCount == 1
    sequence = alarm.Events[1].udiSequence
    alarm(Sources=sources)
    assert not alarm.xEventsUpdated
    sources[1].dwAlarmActive = 0
    alarm(Sources=sources)
    assert alarm.xEventsUpdated
    assert not alarm.Events[1].xActive
    assert alarm.Events[1].udiSequence == sequence
    assert alarm.Status.uiActiveAlarmCount == 0 and alarm.Status.uiHistoryCount == 1


def test_warning_acknowledgment_and_a_new_warning_in_the_same_scan_keep_the_new_warning():
    alarm, sources, _ = alarm_rig()
    sources[1].stWarning.udiSequence = 1
    sources[1].stWarning.uiCode = 52
    alarm(Sources=sources)
    assert alarm.Status.uiActiveWarningCount == 1
    alarm(Sources=sources, xResetWarnings=True)
    assert alarm.xEventsUpdated and alarm.Status.uiActiveWarningCount == 0
    sources[1].stWarning.udiSequence = 2
    alarm(Sources=sources, xResetWarnings=True)
    assert alarm.xEventsUpdated and alarm.Status.uiActiveWarningCount == 1
    assert not alarm.Events[1].xActive and alarm.Events[2].xActive


def test_controller_warning_cannot_be_acknowledged_before_its_owner_allows_reset():
    alarm, sources, r = alarm_rig()
    sources[1].eSource = r.enums["E_ALARM_SOURCE"].CONTROLLER_CPU_1
    sources[1].stWarning.udiSequence = 1
    sources[1].stWarning.uiCode = 1
    alarm(Sources=sources)
    alarm(Sources=sources, xResetWarnings=True, xControllerWarningResetAllowed=False)
    assert not alarm.xEventsUpdated and alarm.Status.uiActiveWarningCount == 1
    alarm(Sources=sources, xControllerWarningResetAllowed=True)
    assert alarm.xEventsUpdated and alarm.Status.uiActiveWarningCount == 0


class PublicationRig:
    def __init__(self):
        cell = Cell(autostart=False)
        r, env = cell.registry, cell.manager.state
        self.hmi = record(
            stHmiDataRevision=r.value("ST_HMI_DATA_REVISION", env),
            astMagazineInventory=r.value("ARRAY [1..2] OF ST_MAGAZINE_INVENTORY", env),
            astMagazineSlot=r.value("ARRAY [1..120] OF ST_DETAIL", env),
            astTwinStore=r.value("ARRAY [1..2] OF ST_TWO_PALLET_STORE", env),
            astAlarmEvent=r.value("ARRAY [1..100] OF ST_ALARM_EVENT", env),
        )
        self.state = {
            "_types": {}, "GVL_HMI": self.hmi, "GVL_CELL_SETTINGS": env["GVL_CELL_SETTINGS"],
            "GVL_DETAIL": record(astMagazine=r.value("ARRAY [1..2] OF ST_MAGAZINE_INVENTORY", env)),
            "GVL_TWO_PALLET": record(astStore=cell.twin.astStore),
            "GVL_ALARM": record(Events=r.value("ARRAY [1..100] OF ST_ALARM_EVENT", env)),
            "fbMagazine1": NS(xInventoryUpdated=False), "fbMagazine2": NS(xInventoryUpdated=False),
            "ALARM_MANAGER": NS(xEventsUpdated=False),
            "axMagazineInventoryChanged": StArray(1, [False, False], "BOOL"),
            "axTwinStoreChanged": StArray(1, [False, False], "BOOL"),
            "xHmiTablesInitialized": False, "udiHmiCommandNowMs": 500,
        }
        source = (r.root / "PLC_PRG.PublishHmi.st").read_text(encoding="utf-8-sig")
        alarm_start = source.index("IF ALARM_MANAGER.xEventsUpdated OR NOT xHmiTablesInitialized THEN")
        alarm_end = source.index("END_IF;", alarm_start) + len("END_IF;")
        inventory_start = source.index("// Нечётная версия")
        inventory_end = source.index("// Ack only", inventory_start)
        twin_start = source.index("IF NOT xHmiTablesInitialized OR axTwinStoreChanged")
        self.program = Program(source[alarm_start:alarm_end] + "\n" + source[inventory_start:inventory_end]
                               + "\n" + source[twin_start:], "PublishHmi: production table copies")

    def scan(self):
        self.program.execute(self.state)


def test_first_publication_and_idle_keep_even_revisions_and_do_not_copy_arrays_again():
    rig = PublicationRig()
    rig.scan()
    revision = rig.hmi.stHmiDataRevision
    assert (revision.uiVersion, revision.udiEpoch) == (1, 500)
    assert (revision.udiMagazineInventory, revision.udiTwinStore, revision.udiAlarmEvents) == (2, 2, 2)
    arrays = [rig.hmi.astMagazineInventory, rig.hmi.astMagazineSlot, rig.hmi.astTwinStore, rig.hmi.astAlarmEvent]
    for _ in range(50):
        rig.scan()
    assert all(old is new for old, new in zip(arrays,
        [rig.hmi.astMagazineInventory, rig.hmi.astMagazineSlot, rig.hmi.astTwinStore, rig.hmi.astAlarmEvent]))
    assert (revision.udiMagazineInventory, revision.udiTwinStore, revision.udiAlarmEvents) == (2, 2, 2)


@pytest.mark.parametrize("writer", ["fbMagazine1", "fbMagazine2", "external_bank", "twin_store", "alarm"])
def test_each_owner_refreshes_its_table_without_republishing_unrelated_tables(writer):
    rig = PublicationRig()
    rig.scan()
    if writer.startswith("fbMagazine"):
        rig.state[writer].xInventoryUpdated = True
        index = int(writer[-1])
        rig.state["GVL_DETAIL"].astMagazine[index].aSlots[1].uiProductType = 3
    elif writer == "external_bank":
        rig.state["axMagazineInventoryChanged"][1] = True
        rig.state["GVL_DETAIL"].astMagazine[1].aSlots[1].uiProductType = 2
    elif writer == "twin_store":
        rig.state["axTwinStoreChanged"][2] = True
        rig.state["GVL_TWO_PALLET"].astStore[2].axLoaded[1] = True
    else:
        rig.state["ALARM_MANAGER"].xEventsUpdated = True
        rig.state["GVL_ALARM"].Events[1].xActive = False
    rig.scan()
    revision = rig.hmi.stHmiDataRevision
    assert revision.udiMagazineInventory == (4 if writer in ("fbMagazine1", "fbMagazine2", "external_bank") else 2)
    assert revision.udiTwinStore == (4 if writer == "twin_store" else 2)
    assert revision.udiAlarmEvents == (4 if writer == "alarm" else 2)
    if writer == "fbMagazine1":
        assert rig.hmi.astMagazineInventory[1].aSlots[1].uiProductType == 3
        assert rig.hmi.astMagazineSlot[1].uiProductType == 3
    if writer == "twin_store":
        assert rig.hmi.astTwinStore[2].axLoaded[1]


def test_table_revision_wrap_remains_even_and_application_restart_changes_epoch():
    rig = PublicationRig()
    rig.scan()
    rig.hmi.stHmiDataRevision.udiAlarmEvents = 0xFFFFFFFE
    rig.state["ALARM_MANAGER"].xEventsUpdated = True
    rig.scan()
    assert rig.hmi.stHmiDataRevision.udiAlarmEvents == 0
    rig.state["xHmiTablesInitialized"] = False
    rig.state["udiHmiCommandNowMs"] = 12000
    rig.scan()
    assert rig.hmi.stHmiDataRevision.udiEpoch == 12000


def test_geometry_fifo_is_copied_only_on_initialization_or_a_new_published_sequence():
    cell = Cell(autostart=False)
    r, env = cell.registry, cell.manager.state
    events = r.value("ARRAY [1..100] OF ST_GEOMETRY_EVENT", env)
    source = (r.root / "PLC_PRG.PublishGeometryControl.st").read_text(encoding="utf-8-sig")
    start = source.index("// Снимок FIFO")
    end = source.index("IF GVL_CELL_SETTINGS", start)
    program = Program(source[start:end], "PublishGeometryControl: production FIFO copy")
    hmi = record(udiGeometryEventSequence=0, astGeometryEvents=events)
    state = {"_types": {}, "GVL_HMI": hmi, "GVL_GEOMETRY_CONTROL": record(astEvents=events),
             "Persistent_Value": record(udiEventSequence=0), "xHmiTablesInitialized": False}
    program.execute(state)
    initial = hmi.astGeometryEvents
    state["xHmiTablesInitialized"] = True
    for _ in range(30):
        program.execute(state)
    assert hmi.astGeometryEvents is initial
    state["GVL_GEOMETRY_CONTROL"].astEvents[1].udiSequence = 1
    state["Persistent_Value"].udiEventSequence = 1
    program.execute(state)
    assert hmi.udiGeometryEventSequence == 1
    assert hmi.astGeometryEvents[1].udiSequence == 1
    assert hmi.astGeometryEvents is not initial
