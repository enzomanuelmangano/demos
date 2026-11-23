import React, {
  type PropsWithChildren,
  use,
  useMemo,
  useRef,
  useCallback,
} from 'react';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import { ActionTray } from '../components';
import {
  RetrayContext,
  type RetrayScreen,
  type RetrayRef,
  type RetrayActions,
  type RetrayContextProps,
} from '../context';
import {
  RetrayComponentsContext,
  defaultComponents,
  type RetrayComponents,
} from './components';
import { useInternalNavigation } from '../hooks/use-internal-navigation';

type RetrayProviderProps<
  T extends Record<string, (props?: any) => React.ReactElement>,
> = PropsWithChildren<{
  screens: RetrayScreen<T>;
  Header?: React.ComponentType;
  Backdrop?: React.ComponentType;
}>;

export const Provider = <
  T extends Record<string, (props?: any) => React.ReactElement>,
>({
  children,
  screens,
  Header,
  Backdrop,
}: RetrayProviderProps<T>) => {
  const {
    currentScreen,
    screenHistory,
    screenProps,
    navigateToScreen,
    replaceScreen,
    goBack,
    clearHistory,
  } = useInternalNavigation<T>();

  const trayRef = useRef<RetrayRef>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isActive = useSharedValue(false);

  const dismiss = useCallback(() => {
    trayRef.current?.close();
    timeoutRef.current = setTimeout(() => {
      clearHistory();
    }, 500);
  }, [clearHistory]);

  const show = useCallback(
    (screenKey: keyof T, props?: Parameters<T[keyof T]>[number]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (screenKey === null) {
        return dismiss();
      }

      if (screenHistory.length === 0) {
        replaceScreen(screenKey as keyof T, props);
        trayRef.current?.open();
      } else if (
        screenKey === currentScreen &&
        JSON.stringify(props) === JSON.stringify(screenProps[screenKey])
      ) {
        trayRef.current?.open();
      } else {
        navigateToScreen(screenKey as keyof T, props);
      }
    },
    [
      screenHistory.length,
      currentScreen,
      screenProps,
      dismiss,
      replaceScreen,
      navigateToScreen,
    ],
  );

  const handleGoBack = useCallback(() => {
    if (screenHistory.length > 1) {
      return goBack();
    }
    return dismiss();
  }, [screenHistory.length, goBack, dismiss]);

  const state = useMemo(
    () => ({
      currentScreen,
      screenHistory,
      screenProps: screenProps as Record<keyof T, any>,
      isActive,
    }),
    [currentScreen, screenHistory, screenProps, isActive],
  );

  const actions = useMemo(
    () => ({
      show,
      dismiss,
      goBack: handleGoBack,
    }),
    [show, dismiss, handleGoBack],
  );

  const meta = useMemo(
    () => ({
      trayRef,
    }),
    [trayRef],
  );

  const actionTrayProviderValue = useMemo(
    () =>
      ({
        state,
        actions,
        meta,
      }) as RetrayContextProps<T>,
    [state, actions, meta],
  );

  const currentComponent = useMemo(() => {
    return currentScreen && screens[currentScreen]
      ? screens[currentScreen](state.screenProps[currentScreen])
      : null;
  }, [currentScreen, screens, state.screenProps]);

  // Create components context value
  const components: RetrayComponents = useMemo(
    () => ({
      Header: Header || defaultComponents.Header,
      Backdrop: Backdrop || defaultComponents.Backdrop,
    }),
    [Header, Backdrop],
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <RetrayContext.Provider value={actionTrayProviderValue}>
        <RetrayComponentsContext.Provider value={components}>
          {children}
          <ActionTray>{currentComponent}</ActionTray>
        </RetrayComponentsContext.Provider>
      </RetrayContext.Provider>
    </GestureHandlerRootView>
  );
};

export const useRetray = <
  T extends Record<string, (props?: any) => React.ReactElement>,
>() => {
  const context = use(RetrayContext);
  if (!context) {
    throw new Error('useRetray must be used within a RetrayProvider');
  }
  return context.actions as RetrayActions<T>;
};

const styles = {
  container: {
    flex: 1,
  },
};
