import { useCallback, useMemo, useState } from 'react';

export const useInternalNavigation = <
  T extends Record<string, (props?: any) => React.ReactElement>,
>() => {
  type ScreenHistoryEntry = {
    screen: keyof T;
    props?: Parameters<T[keyof T]>[number];
  };

  const [history, setHistory] = useState<ScreenHistoryEntry[]>([]);

  // Current screen is always the last item in history
  const currentScreen = useMemo(
    () => (history.length > 0 ? history?.[history.length - 1]?.screen : null),
    [history],
  );

  // Current screen props
  const screenProps = useMemo(() => {
    const props: Record<keyof T, any> = {} as Record<keyof T, any>;
    history.forEach(entry => {
      if (entry.props) {
        props[entry.screen] = entry.props;
      }
    });
    return props;
  }, [history]);

  const navigateToScreen = useCallback(
    (screen: keyof T, props?: Parameters<T[keyof T]>[number]) => {
      setHistory(prev => [...prev, { screen, props }]);
    },
    [],
  );

  const replaceScreen = useCallback(
    (screen: keyof T, props?: Parameters<T[keyof T]>[number]) => {
      setHistory([{ screen, props }]);
    },
    [],
  );

  const goBack = useCallback(() => {
    setHistory(prev => (prev.length > 1 ? prev.slice(0, -1) : []));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    currentScreen,
    screenHistory: history.map(entry => entry.screen),
    screenProps,
    navigateToScreen,
    replaceScreen,
    goBack,
    clearHistory,
  };
};
