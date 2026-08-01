import { useEffect, useRef } from 'react';
import type { CellLayout, CellState } from '../model/types';
import { CellScene, type CameraPreset, type EquipmentAnchors } from '../three/cellScene';

export interface EquipmentStatus {
  title: string;
  lines: string[];
  tone: 'blue' | 'green' | 'amber' | 'red' | 'gray';
}

interface CellViewportProps {
  layout: CellLayout;
  state: CellState;
  selectedMachine: number | null;
  cameraPreset: CameraPreset;
  onMachineSelect: (index: number) => void;
  onMagazineSelect?: () => void;
  equipmentStatuses?: {
    machines: EquipmentStatus[];
    magazine: EquipmentStatus;
  };
}

export function CellViewport({
  layout,
  state,
  selectedMachine,
  cameraPreset,
  onMachineSelect,
  onMagazineSelect,
  equipmentStatuses,
}: CellViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CellScene>();
  const selectRef = useRef(onMachineSelect);
  const machineStatusRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const magazineStatusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectRef.current = onMachineSelect;
  }, [onMachineSelect]);

  useEffect(() => {
    if (!hostRef.current) return;
    const updateAnchors = (anchors: EquipmentAnchors) => {
      anchors.machines.forEach((anchor, index) => {
        const element = machineStatusRefs.current[index];
        if (!element) return;
        element.style.transform = `translate3d(${anchor.x}px, ${anchor.y}px, 0) translate(-50%, 12px)`;
        element.style.visibility = anchor.visible ? 'visible' : 'hidden';
      });
      const magazine = magazineStatusRef.current;
      if (magazine) {
        magazine.style.transform = `translate3d(${anchors.magazine.x}px, ${anchors.magazine.y}px, 0) translate(-50%, 12px)`;
        magazine.style.visibility = anchors.magazine.visible ? 'visible' : 'hidden';
      }
    };
    const scene = new CellScene(hostRef.current, layout, state, (index) => selectRef.current(index), updateAnchors);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = undefined;
    };
  }, []);

  useEffect(() => sceneRef.current?.setState(state), [state]);
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
      <button ref={magazineStatusRef} className={`equipment-status ${equipmentStatuses.magazine.tone}`} type="button" onClick={onMagazineSelect}>
        <strong><i />{equipmentStatuses.magazine.title}</strong>
        {equipmentStatuses.magazine.lines.map((line, lineIndex) => <span key={`${line}-${lineIndex}`}>{line}</span>)}
      </button>
    </div>}
  </div>;
}
