'use client';

import { useEffect, useState } from 'react';

export const SPRING_CONFIG = {
  damping: 50,
  mass: 0.3,
  stiffness: 120,
};

/** Porting di `useWindowDimensions` di react-native. */
export const useWindowWidth = () => {
  // Parte da 0: il primo render avviene anche sul server, dove `window` non
  // esiste. I valori derivati sono comunque clampati sui minimi.
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return width;
};

// Sheet dimensions and positions
export const useSheetDimensions = () => {
  const screenWidth = useWindowWidth();
  const sheetWidth = Math.min(screenWidth * 0.6, 350);
  const sheetHeight = 400;

  return {
    sheetWidth,
    sheetHeight,
  };
};

export const useSheetPosition = () => {
  const screenWidth = useWindowWidth();

  // Desktop values
  const desktopBottom = 300;
  const desktopTop = 20;

  // Mobile values
  const mobileBottom = 240;
  const mobileTop = 100;

  // Breakpoints for interpolation
  const minWidth = 375; // iPhone SE width
  const maxWidth = 1024; // Typical tablet/desktop width

  // Calculate interpolated values
  const bottomPosition = Math.round(
    mobileBottom +
      ((screenWidth - minWidth) / (maxWidth - minWidth)) *
        (desktopBottom - mobileBottom)
  );

  const topPosition = Math.round(
    mobileTop +
      ((screenWidth - minWidth) / (maxWidth - minWidth)) *
        (desktopTop - mobileTop)
  );

  return {
    bottomPosition: Math.min(
      Math.max(bottomPosition, mobileBottom),
      desktopBottom
    ),
    topPosition: Math.min(Math.max(topPosition, desktopTop), mobileTop),
    threshold: 200,
  };
};

// Colors
export const SHEET_BACKGROUND = 'white';
export const CONTENT_BACKGROUND = 'orange';
export const CONTAINER_BACKGROUND = '#111';

// Border radius
export const SHEET_BORDER_RADIUS = {
  min: 5,
  max: 25,
} as const;

// Handle bar
export const HANDLE_WIDTH = 75;
export const HANDLE_HEIGHT = 4;
export const HANDLE_MARGIN = 15;
export const HANDLE_BACKGROUND = 'grey';

// Button
export const BUTTON_SIZE = 50;
export const BUTTON_BACKGROUND = 'white';
export const BUTTON_OPACITY = 0.6;
