// Import createContext from React library
import { createContext, type ReactNode } from 'react';

// Define the type for a StackedModal
export type StackedModalType = {
  id: number;
  key: string;
  children?: () => ReactNode;
};

// Create a context for managing StackedModals
export const StackedModalContext = createContext<{
  showStackedModal: (StackedModal: Omit<StackedModalType, 'id'>) => void;
  clearAllStackedModals: () => void;
  clearModal: (key: string) => void;
}>({
  showStackedModal: () => {}, // Default empty function for showStackedModal
  clearAllStackedModals: () => {}, // Default empty function for clearAllStackedModals
  clearModal: () => {}, // Default empty function for clearModal
});

// Why did I create two contexts?
// The first one is for general use.
// If you want to show a StackedModal:
// 1. You don't need to know the internal details of the StackedModalProvider.
// 2. You don't need to re-render the component when the internal state of the StackedModalProvider changes.

// The second one is for internal use.
// This is used to update the internal state of each StackedModal.
// It is used to calculate the position of each StackedModal based on its ID.
// You can see the usage of this context in the hooks.ts file.

export type InternalStackedModalContextType = {
  stackedModals: StackedModalType[];
};

export const InternalStackedModalContext =
  createContext<InternalStackedModalContextType>({
    stackedModals: [],
  });
