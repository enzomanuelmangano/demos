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
