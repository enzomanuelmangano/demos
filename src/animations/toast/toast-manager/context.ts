import { createContext, useContext, type ReactNode } from 'react';

// Define the type for a toast
export type ToastType = {
  id: number;
  title: string | ReactNode;
  subtitle?: string | ReactNode;
  leading?: () => ReactNode;
  key?: string;
  autodismiss?: boolean;
};

// Create a context for managing toasts
export const ToastContext = createContext<{
  showToast: (toast: Omit<ToastType, 'id'>) => void;
}>({
  showToast: () => {}, // Default empty function for showToast
});

// Custom hook for accessing the ToastContext
export const useToast = () => {
  return useContext(ToastContext);
};

// Why did I create two contexts?
// The first one is for general use.
// If you want to show a Toast:
// 1. You don't need to know the internal details of the ToastProvider.
// 2. You don't need to re-render the component when the internal state of the ToastProvider changes.

// The second one is for internal use.
// This is used to update the internal state of each Toast.
// It is used to calculate the position of each Toast based on its ID.

export type InternalToastContextType = {
  toasts: ToastType[];
};

export const InternalToastContext = createContext<InternalToastContextType>({
  toasts: [],
});
