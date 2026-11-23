import { type ReactNode, createContext } from 'react';

export type StackedToastType = {
  id: number;
  key: string;
  children?: () => ReactNode;
};

export const StackedToastContext = createContext<{
  showStackedToast: (StackedToast: Omit<StackedToastType, 'id'>) => void;
  clearAllStackedToasts: () => void;
}>({
  showStackedToast: () => {},
  clearAllStackedToasts: () => {},
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
  createContext<InternalStackedToastContextType>({
    stackedToasts: [],
  });
