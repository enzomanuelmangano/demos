// Import React and useContext from React library
import React from 'react';

// Define the type for a StackedToast
export type StackedToastType = {
  id: number;
  key: string;
  children?: () => React.ReactNode;
};

// Create a context for managing StackedToasts
export const StackedToastContext = React.createContext<{
  showStackedToast: (StackedToast: Omit<StackedToastType, 'id'>) => void;
  clearAllStackedToasts: () => void;
}>({
  showStackedToast: () => {}, // Default empty function for showStackedToast
  clearAllStackedToasts: () => {}, // Default empty function for clearAllStackedToasts
});

// Why did I create two contexts?
// The first one is for general use.
// If you want to show a StackedToast:
// 1. You don't need to know the internal details of the StackedToastProvider.
// 2. You don't need to re-render the component when the internal state of the StackedToastProvider changes.

// The second one is for internal use.
// This is used to update the internal state of each StackedToast.
// It is used to calculate the position of each StackedToast based on its ID.
// You can see the usage of this context in the hooks.ts file.

export type InternalStackedToastContextType = {
  stackedToasts: StackedToastType[];
};

export const InternalStackedToastContext =
  React.createContext<InternalStackedToastContextType>({
    stackedToasts: [],
  });
