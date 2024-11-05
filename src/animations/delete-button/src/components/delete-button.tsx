import { Group, ImageSVG, Text } from '@shopify/react-native-skia';
import Touchable from 'react-native-skia-gesture';

import { useDeleteButtonAnimations } from './use-delete-button-animations';
import { useCloseButtonAnimations } from './use-close-buttons-animations';
import { useTextAnimations } from './use-text-animations';
import {
  CloseSvgPath,
  CloseSvgPathHeight,
  CloseSvgPathWidth,
  font,
  fontStyle,
} from './constants';
import { useGooeyLayer } from './use-gooey-layer';

// Define the props for the DeleteButton component
type DeleteButtonProps = {
  onConfirmDeletion: () => void;
  height: number;
  width: number;
  initialText?: string;
  confirmText?: string;
  additionalWidth: number;
  closeOnConfirm?: boolean;
};

export const DeleteButton = ({
  onConfirmDeletion,
  height,
  width,
  additionalWidth,
  initialText = 'Delete',
  confirmText = 'Confirm',
  closeOnConfirm = false,
}: DeleteButtonProps) => {
  // Hook for managing delete button animations
  const {
    isToggled,
    deleteButtonRectX,
    deleteButtonColor,
    gestureHandler,
    buttonTransform,
  } = useDeleteButtonAnimations({
    additionalWidth,
    onDelete: () => {
      // Toggle the button state and call the onConfirmDeletion callback
      isToggled.value = !closeOnConfirm;
      onConfirmDeletion?.();
    },
  });

  // Hook for managing close button animations
  const {
    closeIconCircleX,
    closeButtonOpacity,
    gestureHandlerClose,
    closeButtonTransform,
    paint,
  } = useCloseButtonAnimations({ isToggled, width, additionalWidth });

  // Hook for managing text animations
  const { deleteTextX, deleteTextOpacity, confirmTextX, confirmTextOpacity } =
    useTextAnimations({
      isToggled,
      deleteButtonRectX,
      width,
      font,
      initialText,
      confirmText,
    });

  // Hook for creating a gooey effect layer
  const layer = useGooeyLayer();

  return (
    // Canvas component that wraps the entire button
    <Touchable.Canvas
      style={{
        height: height,
        width: width + additionalWidth,
      }}>
      {/* Group for the main button elements with gooey effect */}
      <Group layer={layer}>
        {/* Delete button */}
        <Group
          origin={{ x: width / 2, y: height / 2 }}
          transform={buttonTransform}>
          <Touchable.RoundedRect
            {...gestureHandler}
            x={deleteButtonRectX}
            y={0}
            width={width}
            height={height}
            r={20}
            color={deleteButtonColor}
          />
        </Group>
        {/* Close button */}
        <Group
          opacity={closeButtonOpacity}
          transform={closeButtonTransform}
          origin={{
            x: width + additionalWidth / 2,
            y: height / 2,
          }}>
          <Touchable.Circle
            {...gestureHandlerClose}
            cx={closeIconCircleX}
            cy={height / 2}
            r={height / 2}
            color={deleteButtonColor}
          />
        </Group>
      </Group>
      {/* Initial text ("Delete") */}
      <Group>
        <Text
          x={deleteTextX}
          y={fontStyle.fontSize / 3 + height / 2}
          text={initialText}
          font={font}
          color={'white'}
          opacity={deleteTextOpacity}
        />
      </Group>
      {/* Confirmation text ("Confirm") */}
      <Group>
        <Text
          x={confirmTextX}
          y={fontStyle.fontSize / 3 + height / 2}
          text={confirmText}
          font={font}
          color={'white'}
          opacity={confirmTextOpacity}
        />
      </Group>
      {/* Close icon SVG */}
      <Group
        layer={paint}
        transform={[
          { translateX: -CloseSvgPathWidth / 2 },
          { translateY: -CloseSvgPathHeight / 2 },
        ]}
        origin={{
          x: width + additionalWidth / 2,
          y: height / 2,
        }}>
        <ImageSVG svg={CloseSvgPath} x={closeIconCircleX} y={height / 2} />
      </Group>
    </Touchable.Canvas>
  );
};
