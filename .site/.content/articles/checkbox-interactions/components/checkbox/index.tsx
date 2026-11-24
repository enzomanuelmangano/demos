'use client';

import React from 'react';

import { Checkbox } from './checkbox';
import { useCuisines, type Cuisine } from './hooks';
import { RN_TEXT } from '@/lib/rn-text';

export const Demo = () => {
  const { cuisines, toggleCuisine } = useCuisines();

  return (
    <div style={styles.container}>
      <span style={styles.title}>What are your favourite cuisines?</span>
      <div style={styles.listContainer}>
        {cuisines.map((cuisine: Cuisine) => (
          <Checkbox
            key={cuisine.id}
            label={cuisine.name}
            checked={cuisine.selected}
            onPress={() => toggleCuisine(cuisine.id)}
          />
        ))}
      </div>
    </div>
  );
};

export const StaticDemo = () => {
  const { cuisines, toggleCuisine } = useCuisines();

  return (
    <div style={styles.container}>
      <span style={styles.title}>What are your favourite cuisines?</span>
      <div style={styles.listContainer}>
        {cuisines.map((cuisine: Cuisine) => (
          <Checkbox
            key={cuisine.id}
            label={cuisine.name}
            checked={cuisine.selected}
            onPress={() => toggleCuisine(cuisine.id)}
            disableAnimations
          />
        ))}
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0d0d0d',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#777777',
    padding: 24,
    marginBottom: 24,
    borderRadius: 16,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    ...RN_TEXT,
    marginBottom: 24,
  },
  listContainer: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
} satisfies Record<string, React.CSSProperties>;
