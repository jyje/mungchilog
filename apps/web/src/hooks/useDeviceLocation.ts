import { useSyncExternalStore } from "react";
import { deviceLocationSource } from "../location/deviceLocation";

export function useDeviceLocation() {
  const state = useSyncExternalStore(deviceLocationSource.subscribe, deviceLocationSource.getSnapshot, deviceLocationSource.getServerSnapshot);
  return { ...state, requestLocation: deviceLocationSource.request };
}
