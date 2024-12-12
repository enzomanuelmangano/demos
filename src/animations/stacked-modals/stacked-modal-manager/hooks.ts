import { useContext, useMemo } from 'react'; // Importing useContext and useMemo hooks from React

import { InternalStackedModalContext, StackedModalContext } from './context'; // Importing custom context objects
import { MAX_VISIBLE_MODALS } from './constants';

// Custom hook to access the stacked modal context
export const useStackedModal = () => {
  return useContext(StackedModalContext); // Using useContext hook to access StackedModalContext
};

// Custom hook to access internal stacked modal information based on a key
export const useInternalStackedModal = (key: string) => {
  const { stackedModals } = useContext(InternalStackedModalContext); // Extracting stackedModals from InternalStackedModalContext

  const id = useMemo(() => {
    // Using useMemo to memoize the ID calculation based on changes in key or stackedModals

    // Finding the ID of the stacked modal with the provided key
    return stackedModals.find(item => item.key === key)?.id;
  }, [key, stackedModals]);

  // This will calculate the "bottom displacement" of the stacked modal based on its ID
  // The id is retrieved from the previous useMemo call (using the key)
  const bottomHeight = useMemo(() => {
    const offset = 15; // Offset value for calculation

    return Math.min(id ?? 0, MAX_VISIBLE_MODALS - 1) + offset * (id ?? 0);
  }, [id]);

  return { id: id ?? 0, bottomHeight }; // Returning the calculated ID and bottom height
};
