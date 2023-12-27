// Import React and useContext from React library
import React, { useContext } from 'react';

// Define the type for a toast
export type ToastType = {
  id: number;
  title: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  leading?: () => React.ReactNode;
  key?: string;
  autodismiss?: boolean;
};

// Create a context for managing toasts
export const ToastContext = React.createContext<{
  showToast: (toast: Omit<ToastType, 'id'>) => void;
}>({
  showToast: () => {}, // Default empty function for showToast
});

// Custom hook for accessing the ToastContext
export const useToast = () => {
  return useContext(ToastContext);
};
