import {
  AnimatedProp,
  BlurMask,
  Group,
  GroupProps,
} from '@shopify/react-native-skia';
import React from 'react';

type BlurClipPathProps = {
  children: React.ReactNode;
  blur: number;
  path: AnimatedProp<GroupProps['clip']> | GroupProps['clip'];
};

const BlurClipPath: React.FC<BlurClipPathProps> = React.memo(
  ({ children, blur, path }) => {
    return (
      <Group>
        {children}
        <Group clip={path}>
          {children}
          <BlurMask blur={blur} />
        </Group>
      </Group>
    );
  }
);

export { BlurClipPath };
