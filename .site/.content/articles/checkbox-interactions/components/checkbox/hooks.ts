'use client';

import { useCallback, useState } from 'react';

const CuisineOptions = [
  'Italian',
  'Japanese',
  'Mexican',
  'Chinese',
  'Indian',
  'Thai',
  'French',
  'Mediterranean',
  'American',
  'Korean',
  'Vietnamese',
  'Greek',
  'Spanish',
  'Middle Eastern',
  'Brazilian',
  'Turkish',
  'Lebanese',
  'Moroccan',
  'Ethiopian',
  'Caribbean',
];

const Cuisines = CuisineOptions.map((cuisine, i) => ({
  id: i,
  name: cuisine,
  selected: cuisine === 'Italian',
}));

export type Cuisine = {
  id: number;
  name: string;
  selected: boolean;
};

export const useCuisines = () => {
  const [cuisines, setCuisines] = useState<Cuisine[]>(Cuisines);

  const toggleCuisine = useCallback((id: number) => {
    setCuisines((prevCuisines) => {
      return prevCuisines.map((cuisine) => {
        if (cuisine.id === id) {
          return {
            ...cuisine,
            selected: !cuisine.selected,
          };
        }
        return cuisine;
      });
    });
  }, []);

  return {
    cuisines,
    toggleCuisine,
  };
};