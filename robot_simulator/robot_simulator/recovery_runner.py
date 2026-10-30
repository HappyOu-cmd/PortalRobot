"""Operator recovery through existing gateway commands; no direct PLC writes."""
from __future__ import annotations

import copy


class RecoveryRunnerMixin:
    @staticmethod
    def active_recovery_alarms(values, *, active_only=True):
        result = {}
        for index in range(1, 101):
            root = f"astAlarmEvent[{index}]"
            sequence = int(values.get(root + ".udiSequence", 0))
            if sequence and (not active_only or values.get(root + ".xActive")) and values.get(root + ".eSeverity") == 0:
                result[sequence] = (int(values[root + ".eSource"]), int(values[root + ".uiCode"]))
        return result

    @staticmethod
    def recovery_errors_clear(values):
        paths = ["stCellStatus.xError", "stRobotStatus.xError", "xGlobalError"]
        paths += [f"astMachineStatus[{i}].xError" for i in (1, 2, 3)]
        paths += [f"ast{owner}Status[{i}].xError" for owner in ("Magazine", "Twin", "Geometry") for i in (1, 2)]
        return not any(values.get(path, False) for path in paths) and not RecoveryRunnerMixin.active_recovery_alarms(values)

    @staticmethod
    def recovery_material_positions(values):
        """Only material fields; mode, points and enabled flags are not inventory."""
        mode = values["uiMagazineMode"]
        prefixes = ("astTwinStore[",) if mode == 1 else ("astMagazineInventory[",)
        result = {key: value for key, value in values.items() if key.startswith(prefixes)
                  and ".aSlots[" in key and key.endswith((".xInPosition", ".eDetailType", ".uiProductType"))}
        for path in ("stRobotStatus.xGripper1Closed", "stRobotStatus.xGripper2Closed",
                     "stRobotStatus.uiBlankPayloadType", "stRobotStatus.uiDetailPayloadType"):
            result[path] = values[path]
        if mode == 1:
            for i in (1, 2):
                path = f"astTwinStatus[{i}].uiRobotPallet"
                result[path] = values[path]
        return result

    def recovery_inventory(self):
        counts = self.observed_inventory(self.values)
        # A repaired feedback timeout can reveal an occupied chuck before the
        # operator has identified its part. UNKNOWN is not an empty chuck.
        for i in (1, 2, 3):
            occupied = bool(self.values[f"astMachineIoStatus[{i}].xChuckClamped"])
            typed = int(self.values.get(f"astMachineStatus[{i}].ePartType", 0)) != 0
            if occupied != typed:
                product = int(self.values.get(f"stMultiType.Config.auiMachineType[{i}]", 0))
                if product not in counts:
                    raise AssertionError(f"machine {i}: chuck has no configured product type")
                counts[product] += int(occupied) - int(typed)
        return counts

    def check_recovery_material(self, label, before):
        after = self.recovery_material_positions(self.values)
        changed = [key for key in sorted(before.keys() | after.keys())
                   if key not in before or key not in after or before[key] != after[key]]
        self.check(label, {"fields": len(before), "changed": []},
                   {"fields": len(after), "changed": changed[:12]})

    async def restore_recovery_machines(self, socket, state, part_types):
        for index, initial in enumerate(state["machines"], 1):
            if not initial["state"]:
                continue
            root = f"astMachineStatus[{index}]"
            if not self.values.get(root + ".xEnabled", False):
                await self.wait_value(socket, lambda v: bool(v.get(root + ".xPowerAllowed")),
                                      20.0, f"machine {index} Enable is not allowed")
                await self.command(socket, "machine.enable", machine=index)
            # These are the same PLC-owned operator prompts as on the machine HMI.
            # Never open a gripper/chuck or fabricate an inventory to make a test pass.
            for _ in range(4):
                await self.wait_value(socket, lambda v: int(v.get(f"astMachineDiag[{index}].eState", -1)) in (1, 2, 3, 4),
                                      20.0, f"machine {index} did not reach an operator prompt or IDLE")
                step = int(self.values[f"astMachineDiag[{index}].eState"])
                if step == 4:
                    break
                if step == 1:
                    # E_PART_TYPE: DETAIL=1, BLANK=2 (different from scenario content).
                    part = part_types[index - 1]
                    if part not in (1, 2):
                        raise AssertionError(f"machine {index}: occupied chuck has no known recovery part type")
                    command = "machine.setDetail" if part == 1 else "machine.setBlank"
                else:
                    command = "machine.acceptRun" if step == 2 else "machine.acceptDoor"
                await self.command(socket, command, machine=index)
                await self.wait_value(socket, lambda v: int(v.get(f"astMachineDiag[{index}].eState", -1)) != step,
                                      20.0, f"machine {index} did not accept its operator answer")
            else:
                raise AssertionError(f"machine {index}: operator recovery did not finish")
            await self.wait_value(socket, lambda v: bool(v.get(root + ".xCanAcceptService")),
                                  30.0, f"machine {index} is not available after recovery")

    async def confirm_recovery_pallets(self, socket, roles):
        for index, role in enumerate(roles, 1):
            root = f"astTwinStatus[{index}]"
            if not self.values.get(root + ".xConfirmed"):
                await self.wait_value(socket, lambda v: bool(v.get(root + ".xConfirmAllowed"))
                                      and not v.get(root + ".xBusy", True)
                                      and not v.get(root + ".xHomeRequired", True)
                                      and v.get(root + ".uiCandidate") == role,
                                      30.0, f"pallet {index}: original arrangement cannot be confirmed after Reset")
                await self.command(socket, "twin.command", magazine=index, action=2, value=role,
                                   revision=int(self.values[root + ".udiRevision"]))
                await self.wait_value(socket, lambda v: bool(v.get(root + ".xConfirmed"))
                                      and v.get(root + ".uiRobotPallet") == role,
                                      20.0, f"pallet {index}: PLC did not confirm the original arrangement")
            self.check(f"Магазин {index}: физическая палета сохранена", role,
                       self.values[root + ".uiRobotPallet"])

    async def run_fault_recovery(self, socket, case, index, total, initial_counts):
        expected = case["expectations"]
        state = case["initialState"]
        activation = expected["activation"]
        target = (expected["alarmSource"], expected["alarmCode"])
        # Missing diagnostics must fail before injection, never appear as clean zeroes.
        required = ["astAlarmEvent[1].udiSequence", "stCellStatus.xRobotAtSafetyHome", "stTestScenario.udiLoadSeq"]
        required += ["stRobotStatus.xGripper1Closed", "stRobotStatus.xGripper2Closed",
                     "stRobotStatus.uiBlankPayloadType", "stRobotStatus.uiDetailPayloadType"]
        required += [f"astMachineStatus[{i}].xError" for i in (1, 2, 3)]
        required += [f"astMachineDiag[{i}].eState" for i in (1, 2, 3)]
        required += [f"astMachineIoStatus[{i}].xChuckClamped" for i in (1, 2, 3)]
        required += [f"astMagazineStatus[{i}].udiProducedPartsTotal" for i in (1, 2)]
        if state["magazineMode"] == 1:
            required += [f"astTwinStatus[{i}].{field}" for i in (1, 2)
                         for field in ("uiRobotPallet", "uiCandidate", "udiRevision", "xConfirmed",
                                       "xConfirmAllowed", "xHomeRequired", "xBusy")]
        missing = [path for path in required if path not in self.values]
        if missing:
            raise AssertionError("Recovery feedback is missing: " + ", ".join(missing))
        self.check("До инъекции нет ошибок", True, self.recovery_errors_clear(self.values))
        original_roles = [int(self.values[f"astTwinStatus[{i}].uiRobotPallet"]) for i in (1, 2)] if state["magazineMode"] == 1 else []
        baseline = set(self.active_recovery_alarms(self.values, active_only=False))

        def detected(values):
            return any(alarm == target and seq not in baseline
                       for seq, alarm in self.active_recovery_alarms(values, active_only=False).items())

        async def stage(name):
            self._recovery_stage = name
            await self.send(socket, {"type": "test-progress", "caseIndex": index, "caseCount": total,
                                     "stage": name, "name": case["name"]})

        async def begin():
            # In FAST a timeout can reach ERROR between OPC UA snapshots. Its
            # exact new cause is a terminal acknowledgement, never a stale Busy.
            await self.start_automatic_cycle(socket, terminal_ack=detected)
            await self.wait_value(socket, lambda v: bool(v.get("stCellStatus.xRunning")) or detected(v),
                                  20.0, "recovery test did not enter its initial automatic cycle")

        await stage("fault-injection")
        if "masks" in activation:
            # Diagnostic owners accept these causes only while idle. This is the
            # last scenario load, BEFORE the fault; recovery never calls Apply.
            injected = copy.deepcopy(case)
            injected["initialState"]["faultMasks"] = activation["masks"]
            await self.apply_scenario(socket, injected)
        else:
            await self.command(socket, "fault.enable", value=True)
            permission = expected.get("injectionPermission")
            if permission:
                await self.wait_value(socket, lambda v: bool(v.get(permission)),
                                      15.0, "PLC did not allow the diagnostic cause")
            delayed = activation.get("afterStart") or activation.get("machineBusy")
            if delayed:
                await begin()
            if activation.get("machineBusy"):
                root = f"astMachineStatus[{activation['machine']}]"
                await self.wait_value(socket, lambda v: bool(v.get(root + ".xBusy")),
                                      90.0, "machine service did not begin before the release timeout injection")
            fields = {key: value for key, value in activation.items() if key in ("machine", "index")}
            await self.command(socket, activation["command"], value=True, **fields)
            if expected["automaticFault"] and not delayed:
                await begin()

        await self.wait_value(socket, detected, 180.0, f"causal fault did not produce alarm {target[0]}:{target[1]}")
        actual = next(alarm for seq, alarm in self.active_recovery_alarms(self.values, active_only=False).items()
                      if seq not in baseline and alarm == target)
        self.check("Новая авария: источник и код", f"{target[0]}:{target[1]}", f"{actual[0]}:{actual[1]}")
        self.check("Автозапуск при аварии запрещён", False, bool(self.values.get("stCellStatus.xStartAllowed", True)))
        await self.stop_cell_if_running(socket)
        await self.wait_value(socket, lambda v: not v.get("stCellStatus.xRunning", True)
                              and not v.get("stRobotStatus.xBusy", True), 45.0, "fault did not stop the cell")
        await self.ensure_manual_control(socket)
        await stage("fault-repair")
        await self.clear_fault_sources(socket)
        await self.wait_stable_value(socket, lambda v: not v.get("stCellStatus.xRunning", True)
                                     and not v.get("stRobotStatus.xBusy", True), 10.0,
                                     "repair did not settle with the cell stopped", stable_for=0.5)
        # Repair may remove a live safety alarm, but must never replay Start.
        self.check("Снятие причины не запустило цикл", False, bool(self.values.get("stCellStatus.xRunning", True)))
        part_types = [int(self.values.get(f"astMachineStatus[{i}].ePartType", 0)) for i in (1, 2, 3)]
        # If the fault stopped a blank's processing, the simulator's current
        # cycle-done feedback provides the truthful operator classification.
        for i in (1, 2, 3):
            if (self.values.get(f"astMachineStatus[{i}].stIo.xCycleDone", False)
                    or self.values.get(f"astMachineIoStatus[{i}].xCycleDone", False)):
                part_types[i - 1] = 1
        before = self.recovery_material_positions(self.values)
        shared_chuck = 0
        if target[0] in (2, 3, 4) and target[1] == 21:
            machine = target[0] - 1
            if (self.values.get(f"astMachineIoStatus[{machine}].xChuckClamped")
                    and self.values.get("stRobotStatus.xGripper1Closed")
                    and self.values.get("stRobotStatus.xRotatedToBlank")
                    and self.values.get("stRobotStatus.eCurrentPoint") == 4 * machine):
                shared_chuck = machine
        expected_counts = dict(initial_counts)
        if shared_chuck:
            # One physical blank is still held by both the chuck and gripper.
            # Count the two confirmations explicitly until manual chuck release.
            expected_counts[1] += 1
        self.check("Баланс останова с учётом подтверждённого совместного зажима", expected_counts, self.recovery_inventory())
        load_seq = self.values.get("stTestScenario.udiLoadSeq")
        for i in (1, 2, 3):
            root = f"astMachineStatus[{i}]"
            if self.values.get(root + ".xError") and self.values.get(root + ".xManualHatchOpenAllowed"):
                await self.command(socket, "machine.manualHatchOpen", machine=i)
                await self.wait_value(socket, lambda v: bool(v.get(f"astMachineIoStatus[{i}].xDoorOpen")),
                                      20.0, f"machine {i} recovery hatch did not open")
        await stage("recovery-reset")
        await self.wait_value(socket, lambda v: bool(v.get("stCellStatus.xResetAllowed")),
                              30.0, "PLC did not allow a common Reset after repair")
        await self.command(socket, "cell.reset")
        await self.wait_stable_value(socket, self.recovery_errors_clear, 40.0,
                                     "one accepted common Reset did not clear every owner", stable_for=0.75)
        self.check("Reset не запускает ячейку", False, bool(self.values.get("stCellStatus.xRunning", True)))
        self.check_recovery_material("Reset сохранил груз и слоты", before)
        if shared_chuck:
            await self.wait_value(socket, lambda v: bool(v.get(f"astMachineStatus[{shared_chuck}].xManualChuckOpenAllowed")),
                                  20.0, "manual release of the shared chuck is not allowed")
            await self.command(socket, "machine.manualChuckOpen", machine=shared_chuck)
            await self.wait_value(socket, lambda v: bool(v.get(f"astMachineIoStatus[{shared_chuck}].xChuckUnclamped"))
                                  and not v.get(f"astMachineIoStatus[{shared_chuck}].xChuckClamped", True),
                                  20.0, "shared chuck did not release the blank before HOME")
            part_types[shared_chuck - 1] = 0
            self.check("После разжима патрона заготовка осталась только в захвате", initial_counts, self.recovery_inventory())
        await stage("recovery-home")
        await self.ensure_softmotion_drives(socket)
        await self.ensure_safety_home(socket)
        self.check("Робот вручную возвращён в HOME", True, self.values["stCellStatus.xRobotAtSafetyHome"])
        self.check_recovery_material("Ручной HOME сохранил груз и слоты", before)
        if original_roles:
            await stage("recovery-equipment")
            await self.confirm_recovery_pallets(socket, original_roles)
        await self.restore_recovery_machines(socket, state, part_types)
        for i, magazine in enumerate(state["magazines"], 1):
            if magazine["enabled"] and not self.values.get(f"astMagazineStatus[{i}].xEnabled"):
                await self.wait_value(socket, lambda v: bool(v.get(f"astMagazineStatus[{i}].xEnableSequenceAllowed")),
                                      30.0, f"magazine {i} does not allow re-enabling")
                await self.command(socket, "magazine.enable", magazine=i)
                await self.wait_value(socket, lambda v: bool(v.get(f"astMagazineStatus[{i}].xReady")),
                                      30.0, f"magazine {i} is not ready after recovery")
        self.check("Перед новым Start ошибок нет", True, self.recovery_errors_clear(self.values))
        produced = [int(self.values[f"astMagazineStatus[{i}].udiProducedPartsTotal"]) for i in (1, 2)]
        await stage("recovery-production")
        await self.start_automatic_cycle(socket)
        payload = copy.deepcopy(state)
        for i in (1, 2):
            held = bool(self.values.get(f"stRobotStatus.xGripper{i}Closed"))
            payload["grippers"][i - 1] = {"content": i if held else 0, "productType": 1 if held else 0}
        if any(item["content"] for item in payload["grippers"]):
            await self.answer_operator_prompts(socket, payload)

        roots = ([f"astTwinStore[{m}].astPallet[{p}]" for m in (1, 2) for p in (1, 2)]
                 if state["magazineMode"] == 1 else [f"astMagazineInventory[{m}]" for m in (1, 2)])

        def completed_details(values):
            return sum(bool(values.get(f"{root}.aSlots[{slot}].xInPosition"))
                       and values.get(f"{root}.aSlots[{slot}].eDetailType") == 2
                       for root in roots for slot in range(1, 97 if state["magazineMode"] == 1 else 121))

        def finished(values):
            if not self.recovery_errors_clear(values):
                raise AssertionError("a new equipment error appeared after recovery")
            return completed_details(values) == sum(initial_counts.values())

        await self.wait_value(socket, finished, 420.0, "recovered cell did not finish the material")
        # A partially filled magazine legitimately waits for the operator after
        # its last blank. Stop only AFTER all original material is finished.
        await self.stop_cell_if_running(socket)
        await self.wait_value(socket, lambda v: not v.get("stCellStatus.xRunning", True)
                              and not v.get("stRobotStatus.xBusy", True), 45.0, "recovered production did not stop")
        delta = sum((int(self.values[f"astMagazineStatus[{i}].udiProducedPartsTotal"]) - produced[i - 1]) & 0xFFFFFFFF for i in (1, 2))
        self.check("После нового Start подтверждён новый выпуск", True, delta > 0)
        self.check("Баланс после продолжения", initial_counts, self.observed_inventory(self.values))
        self.check("После аварии сценарий не перезагружался", load_seq, self.values.get("stTestScenario.udiLoadSeq"))
        count = 0
        for root in roots:
            for slot in range(1, 97 if state["magazineMode"] == 1 else 121):
                path = f"{root}.aSlots[{slot}]"
                if self.values.get(path + ".xInPosition"):
                    self.check(f"{path}: готовая деталь", 2, self.values.get(path + ".eDetailType"))
                    count += 1
        self.check("Весь исходный материал завершён в магазинах", sum(initial_counts.values()), count)
