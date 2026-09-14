import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import alarmCatalog from '../../alarm-catalog.json';
import { EquipmentInspector } from './EquipmentInspector';
import { equipmentIssues, inspectionKey, inspectionSlot, type InspectionTarget, type InspectionNode, type EquipmentInspection } from '../model/equipmentInspection';
import type { CellLogEvent, PlcAlarmEvent } from '../plc/client';
import { Camera, LayoutPanelLeft, LayoutPanelTop, PanelBottom, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  CellLayout,
  CellState,
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
  controlsVisible?: boolean;
  onMachineSelect: (index: number) => void;
  onMagazineSelect?: (magazineId: 1 | 2) => void;
  easterEggMode?: EasterEggMode;
  easterEggRevision?: number;
  driftSettings?: DriftSettings;
  visualEffects?: VisualEffectSettings;
  sceneActivity?: SceneActivity;
  focusTarget?: SceneEquipmentTarget | null;
  inspectionAvailable?: boolean;
  inspectionEvents?: PlcAlarmEvent[];
  inspectionDataMode?: 'live' | 'stale' | 'local';
  latestCellLogEvent?: CellLogEvent | null;
  onInspectionOpenChange?: (open: boolean) => void;
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
  controlsVisible = true,
  onMachineSelect,
  onMagazineSelect,
  easterEggMode = 'off',
  easterEggRevision = 0,
  driftSettings = DEFAULT_DRIFT_SETTINGS,
  visualEffects = DEFAULT_VISUAL_EFFECT_SETTINGS,
  sceneActivity = EMPTY_SCENE_ACTIVITY,
  focusTarget = null,
  inspectionAvailable = false,
  inspectionEvents = [],
  inspectionDataMode = 'local',
  latestCellLogEvent = null,
  onInspectionOpenChange,
  equipmentStatuses,
}: CellViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CellScene>();
  const [inspectionTarget, setInspectionTarget] = useState<InspectionTarget | null>(null);
  const [inspectionClosing, setInspectionClosing] = useState(false);
  const [inspectionNode, setInspectionNode] = useState<InspectionNode | null>(null);
  const [inspectionXray, setInspectionXray] = useState(true);
  const inspection = useMemo<EquipmentInspection | null>(() => inspectionTarget ? {
    target: inspectionTarget, selectedNode: inspectionNode, xray: inspectionXray,
    issues: equipmentIssues(inspectionTarget, inspectionEvents, state, inspectionDataMode !== 'local', alarmCatalog.alarms),
  } : null, [inspectionTarget, inspectionNode, inspectionXray, inspectionEvents, state, inspectionDataMode]);
  const openInspection = (target: InspectionTarget, node?: InspectionNode) => {
    if (!inspectionAvailable || easterEggMode !== 'off') return;
    setInspectionClosing(false);
    if (!inspectionTarget || inspectionKey(target) !== inspectionKey(inspectionTarget)) setInspectionNode(null);
    else if (node) setInspectionNode(node);
    setInspectionTarget(target);
  };
  const inspectRef = useRef(openInspection);
  inspectRef.current = openInspection;
  const closeInspection = useCallback(() => setInspectionClosing(true), []);

  useEffect(() => {
    onInspectionOpenChange?.(inspectionTarget !== null);
  }, [inspectionTarget !== null, onInspectionOpenChange]);
  useEffect(() => {
    if (inspectionTarget && (!inspectionAvailable || easterEggMode !== 'off')) closeInspection();
  }, [inspectionAvailable, easterEggMode, inspectionTarget, closeInspection]);
  useEffect(() => {
    if (!inspectionClosing) return;
    const timeout = window.setTimeout(() => {
      setInspectionTarget(null);
      setInspectionClosing(false);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260);
    return () => window.clearTimeout(timeout);
  }, [inspectionClosing]);
  const [driftTelemetry, setDriftTelemetry] = useState<DriftTelemetry>(EMPTY_DRIFT_TELEMETRY);
  const [cameraViewOpen, setCameraViewOpen] = useState(false);
  const [cameraViewMounted, setCameraViewMounted] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomMounted, setZoomMounted] = useState(false);
  const [activeCameraPreset, setActiveCameraPreset] = useState<CameraPreset>(cameraPreset);
  const [zoomLevel, setZoomLevel] = useState(0.42);
  const fallbackRobotCoordinatesRef = useRef<RobotCoordinateFrame>({
    sequence: 0,
    timestampMs: Date.now(),
    sourceTimestampMs: Date.now(),
    coordinates: { x: state.robot.x, y: state.robot.y, z: state.robot.z },
  });
  const selectRef = useRef(onMachineSelect);
  const magazineSelectRef = useRef(onMagazineSelect);
  const machineStatusRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const magazineStatusRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    selectRef.current = onMachineSelect;
  }, [onMachineSelect]);

  useEffect(() => {
    magazineSelectRef.current = onMagazineSelect;
  }, [onMagazineSelect]);

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
      setDriftTelemetry,
      (target, node) => inspectRef.current(target, node),
    );
    sceneRef.current = scene;
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
  useEffect(() => sceneRef.current?.setInspectionEnabled(inspectionAvailable && easterEggMode === 'off'), [inspectionAvailable, easterEggMode]);
  useEffect(() => sceneRef.current?.setInspection(inspectionClosing ? null : inspection), [inspection, inspectionClosing]);
  useEffect(() => sceneRef.current?.setEasterEgg(easterEggMode, easterEggRevision), [easterEggMode, easterEggRevision]);
  useEffect(() => sceneRef.current?.setDriftSettings(driftSettings), [driftSettings]);
  useEffect(() => sceneRef.current?.setVisualEffects(visualEffects), [visualEffects]);
  useEffect(() => sceneRef.current?.setSceneActivity(sceneActivity), [sceneActivity]);
  useEffect(() => sceneRef.current?.setFocusTarget(focusTarget), [focusTarget]);
  useEffect(() => sceneRef.current?.rebuild(layout), [layout]);
  useEffect(() => sceneRef.current?.setSelectedMachine(selectedMachine), [selectedMachine]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setCamera(cameraPreset);
    setActiveCameraPreset(cameraPreset);
    setZoomLevel(scene.getZoomLevel());
  }, [cameraPreset]);

  useEffect(() => {
    if (controlsVisible && easterEggMode !== 'drift') return;
    setCameraViewOpen(false);
    setCameraViewMounted(false);
    setZoomOpen(false);
    setZoomMounted(false);
  }, [controlsVisible, easterEggMode]);

  useEffect(() => {
    if (cameraViewOpen) {
      setCameraViewMounted(true);
      return;
    }
    if (!cameraViewMounted) return;
    const timeoutId = window.setTimeout(() => setCameraViewMounted(false), 280);
    return () => window.clearTimeout(timeoutId);
  }, [cameraViewMounted, cameraViewOpen]);

  useEffect(() => {
    if (zoomOpen) {
      setZoomMounted(true);
      return;
    }
    if (!zoomMounted) return;
    const timeoutId = window.setTimeout(() => setZoomMounted(false), 260);
    return () => window.clearTimeout(timeoutId);
  }, [zoomMounted, zoomOpen]);

  const selectCameraPreset = (preset: CameraPreset): void => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setCamera(preset);
    setActiveCameraPreset(preset);
    setZoomLevel(scene.getZoomLevel());
    setCameraViewOpen(false);
  };

  const toggleCameraView = (): void => {
    setZoomOpen(false);
    setCameraViewOpen((open) => !open);
  };

  const toggleZoom = (): void => {
    if (!zoomOpen) setZoomLevel(sceneRef.current?.getZoomLevel() ?? zoomLevel);
    setCameraViewOpen(false);
    setZoomOpen((open) => !open);
  };

  const changeZoom = (value: number): void => {
    const normalized = Math.max(0, Math.min(1, value));
    setZoomLevel(normalized);
    sceneRef.current?.setZoomLevel(normalized);
  };

  const driftActive = easterEggMode === 'drift';
  return <div ref={hostRef} className={`cell-viewport${driftActive ? ' drift-mode' : ''}${inspection ? ' inspection-mode' : ''}`} aria-label="Трехмерная модель ячейки">
    {inspection && <EquipmentInspector inspection={inspection} closing={inspectionClosing} dataMode={inspectionDataMode} liveEvent={latestCellLogEvent}
      slot={inspectionSlot(state, inspection.target)} onTarget={openInspection} onNode={(node) => { setInspectionNode(node); sceneRef.current?.refocusInspection(); }} onXray={setInspectionXray} onClose={closeInspection} />}
    {controlsVisible && !driftActive && !inspection && <div className="scene-view-controls" aria-label="Управление видом и масштабом">
      <div className="scene-view-control-cluster">
        <button
          className={`scene-view-control${cameraViewOpen ? ' active' : ''}`}
          type="button"
          aria-label="Выбрать вид камеры"
          aria-expanded={cameraViewOpen}
          title="Вид"
          onClick={toggleCameraView}
        >
          <Camera aria-hidden="true" />
        </button>
        {cameraViewMounted && <div className={`scene-view-control-panel scene-view-preset-panel ${cameraViewOpen ? 'ios-motion' : 'ios-motion-exiting'}`} role="group" aria-label="Вид камеры">
          <button className={activeCameraPreset === 'top' ? 'active' : ''} type="button" aria-pressed={activeCameraPreset === 'top'} onClick={() => selectCameraPreset('top')} title="Вид сверху">
            <LayoutPanelTop aria-hidden="true" /><span>Сверху</span>
          </button>
          <button className={activeCameraPreset === 'side' ? 'active' : ''} type="button" aria-pressed={activeCameraPreset === 'side'} onClick={() => selectCameraPreset('side')} title="Вид сбоку">
            <LayoutPanelLeft aria-hidden="true" /><span>Сбоку</span>
          </button>
          <button className={activeCameraPreset === 'front' ? 'active' : ''} type="button" aria-pressed={activeCameraPreset === 'front'} onClick={() => selectCameraPreset('front')} title="Вид спереди">
            <PanelBottom aria-hidden="true" /><span>Спереди</span>
          </button>
        </div>}
      </div>
      <div className="scene-view-control-cluster">
        <button
          className={`scene-view-control${zoomOpen ? ' active' : ''}`}
          type="button"
          aria-label="Настроить масштаб"
          aria-expanded={zoomOpen}
          title="Масштаб"
          onClick={toggleZoom}
        >
          <ZoomIn aria-hidden="true" />
        </button>
        {zoomMounted && <div className={`scene-view-control-panel scene-view-zoom-panel ${zoomOpen ? 'ios-motion' : 'ios-motion-exiting'}`} role="group" aria-label="Масштаб сцены">
          <ZoomOut aria-hidden="true" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={zoomLevel}
            onChange={(event) => changeZoom(Number(event.currentTarget.value))}
            aria-label="Масштаб от минимального до максимального"
          />
          <ZoomIn aria-hidden="true" />
          <output>{Math.round(zoomLevel * 100)}%</output>
        </div>}
      </div>
    </div>}
    {equipmentStatuses && !driftActive && !inspection && <div className="equipment-status-layer" aria-label="Состояния оборудования">
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
