// Importing necessary modules and components
import type { CanvasProps, SkImage } from '@shopify/react-native-skia';
import { Canvas, Fill, ImageShader, Shader } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

// Importing utility function for transitioning effects
import { transition } from './utils';

// Defining type for props
type ImageEditorProps = {
  // The image to be edited
  image: SkImage | null;
  // Shared value representing the progress of the editing process
  progress: SharedValue<number>;
  // The GL effect to be applied to the image
  glEffect: string;
  // The width of the canvas
  width: number;
  // The height of the canvas
  height: number;
  // Other props accepted by the Canvas component, excluding children
} & Omit<CanvasProps, 'children'>;

// ImageEditor component
export const ImageEditor: React.FC<ImageEditorProps> = ({
  image,
  progress,
  glEffect,
  width,
  height,
  ...canvasProps
}) => {
  // Generating source for shader transition effect
  const source = useMemo(() => {
    return transition(glEffect);
  }, [glEffect]);

  // Derived value for shader uniforms
  const uniforms = useDerivedValue(() => {
    return {
      progress: progress.value,
      resolution: [width, height],
    };
  }, [width, height]);

  // Rendering the ImageEditor component
  return (
    <Canvas
      {...canvasProps}
      style={[
        canvasProps.style,
        {
          width,
          height,
        },
      ]}>
      {/* Filling the canvas with shader transition effect */}
      <Fill>
        {/* Applying shader with transition effect */}
        <Shader source={source} uniforms={uniforms}>
          {/* Rendering snapshots of current and next screens */}
          {/* 
            Maybe for real use cases, you would want to use the fit="contain" prop
          */}
          <ImageShader
            image={image}
            fit="cover"
            width={width}
            height={height}
          />
          <ImageShader
            image={image}
            fit="cover"
            width={width}
            height={height}
          />
        </Shader>
      </Fill>
    </Canvas>
  );
};
