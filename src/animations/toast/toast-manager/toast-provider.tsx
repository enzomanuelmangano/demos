// Import necessary React components and types
import type { PropsWithChildren } from 'react';
import React, { useCallback, useMemo, useState } from 'react';

// Import the ToastContext and Toast component
import { ToastContext, type ToastType } from './context';
import { Toast } from './toast';

// Define a ToastProvider component to manage and display toasts
export const ToastProvider: React.FC<PropsWithChildren> = ({ children }) => {
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

      // Update the IDs and add the new toast to the list
      const updatedPrev = prev.map(item => ({
        ...item,
        leading: item.leading,
        id: item.id + 1,
      }));
      return [...updatedPrev, { ...toast, id: 0 }];
    });
  }, []);

  // Memoized sorted list of toasts based on their IDs
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
        .filter(Boolean) as ToastType[]; // Filter out null values and cast to ToastType
    });
  }, []);

  // Memoized context value containing the showToast function
  const value = useMemo(() => {
    return {
      showToast,
    };
  }, [showToast]);

  // Render the ToastContext.Provider with children and mapped Toast components
  return (
    <>
      <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
      {sortedToasts.map((toast, index) => {
        // Generate a unique key for each toast
        const textKey =
          typeof toast.title === 'string' ? toast.title : toast.id;
        const key = toast.key || textKey;

        // Render each Toast component with the given key, toast, index, and onDismiss function
        return (
          <Toast key={key} toast={toast} index={index} onDismiss={onDismiss} />
        );
      })}
    </>
  );
};
