import { useWindowDimensions } from 'react-native';

type SnapPosition = {
  x: number;
  y: number;
};

export const snapToCorner = (
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number,
  screenWidth: number,
  screenHeight: number,
): SnapPosition => {
  'worklet';
  const margin = 30;
  const topMargin = 80;
  const bottomMargin = 100;

  const panelCenterX = x + panelWidth / 2;
  const panelCenterY = y + panelHeight / 2;

  const corners = [
    { x: margin, y: topMargin },
    { x: screenWidth - panelWidth - margin, y: topMargin },
    { x: margin, y: screenHeight - panelHeight - bottomMargin },
    {
      x: screenWidth - panelWidth - margin,
      y: screenHeight - panelHeight - bottomMargin,
    },
  ];

  let [closestCorner, minDistance] = [corners[0], Infinity];

  corners.forEach(corner => {
    const cornerCenterX = corner.x + panelWidth / 2;
    const cornerCenterY = corner.y + panelHeight / 2;
    const distance = Math.sqrt(
      Math.pow(panelCenterX - cornerCenterX, 2) +
        Math.pow(panelCenterY - cornerCenterY, 2),
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestCorner = corner;
    }
  });

  return closestCorner;
};

export const useInitialPanelPosition = (
  panelWidth: number,
  panelHeight: number,
) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  return {
    x: screenWidth - panelWidth - 30,
    y: screenHeight - panelHeight - 100,
  };
};
