import { useCallback, useState } from 'react';

import { Cuisines } from '../constants';

export const useCuisines = () => {
  const [cuisines, setCuisines] = useState(Cuisines);

  const toggleCuisine = useCallback(
    (cuisineId: number) => {
      setCuisines(prevCuisines =>
        prevCuisines.map(cuisine =>
          cuisine.id === cuisineId
            ? { ...cuisine, selected: !cuisine.selected }
            : cuisine,
        ),
      );
    },
    [setCuisines],
  );

  return { cuisines, toggleCuisine };
};
