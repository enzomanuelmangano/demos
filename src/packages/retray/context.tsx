import { createContext } from 'react';

import type { SharedValue } from 'react-native-reanimated';

export type RetrayScreen<
  T extends Record<string, (props?: any) => React.ReactElement>,
> = T;

export type RetrayRef = {
  isActive: () => boolean;
  close: () => void;
  open: () => void;
};

export type RetrayState<
  T extends Record<string, (props?: any) => React.ReactElement>,
> = {
  currentScreen: keyof T | null;
  screenHistory: (keyof T)[];
  screenProps: { [K in keyof T]?: Parameters<T[K]>[number] };
  isActive: SharedValue<boolean>;
};

export type RetrayActions<
  T extends Record<string, (props?: any) => React.ReactElement>,
> = {
  show: <K extends keyof T>(
    screenKey: K,
    props?: Parameters<T[K]>[number],
  ) => void;
  dismiss: () => void;
  goBack: () => void;
};

export type RetrayMeta = {
  trayRef: React.RefObject<RetrayRef | null>;
};

export type RetrayContextProps<
  T extends Record<string, (props?: any) => React.ReactElement>,
> = {
  state: RetrayState<T>;
  actions: RetrayActions<T>;
  meta: RetrayMeta;
};

export const RetrayContext = createContext<RetrayContextProps<any>>({
  state: {
    currentScreen: null,
    screenHistory: [],
    screenProps: {},
    isActive: { value: false } as SharedValue<boolean>,
  },
  actions: {
    show: () => undefined,
    dismiss: () => undefined,
    goBack: () => undefined,
  },
  meta: {
    trayRef: { current: null },
  },
});
