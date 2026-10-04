import { useDerivedValue } from 'react-native-reanimated';
import { Group, RoundedRect, Text } from 'react-native-skia';
import Touchable from 'react-native-skia-gesture';

import {
  CloseIconBarLength,
  CloseIconBarThickness,
  font,
  fontStyle,
} from './constants';
import { useCloseButtonAnimations } from './use-close-buttons-animations';
import { useDeleteButtonAnimations } from './use-delete-button-animations';
import { useGooeyLayer } from './use-gooey-layer';
import { useTextAnimations } from './use-text-animations';

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
  const {
    isToggled,
    deleteButtonRectX,
    deleteButtonColor,
    gestureHandler,
    buttonTransform,
  } = useDeleteButtonAnimations({
    additionalWidth,
    onDelete: () => {
      isToggled.set(!closeOnConfirm);
      onConfirmDeletion?.();
    },
  });

  const {
    closeIconCircleX,
    closeButtonOpacity,
    gestureHandlerClose,
    closeButtonTransform,
    paint,
  } = useCloseButtonAnimations({ isToggled, width, additionalWidth });

  const { deleteTextX, deleteTextOpacity, confirmTextX, confirmTextOpacity } =
    useTextAnimations({
      isToggled,
      deleteButtonRectX,
      width,
      font,
      initialText,
      confirmText,
    });

  const layer = useGooeyLayer();

  const closeIconTransform = useDerivedValue(() => {
    return [{ translateX: closeIconCircleX.get() }, { translateY: height / 2 }];
  }, [height]);

  return (
    <Touchable.Canvas
      style={{
        height: height,
        width: width + additionalWidth,
      }}>
      <Group layer={layer}>
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
      <Group layer={paint}>
        <Group transform={closeIconTransform}>
          <RoundedRect
            x={-CloseIconBarLength / 2}
            y={-CloseIconBarThickness / 2}
            width={CloseIconBarLength}
            height={CloseIconBarThickness}
            r={CloseIconBarThickness / 2}
            color={'white'}
            transform={[{ rotate: Math.PI / 4 }]}
          />
          <RoundedRect
            x={-CloseIconBarLength / 2}
            y={-CloseIconBarThickness / 2}
            width={CloseIconBarLength}
            height={CloseIconBarThickness}
            r={CloseIconBarThickness / 2}
            color={'white'}
            transform={[{ rotate: -Math.PI / 4 }]}
          />
        </Group>
      </Group>
    </Touchable.Canvas>
  );
};
