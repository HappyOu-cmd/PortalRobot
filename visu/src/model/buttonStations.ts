import type { EnclosureDoorId } from './types';

export interface ButtonStationState {
  emergencyStopPressed: boolean;
  buttonPressed: boolean;
  buttonLightOn: boolean;
}

export type ButtonStationStates = Record<EnclosureDoorId, ButtonStationState>;

/** Optional GVL_HMI feedback; TRUE means pressed, regardless of physical contact polarity. */
export const BUTTON_STATIONS = [
  { id: 'magazine-1-front', plcIndex: 1 },
  { id: 'magazine-1-rear', plcIndex: 2 },
  { id: 'magazine-2-front', plcIndex: 3 },
  { id: 'magazine-2-rear', plcIndex: 4 },
] as const;

export const DEFAULT_BUTTON_STATION_STATE: Readonly<ButtonStationState> = {
  emergencyStopPressed: false,
  buttonPressed: false,
  buttonLightOn: false,
};

export const DEFAULT_BUTTON_STATIONS: ButtonStationStates = {
  'magazine-1-front': { ...DEFAULT_BUTTON_STATION_STATE },
  'magazine-1-rear': { ...DEFAULT_BUTTON_STATION_STATE },
  'magazine-2-front': { ...DEFAULT_BUTTON_STATION_STATE },
  'magazine-2-rear': { ...DEFAULT_BUTTON_STATION_STATE },
};
