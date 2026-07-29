import { useEffect, useRef } from 'react';
import type { CellLayout, CellState } from '../model/types';
import { CellScene, type CameraPreset } from '../three/cellScene';

interface CellViewportProps {
  layout: CellLayout;
  state: CellState;
  selectedMachine: number | null;
  cameraPreset: CameraPreset;
  onMachineSelect: (index: number) => void;
}

export function CellViewport({
  layout,
  state,
  selectedMachine,
  cameraPreset,
  onMachineSelect,
}: CellViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CellScene>();
  const selectRef = useRef(onMachineSelect);

  useEffect(() => {
    selectRef.current = onMachineSelect;
  }, [onMachineSelect]);

  useEffect(() => {
    if (!hostRef.current) return;
    const scene = new CellScene(hostRef.current, layout, state, (index) => selectRef.current(index));
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

  return <div ref={hostRef} className="cell-viewport" aria-label="Трехмерная модель ячейки" />;
}
