import { PixelRatio, StyleSheet } from 'react-native';

import { useEffect } from 'react';

import { useAtomValue } from 'jotai';
import {
  Easing,
  interpolate,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { withPause } from 'react-native-redash';
import { Canvas, Picture, Skia, TileMode } from 'react-native-skia';

import { IsTimeMachineActiveAtom } from '../atoms/time-machine-active';
import { shader } from '../shader';

import type { SharedValue } from 'react-native-reanimated';
import type { SkImage } from 'react-native-skia';

type BackgroundCanvasProps = {
  timeMachineProgress: SharedValue<number>;
  width: number;
  height: number;
};

export const BackgroundCanvas = ({
  timeMachineProgress,
  width,
  height,
}: BackgroundCanvasProps) => {
  const progress = useSharedValue(0);
  const isTimeMachineActive = useAtomValue(IsTimeMachineActiveAtom);

  const isTimeMachinePaused = useDerivedValue(() => {
    return !isTimeMachineActive;
  }, [isTimeMachineActive]);

  useEffect(() => {
    progress.set(
      withPause(
        withRepeat(
          withTiming(10, {
            easing: Easing.linear,
            duration: 100000,
          }),
          -1,
          true,
        ),
        isTimeMachinePaused,
      ),
    );
  }, [progress, timeMachineProgress, isTimeMachinePaused]);

  // While paused the starfield doesn't change, but the pull-down still
  // animates the blur every frame. Rasterize the paused frame once and blur
  // that image instead of re-running the full-screen shader per frame.
  const pixelRatio = PixelRatio.get();
  const pausedFrame = useSharedValue<{ image: SkImage; time: number } | null>(
    null,
  );

  const picture = useDerivedValue(() => {
    const time = progress.get();
    const blur = interpolate(timeMachineProgress.get(), [1, 0], [0, 15]);

    const paint = Skia.Paint();
    paint.setImageFilter(
      Skia.ImageFilter.MakeBlur(blur, blur, TileMode.Decal, null),
    );

    const rect = Skia.XYWHRect(0, 0, width, height);
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(rect);

    if (isTimeMachinePaused.get()) {
      let frame = pausedFrame.get();
      if (!frame || frame.time !== time) {
        const surface = Skia.Surface.MakeOffscreen(
          width * pixelRatio,
          height * pixelRatio,
        )!;
        const offscreen = surface.getCanvas();
        offscreen.scale(pixelRatio, pixelRatio);
        const shaderPaint = Skia.Paint();
        shaderPaint.setShader(shader.makeShader([width, height, time]));
        offscreen.drawRect(rect, shaderPaint);
        surface.flush();
        frame?.image.dispose();
        frame = { image: surface.makeImageSnapshot(), time };
        pausedFrame.set(frame);
      }
      canvas.drawImageRect(
        frame.image,
        Skia.XYWHRect(0, 0, frame.image.width(), frame.image.height()),
        rect,
        paint,
      );
    } else {
      paint.setShader(shader.makeShader([width, height, time]));
      canvas.drawRect(rect, paint);
    }

    return recorder.finishRecordingAsPicture();
  }, [
    width,
    height,
    pixelRatio,
    progress,
    timeMachineProgress,
    isTimeMachinePaused,
  ]);

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Picture picture={picture} />
    </Canvas>
  );
};
