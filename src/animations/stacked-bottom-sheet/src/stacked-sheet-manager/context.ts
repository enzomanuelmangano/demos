// Import React and useContext from React library
import React from 'react';

// Define the type for a StackedSheet
export type StackedSheetType = {
  id: number;
  key: string;
  componentHeight: number;
  children?: () => React.ReactNode;
};

// Create a context for managing StackedSheets
export const StackedSheetContext = React.createContext<{
  showStackedSheet: (StackedSheet: Omit<StackedSheetType, 'id'>) => void;
}>({
  showStackedSheet: () => {}, // Default empty function for showStackedSheet
});

// Why did I create two contexts?
// The first one is for general use.
// If you want to show a StackedSheet:
// 1. You don't need to know the internal details of the StackedSheetProvider.
// 2. You don't need to re-render the component when the internal state of the StackedSheetProvider changes.

// The second one is for internal use.
// This is used to update the internal state of each StackedSheet.
// It is used to calculate the position of each StackedSheet based on its ID.
// You can see the usage of this context in the hooks.ts file.

export type InternalStackedSheetContextType = {
  stackedSheets: StackedSheetType[];
};

export const InternalStackedSheetContext =
  React.createContext<InternalStackedSheetContextType>({
    stackedSheets: [],
  });
