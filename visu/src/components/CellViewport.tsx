import { useEffect, useRef, useState, type RefObject } from 'react';
import type {
  CellLayout,
  CellState,
  IndexedConveyorTestCommand,
  IndexedConveyorTestStatus,
  RobotCoordinateFrame,
} from '../model/types';
import { DEFAULT_DRIFT_SETTINGS, EMPTY_DRIFT_TELEMETRY, type DriftSettings, type DriftTelemetry, type EasterEggMode } from '../model/easterEggs';
import {
  DEFAULT_VISUAL_EFFECT_SETTINGS,
  EMPTY_SCENE_ACTIVITY,
  type SceneActivity,
  type SceneEquipmentTarget,
  type VisualEffectSettings,
} from '../model/visualEffects';
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
  easterEggMode?: EasterEggMode;
  easterEggRevision?: number;
  driftSettings?: DriftSettings;
  visualEffects?: VisualEffectSettings;
  sceneActivity?: SceneActivity;
  focusTarget?: SceneEquipmentTarget | null;
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
  easterEggMode = 'off',
  easterEggRevision = 0,
  driftSettings = DEFAULT_DRIFT_SETTINGS,
  visualEffects = DEFAULT_VISUAL_EFFECT_SETTINGS,
  sceneActivity = EMPTY_SCENE_ACTIVITY,
  focusTarget = null,
  equipmentStatuses,
}: CellViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CellScene>();
  const [driftTelemetry, setDriftTelemetry] = useState<DriftTelemetry>(EMPTY_DRIFT_TELEMETRY);
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
      setDriftTelemetry,
    );
    sceneRef.current = scene;
    scene.setMagazineInventorySync(syncMagazineInventory);
    scene.setDriftSettings(driftSettings);
    scene.setVisualEffects(visualEffects);
    scene.setSceneActivity(sceneActivity);
    scene.setFocusTarget(focusTarget);
    scene.setEasterEgg(easterEggMode, easterEggRevision);
    return () => {
      scene.dispose();
      sceneRef.current = undefined;
    };
  }, []);

  useEffect(() => sceneRef.current?.setState(state), [state]);
  useEffect(() => sceneRef.current?.setMagazineInventorySync(syncMagazineInventory), [syncMagazineInventory]);
  useEffect(() => sceneRef.current?.setEasterEgg(easterEggMode, easterEggRevision), [easterEggMode, easterEggRevision]);
  useEffect(() => sceneRef.current?.setDriftSettings(driftSettings), [driftSettings]);
  useEffect(() => sceneRef.current?.setVisualEffects(visualEffects), [visualEffects]);
  useEffect(() => sceneRef.current?.setSceneActivity(sceneActivity), [sceneActivity]);
  useEffect(() => sceneRef.current?.setFocusTarget(focusTarget), [focusTarget]);
  useEffect(() => {
    if (indexedConveyorTest) sceneRef.current?.setIndexedConveyorTest(indexedConveyorTest);
  }, [indexedConveyorTest]);
  useEffect(() => sceneRef.current?.rebuild(layout), [layout]);
  useEffect(() => sceneRef.current?.setSelectedMachine(selectedMachine), [selectedMachine]);
  useEffect(() => sceneRef.current?.setCamera(cameraPreset), [cameraPreset]);

  const driftActive = easterEggMode === 'drift';
  return <div ref={hostRef} className={`cell-viewport${driftActive ? ' drift-mode' : ''}`} aria-label="Трехмерная модель ячейки">
    {equipmentStatuses && !driftActive && <div className="equipment-status-layer" aria-label="Состояния оборудования">
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
    {driftActive && <div className={`drift-hud${driftTelemetry.drifting ? ' active' : ''}${driftTelemetry.impact > 0.08 ? ' impact' : ''}`}>
      <div className="drift-score"><span>DRIFT SCORE</span><strong>{driftTelemetry.score.toLocaleString('ru-RU')}</strong><small>РЕКОРД {driftTelemetry.bestScore.toLocaleString('ru-RU')}</small></div>
      <div className="drift-readouts">
        <div><span>СКОРОСТЬ</span><strong>{driftTelemetry.speedKmh}</strong><small>км/ч</small></div>
        <div><span>УГОЛ</span><strong>{driftTelemetry.driftAngle}°</strong><small>{driftTelemetry.rearWheelsLocked ? 'КОЛЁСА БЛОК.' : driftTelemetry.rearSlip > 0.16 ? `СРЫВ ${Math.round(driftTelemetry.rearSlip * 100)}%` : 'СЦЕПЛЕНИЕ'}</small></div>
        <div className="drift-combo"><span>КОМБО</span><strong>×{driftTelemetry.combo.toFixed(1)}</strong><small>{driftTelemetry.impact > 0.08 ? 'ЕБАНУЛСЯ' : driftTelemetry.drifting ? 'НЕ ОТПУСКАЙ' : driftTelemetry.rearSlip > 0.16 ? 'ЛОВИ ЗАЦЕП' : 'ГОТОВ'}</small></div>
      </div>
      <div className="drift-traction"><span>ЗАДНЯЯ ОСЬ</span><i><b style={{ width: `${Math.round(driftTelemetry.rearSlip * 100)}%` }} /></i><strong>{driftTelemetry.rearWheelsLocked ? 'РУЧНИК · БЛОКИРОВКА' : driftTelemetry.rearSlip > 0.16 ? 'СЦЕПЛЕНИЕ СОРВАНО' : 'ДЕРЖИТ ПОКРЫТИЕ'}</strong></div>
      {driftTelemetry.drifting && <div className="drift-callout">{driftTelemetry.rearWheelsLocked ? 'ЗАДНИЕ КОЛЁСА СОРВАНЫ' : 'ЛОВИМ ИНЕРЦИЮ'}</div>}
    </div>}
    {driftActive && <div className="drift-controls" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> газ / тормоз</span><span><kbd>←</kbd><kbd>→</kbd> руль</span><span><kbd>SPACE</kbd> ручник</span><span><kbd>R</kbd> вернуть телегу</span></div>}
  </div>;
}
