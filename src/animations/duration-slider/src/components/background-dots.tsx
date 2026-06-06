import { useMemo } from 'react';

import { Path, Skia } from '@shopify/react-native-skia';

type BackgroundDotsProps = {
  cx: number;
  cy: number;
  radius: number;
  initialAngleRad: number;
};

export const BackgroundDots: React.FC<BackgroundDotsProps> = ({
  cx,
  cy,
  radius,
  initialAngleRad,
}) => {
  const dotsPath = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    const dots = new Array(12).fill(0).map((_, i) => {
      const angle = (i * Math.PI) / 6;
      if (angle === 2 * Math.PI - initialAngleRad) {
        return { x: -100, y: -100 };
      }
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      return { x, y };
    }, []);

    dots.forEach(({ x, y }) => {
      builder.addCircle(x, y, 3);
    });

    return builder.build();
  }, [cx, cy, initialAngleRad, radius]);

  return <Path path={dotsPath} strokeWidth={2} color={'#656565'} />;
};
