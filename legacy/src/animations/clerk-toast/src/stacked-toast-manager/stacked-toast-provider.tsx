import {
  type FC,
  useCallback,
  useMemo,
  useRef,
  useState,
  PropsWithChildren,
} from 'react';

import { Backdrop } from './backdrop';
import {
  InternalStackedToastContext,
  StackedToastContext,
  type StackedToastType,
} from './context';
import { StackedToast } from './stacked-toast';

export const StackedToastProvider: FC<PropsWithChildren> = ({ children }) => {
  const [stackedToasts, setStackedToasts] = useState<StackedToastType[]>([]);

  const showStackedToast = useCallback(
    (stackedSheet: Omit<StackedToastType, 'id'>) => {
      setStackedToasts(prev => {
        const updatedPrev = prev.map(item => ({
          ...item,
          id: item.id + 1,
        }));

        return [...updatedPrev, { ...stackedSheet, id: 0 }];
      });
    },
    [setStackedToasts],
  );

  const sortedStackedToasts = useMemo(() => {
    return stackedToasts.sort((a, b) => a.id - b.id);
  }, [stackedToasts]);

  const onDismiss = useCallback(
    (StackedToastId: number) => {
      setStackedToasts(prev => {
        return prev
          .map(item => {
            if (item.id === StackedToastId) {
              return null;
            }

            if (item.id > StackedToastId) {
              return {
                ...item,
                id: item.id - 1,
              };
            }

            return item;
          })
          .filter(Boolean) as StackedToastType[];
      });
    },
    [setStackedToasts],
  );

  const clearAllStackedToasts = useCallback(() => {
    setStackedToasts([]);
  }, [setStackedToasts]);

  const value = useMemo(() => {
    return {
      showStackedToast,
      clearAllStackedToasts,
    };
  }, [clearAllStackedToasts, showStackedToast]);

  const stackedToastsMemoizedByKeys = useRef<
    Record<string | number, React.ReactNode>
  >({});

  const renderStackedToast = useCallback(
    (stackedSheet: StackedToastType, index: number) => {
      const key = stackedSheet.key || stackedSheet.id;

      if (stackedToastsMemoizedByKeys.current[key]) {
        return stackedToastsMemoizedByKeys.current[key];
      }

      const stackedSheetNode = (
        <StackedToast
          stackedSheet={stackedSheet}
          key={stackedSheet.key || stackedSheet.id}
          index={index}
          onDismiss={onDismiss}
        />
      );

      stackedToastsMemoizedByKeys.current[key] = stackedSheetNode;
      return stackedSheetNode;
    },
    [onDismiss],
  );

  const internalStackedToastValue = useMemo(() => {
    return {
      stackedToasts,
    };
  }, [stackedToasts]);

  return (
    <StackedToastContext.Provider value={value}>
      <InternalStackedToastContext.Provider value={internalStackedToastValue}>
        {children}
        {sortedStackedToasts.map((stackedSheet, index) => {
          return renderStackedToast(stackedSheet, index);
        })}
        <Backdrop />
      </InternalStackedToastContext.Provider>
    </StackedToastContext.Provider>
  );
};
