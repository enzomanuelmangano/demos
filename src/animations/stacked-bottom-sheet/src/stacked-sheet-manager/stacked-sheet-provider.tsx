import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FC,
  type PropsWithChildren,
  type ReactNode,
} from 'react';

import {
  InternalStackedSheetContext,
  StackedSheetContext,
  type StackedSheetType,
} from './context';
import { StackedSheet } from './stacked-sheet';

export const StackedSheetProvider: FC<PropsWithChildren> = ({ children }) => {
  // State to manage the list of StackedSheets
  const [stackedSheets, setStackedSheets] = useState<StackedSheetType[]>([]);
  // const [stackedSheets, setStackedSheets] = useAtom(StackedSheetsAtom);

  const showStackedSheet = useCallback(
    (stackedSheet: Omit<StackedSheetType, 'id'>) => {
      setStackedSheets(prev => {
        // Update the IDs and add the new StackedSheet to the list
        const updatedPrev = prev.map(item => ({
          ...item,
          id: item.id + 1,
        }));

        return [...updatedPrev, { ...stackedSheet, id: 0 }];
      });
    },
    [setStackedSheets],
  );

  const sortedStackedSheets = useMemo(() => {
    return stackedSheets.sort((a, b) => a.id - b.id);
  }, [stackedSheets]);

  // Function to dismiss a StackedSheet by its ID
  const onDismiss = useCallback(
    (StackedSheetId: number) => {
      setStackedSheets(prev => {
        return prev
          .map(item => {
            // Set the item to null if its ID matches the dismissed ID
            if (item.id === StackedSheetId) {
              return null;
            }

            // Decrement the ID for StackedSheets with higher IDs than the dismissed StackedSheet
            if (item.id > StackedSheetId) {
              return {
                ...item,
                id: item.id - 1,
              };
            }

            return item;
          })
          .filter(Boolean) as StackedSheetType[]; // Filter out null values and cast to StackedSheetType
      });
    },
    [setStackedSheets],
  );

  const value = useMemo(() => {
    return {
      showStackedSheet,
    };
  }, [showStackedSheet]);

  const stackedSheetsMemoizedByKeys = useRef<
    Record<string | number, ReactNode>
  >({});

  const renderStackedSheet = useCallback(
    (stackedSheet: StackedSheetType, index: number) => {
      const key = stackedSheet.key || stackedSheet.id;

      if (stackedSheetsMemoizedByKeys.current[key]) {
        return stackedSheetsMemoizedByKeys.current[key];
      }

      const stackedSheetNode = (
        <StackedSheet
          stackedSheet={stackedSheet}
          key={stackedSheet.key || stackedSheet.id}
          index={index}
          onDismiss={onDismiss}
        />
      );

      stackedSheetsMemoizedByKeys.current[key] = stackedSheetNode;
      return stackedSheetNode;
    },
    [onDismiss],
  );

  const internalStackedSheetValue = useMemo(() => {
    return {
      stackedSheets,
    };
  }, [stackedSheets]);

  return (
    <StackedSheetContext.Provider value={value}>
      <InternalStackedSheetContext.Provider value={internalStackedSheetValue}>
        {children}
        {sortedStackedSheets.map((stackedSheet, index) => {
          // Render each StackedSheet component with the given key, StackedSheet, index, and onDismiss function
          return renderStackedSheet(stackedSheet, index);
        })}
      </InternalStackedSheetContext.Provider>
    </StackedSheetContext.Provider>
  );
};
