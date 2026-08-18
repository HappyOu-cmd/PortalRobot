import { useEffect, useRef, type RefObject } from 'react';
import type {
  CellLayout,
  CellState,
  IndexedConveyorTestCommand,
  IndexedConveyorTestStatus,
  RobotCoordinateFrame,
} from '../model/types';
import { CellScene, type CameraPreset, type EquipmentAnchors } from '../three/cellScene';

export interface EquipmentStatus {
  title: string;
  lines: string[];
  tone: 'blue' | 'green' | 'amber' | 'red' | 'gray';
}

interface CellViewportProps {
  layout: CellLayout;
  state: CellState;
  robotCoordinatesRef?: RefObject<RobotCoordinateFrame>;
  selectedMachine: number | null;
  cameraPreset: CameraPreset;
  onMachineSelect: (index: number) => void;
  onMagazineSelect?: (magazineId: 1 | 2) => void;
  indexedConveyorTest?: IndexedConveyorTestCommand;
  onIndexedConveyorTestStatus?: (magazineId: 1 | 2, status: IndexedConveyorTestStatus) => void;
  syncMagazineInventory?: boolean;
  equipmentStatuses?: {
    machines: EquipmentStatus[];
    magazines: [EquipmentStatus, EquipmentStatus];
  };
}

export function CellViewport({
  layout,
  state,
  robotCoordinatesRef,
  selectedMachine,
  cameraPreset,
  onMachineSelect,
  onMagazineSelect,
  indexedConveyorTest,
  onIndexedConveyorTestStatus,
  syncMagazineInventory = true,
  equipmentStatuses,
}: CellViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CellScene>();
  const fallbackRobotCoordinatesRef = useRef<RobotCoordinateFrame>({
    sequence: 0,
    timestampMs: Date.now(),
    sourceTimestampMs: Date.now(),
    coordinates: { x: state.robot.x, y: state.robot.y, z: state.robot.z },
  });
  const selectRef = useRef(onMachineSelect);
  const magazineSelectRef = useRef(onMagazineSelect);
  const conveyorStatusRef = useRef(onIndexedConveyorTestStatus);
  const machineStatusRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const magazineStatusRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    selectRef.current = onMachineSelect;
  }, [onMachineSelect]);

  useEffect(() => {
    magazineSelectRef.current = onMagazineSelect;
  }, [onMagazineSelect]);

  useEffect(() => {
    conveyorStatusRef.current = onIndexedConveyorTestStatus;
  }, [onIndexedConveyorTestStatus]);

  useEffect(() => {
    if (!robotCoordinatesRef) {
      fallbackRobotCoordinatesRef.current = {
        sequence: fallbackRobotCoordinatesRef.current.sequence + 1,
        timestampMs: Date.now(),
        sourceTimestampMs: Date.now(),
        coordinates: { x: state.robot.x, y: state.robot.y, z: state.robot.z },
      };
    }
  }, [robotCoordinatesRef, state.robot.x, state.robot.y, state.robot.z]);

  useEffect(() => {
    if (!hostRef.current) return;
    const updateAnchors = (anchors: EquipmentAnchors) => {
      anchors.machines.forEach((anchor, index) => {
        const element = machineStatusRefs.current[index];
        if (!element) return;
        element.style.transform = `translate3d(${anchor.x}px, ${anchor.y}px, 0) translate(-50%, 12px)`;
        element.style.visibility = anchor.visible ? 'visible' : 'hidden';
      });
      anchors.magazines.forEach((anchor, index) => {
        const magazine = magazineStatusRefs.current[index];
        if (!magazine) return;
        magazine.style.transform = `translate3d(${anchor.x}px, ${anchor.y}px, 0) translate(-50%, 12px)`;
        magazine.style.visibility = anchor.visible ? 'visible' : 'hidden';
      });
    };
    const coordinatesRef = robotCoordinatesRef ?? fallbackRobotCoordinatesRef;
    const scene = new CellScene(
      hostRef.current,
      layout,
      state,
      () => coordinatesRef.current ?? fallbackRobotCoordinatesRef.current,
      (index) => selectRef.current(index),
      (magazineId) => magazineSelectRef.current?.(magazineId),
      updateAnchors,
      (magazineId, status) => conveyorStatusRef.current?.(magazineId, status),
    );
    sceneRef.current = scene;
    scene.setMagazineInventorySync(syncMagazineInventory);
    return () => {
      scene.dispose();
      sceneRef.current = undefined;
    };
  }, []);

  useEffect(() => sceneRef.current?.setState(state), [state]);
  useEffect(() => sceneRef.current?.setMagazineInventorySync(syncMagazineInventory), [syncMagazineInventory]);
  useEffect(() => {
    if (indexedConveyorTest) sceneRef.current?.setIndexedConveyorTest(indexedConveyorTest);
  }, [indexedConveyorTest]);
  useEffect(() => sceneRef.current?.rebuild(layout), [layout]);
  useEffect(() => sceneRef.current?.setSelectedMachine(selectedMachine), [selectedMachine]);
  useEffect(() => sceneRef.current?.setCamera(cameraPreset), [cameraPreset]);

  return <div ref={hostRef} className="cell-viewport" aria-label="Трехмерная модель ячейки">
    {equipmentStatuses && <div className="equipment-status-layer" aria-label="Состояния оборудования">
      {equipmentStatuses.machines.map((status, index) => <button
        key={index}
        ref={(element) => { machineStatusRefs.current[index] = element; }}
        className={`equipment-status ${status.tone}`}
        type="button"
        onClick={() => selectRef.current(index)}
      >
        <strong><i />{status.title}</strong>
        {status.lines.map((line, lineIndex) => <span key={`${line}-${lineIndex}`}>{line}</span>)}
      </button>)}
      {equipmentStatuses.magazines.map((status, index) => <button
        key={status.title}
        ref={(element) => { magazineStatusRefs.current[index] = element; }}
        className={`equipment-status ${status.tone}`}
        type="button"
        onClick={() => onMagazineSelect?.((index + 1) as 1 | 2)}
      >
        <strong><i />{status.title}</strong>
        {status.lines.map((line, lineIndex) => <span key={`${line}-${lineIndex}`}>{line}</span>)}
      </button>)}
    </div>}
  </div>;
}
