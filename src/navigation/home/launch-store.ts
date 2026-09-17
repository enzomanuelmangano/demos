import { useSyncExternalStore } from 'react';

import type { LaunchSource } from './launch-transition';

export interface LaunchTarget {
  slug: string;
  source: LaunchSource;
  /** The launch this target belongs to (see `launchSession`). */
  token: number;
}

// The demo the launcher is opening. Not a route param: the launch route is
// preloaded before anyone taps (see app/launch.tsx), so the demo it shows is
// named here, on the tap, and read by that already-mounted screen.
let target: LaunchTarget | null = null;
const listeners = new Set<() => void>();

export const setLaunchTarget = (next: LaunchTarget | null) => {
  if (target === next) return;
  target = next;
  listeners.forEach(listener => listener());
};

/** Forget the target, if it is still this launch's. */
export const clearLaunchTarget = (token: number) => {
  if (target?.token === token) setLaunchTarget(null);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getTarget = () => target;

export const useLaunchTarget = () =>
  useSyncExternalStore(subscribe, getTarget, getTarget);
