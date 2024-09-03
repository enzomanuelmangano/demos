import type { PropsWithChildren } from 'react';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import {
  InternalStackedToastContext,
  StackedToastContext,
  type StackedToastType,
} from './context';
import { StackedToast } from './stacked-toast';
import { Backdrop } from './backdrop';

// Define a StackedToastProvider component to manage and display StackedToasts
export const StackedToastProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  // State to manage the list of StackedToasts
  const [stackedToasts, setStackedToasts] = useState<StackedToastType[]>([]);

  // Function to show a new StackedToast
  const showStackedToast = useCallback(
    (stackedSheet: Omit<StackedToastType, 'id'>) => {
      setStackedToasts(prev => {
        // Update the IDs and add the new StackedToast to the list
        const updatedPrev = prev.map(item => ({
          ...item,
          id: item.id + 1,
        }));

        return [...updatedPrev, { ...stackedSheet, id: 0 }];
      });
    },
    [setStackedToasts],
  );

  // Memoized sorted list of StackedToasts based on their IDs
  const sortedStackedToasts = useMemo(() => {
    return stackedToasts.sort((a, b) => a.id - b.id);
  }, [stackedToasts]);

  // Function to dismiss a StackedToast by its ID
  const onDismiss = useCallback(
    (StackedToastId: number) => {
      setStackedToasts(prev => {
        return prev
          .map(item => {
            // Set the item to null if its ID matches the dismissed ID
            if (item.id === StackedToastId) {
              return null;
            }

            // Decrement the ID for StackedToasts with higher IDs than the dismissed StackedToast
            if (item.id > StackedToastId) {
              return {
                ...item,
                id: item.id - 1,
              };
            }

            return item;
          })
          .filter(Boolean) as StackedToastType[]; // Filter out null values and cast to StackedToastType
      });
    },
    [setStackedToasts],
  );

  const clearAllStackedToasts = useCallback(() => {
    setStackedToasts([]);
  }, [setStackedToasts]);

  // Memoized context value containing the showStackedToast function
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

  // Render the StackedToastContext.Provider with children and mapped StackedToast components
  return (
    <StackedToastContext.Provider value={value}>
      <InternalStackedToastContext.Provider value={internalStackedToastValue}>
        {children}
        {sortedStackedToasts.map((stackedSheet, index) => {
          // Render each StackedToast component with the given key, StackedToast, index, and onDismiss function
          return renderStackedToast(stackedSheet, index);
        })}
        <Backdrop />
      </InternalStackedToastContext.Provider>
    </StackedToastContext.Provider>
  );
};
