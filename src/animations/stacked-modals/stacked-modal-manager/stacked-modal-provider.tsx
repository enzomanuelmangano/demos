import type { PropsWithChildren } from 'react';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react';

import { Backdrop } from './backdrop';
import {
  InternalStackedModalContext,
  StackedModalContext,
  type StackedModalType,
} from './context';
import { StackedModal } from './stacked-modal';

// Define a StackedModalProvider component to manage and display StackedModals
export const StackedModalProvider: FC<PropsWithChildren> = ({ children }) => {
  // State to manage the list of StackedModals
  const [stackedModals, setStackedModals] = useState<StackedModalType[]>([]);

  // Function to show a new StackedModal
  const showStackedModal = useCallback(
    (stackedSheet: Omit<StackedModalType, 'id'>) => {
      setStackedModals(prev => {
        // Update the IDs and add the new StackedModal to the list
        const updatedPrev = prev.map(item => ({
          ...item,
          id: item.id + 1,
        }));

        return [...updatedPrev, { ...stackedSheet, id: 0 }];
      });
    },
    [setStackedModals],
  );

  const sortedStackedModals = useMemo(() => {
    return stackedModals.sort((a, b) => a.id - b.id);
  }, [stackedModals]);

  const clearModal = useCallback(
    (key: string) => {
      setStackedModals(prev => {
        const filteredModals = prev.filter(item => item.key !== key);
        return filteredModals.map((modal, index) => ({
          ...modal,
          id: index,
        }));
      });
    },
    [setStackedModals],
  );

  const clearAllStackedModals = useCallback(() => {
    setStackedModals([]);
  }, [setStackedModals]);

  // Memoized context value containing the showStackedModal function
  const value = useMemo(() => {
    return {
      showStackedModal,
      clearAllStackedModals,
      clearModal,
    };
  }, [clearAllStackedModals, showStackedModal, clearModal]);

  const stackedModalsMemoizedByKeys = useRef<
    Record<string | number, ReactNode>
  >({});

  const renderStackedModal = useCallback(
    (stackedSheet: StackedModalType, index: number) => {
      const key = stackedSheet.key || stackedSheet.id;

      if (stackedModalsMemoizedByKeys.current[key]) {
        return stackedModalsMemoizedByKeys.current[key];
      }

      const stackedSheetNode = (
        <StackedModal
          stackedSheet={stackedSheet}
          key={stackedSheet.key || stackedSheet.id}
          index={index}
        />
      );

      stackedModalsMemoizedByKeys.current[key] = stackedSheetNode;
      return stackedSheetNode;
    },
    [],
  );

  const internalStackedModalValue = useMemo(() => {
    return {
      stackedModals,
    };
  }, [stackedModals]);

  // Render the StackedModalContext.Provider with children and mapped StackedModal components
  return (
    <StackedModalContext.Provider value={value}>
      <InternalStackedModalContext.Provider value={internalStackedModalValue}>
        {children}
        {sortedStackedModals.map((stackedSheet, index) => {
          // Render each StackedModal component with the given key, StackedModal, index, and onDismiss function
          return renderStackedModal(stackedSheet, index);
        })}
        <Backdrop />
      </InternalStackedModalContext.Provider>
    </StackedModalContext.Provider>
  );
};
