import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FC,
  type PropsWithChildren,
} from 'react';

import {
  InternalToastContext,
  ToastContext,
  type ToastType,
} from './context';
import { Toast } from './toast';

export const ToastProvider: FC<PropsWithChildren> = ({ children }) => {
  // State to manage the list of toasts
  const [toasts, setToasts] = useState<ToastType[]>([]);

  // Function to show a new toast
  const showToast = useCallback((toast: Omit<ToastType, 'id'>) => {
    setToasts(prev => {
      // Check if there are too many toasts
      if (prev.length > 5) {
        console.warn('Too many toasts');
        return prev;
      }

      // Generate a unique key if not provided
      const key =
        toast.key ||
        (typeof toast.title === 'string'
          ? `${toast.title}-${Date.now()}`
          : `toast-${Date.now()}`);

      // Update the IDs and add the new toast to the list
      const updatedPrev = prev.map(item => ({
        ...item,
        leading: item.leading,
        id: item.id + 1,
      }));
      return [...updatedPrev, { ...toast, key, id: 0 }];
    });
  }, []);

  const sortedToasts = useMemo(() => {
    return toasts.sort((a, b) => a.id - b.id);
  }, [toasts]);

  // Function to dismiss a toast by its ID
  const onDismiss = useCallback((toastId: number) => {
    setToasts(prev => {
      return prev
        .map(item => {
          // Set the item to null if its ID matches the dismissed ID
          if (item.id === toastId) {
            return null;
          }

          // Decrement the ID for toasts with higher IDs than the dismissed toast
          if (item.id > toastId) {
            return {
              ...item,
              id: item.id - 1,
            };
          }

          return item;
        })
        .filter(Boolean) as ToastType[];
    });
  }, []);

  const value = useMemo(() => {
    return {
      showToast,
    };
  }, [showToast]);

  // Memoize toast components by key to prevent re-creation
  const toastsMemoizedByKeys = useRef<Record<string, React.ReactNode>>({});

  const renderToast = useCallback(
    (toast: ToastType, index: number) => {
      const key = toast.key || `toast-${toast.id}`;

      if (toastsMemoizedByKeys.current[key]) {
        return toastsMemoizedByKeys.current[key];
      }

      const toastNode = (
        <Toast key={key} toastKey={key} index={index} onDismiss={onDismiss} />
      );

      toastsMemoizedByKeys.current[key] = toastNode;
      return toastNode;
    },
    [onDismiss],
  );

  const internalToastValue = useMemo(() => {
    return {
      toasts,
    };
  }, [toasts]);

  return (
    <ToastContext.Provider value={value}>
      <InternalToastContext.Provider value={internalToastValue}>
        {children}
        {sortedToasts.map((toast, index) => {
          return renderToast(toast, index);
        })}
      </InternalToastContext.Provider>
    </ToastContext.Provider>
  );
};
