'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import {
  interpolate,
  useAnimatedValue,
  useAnimatedValues,
  usePanGesture,
} from '@/lib/animation';

type SliderProps = {
  pickerSize?: number;
  minValue?: number;
  maxValue?: number;
  color?: string;
  style: Omit<React.CSSProperties, 'width' | 'height'> & {
    width: number;
    height?: number;
  };
  onUpdate?: (progress: number) => void;
  initialProgress?: number;
};

export type SliderRef = {
  setProgress: (progress: number) => void;
};

const clamp = (value: number, lowerBound: number, upperBound: number) =>
  Math.min(Math.max(value, lowerBound), upperBound);

/**
 * Slider custom dell'articolo, portato da Reanimated + Gesture Handler a
 * pointer events + valori animati web. Comportamento invariato: il picker si
 * ingrandisce durante il drag e la barra segue la posizione.
 */
const AnimatedSlider = forwardRef<SliderRef, SliderProps>(
  (
    {
      pickerSize = 35,
      minValue = 0,
      maxValue = 1,
      color = 'white',
      style,
      onUpdate,
      initialProgress = 0,
    },
    ref
  ) => {
    const sliderHeight = style.height ?? 4;
    const sliderWidth = style.width;

    const defaultPickerBorderRadius = pickerSize / 2;
    const defaultScale = 0.8;

    const translateX = useAnimatedValue(
      interpolate(initialProgress, [0, 100], [0, sliderWidth])
    );
    const scale = useAnimatedValue(defaultScale);
    const contextX = useRef(0);

    // La larghezza arriva dalla finestra, che al primo render (lato server)
    // vale 0: lì la posizione iniziale sarebbe 0 e le etichette mostrerebbero
    // il minimo. Quando la larghezza cambia, si riporta il picker alla stessa
    // proporzione (o al valore iniziale, se prima non c'era una larghezza).
    const previousWidth = useRef(sliderWidth);
    useEffect(() => {
      const previous = previousWidth.current;
      previousWidth.current = sliderWidth;
      if (previous === sliderWidth || sliderWidth <= 0) return;
      translateX.set(
        previous > 0
          ? (translateX.get() * sliderWidth) / previous
          : interpolate(initialProgress, [0, 100], [0, sliderWidth])
      );
    }, [sliderWidth, initialProgress, translateX]);

    const pickerRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      setProgress: (progress: number) => {
        translateX.timing(interpolate(progress, [0, 100], [0, sliderWidth]));
      },
    }));

    const panRef = usePanGesture<HTMLDivElement>({
      onBegin: () => {
        scale.timing(1);
        contextX.current = clamp(translateX.get(), 0, sliderWidth);
      },
      onUpdate: (event) => {
        translateX.set(contextX.current + event.translationX);
      },
      onEnd: () => {
        scale.timing(defaultScale);
      },
    });

    useAnimatedValues([translateX, scale], ([x, s]) => {
      const clamped = clamp(x, 0, sliderWidth);

      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${clamped}px`;
      }
      if (pickerRef.current) {
        pickerRef.current.style.transform = `translateX(${clamped - pickerSize / 2}px) scale(${s})`;
      }

      onUpdate?.(
        interpolate(clamped, [0, sliderWidth], [minValue, maxValue])
      );
    });

    return (
      <div
        style={{
          borderRadius: 5,
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          // Come una View di react-native: non si restringe se lo spazio
          // accanto all'etichetta non basta (su schermi stretti).
          flexShrink: 0,
          ...style,
          position: 'relative',
          height: sliderHeight,
          width: sliderWidth,
        }}
      >
        <div
          ref={progressBarRef}
          style={{ backgroundColor: color, ...styles.progressBar }}
        />
        <div
          ref={(node) => {
            panRef.current = node;
            pickerRef.current = node;
          }}
          style={{
            ...styles.picker,
            height: pickerSize,
            top: -pickerSize / 2 + sliderHeight / 2,
            borderRadius: defaultPickerBorderRadius,
          }}
        />
      </div>
    );
  }
);

AnimatedSlider.displayName = 'AnimatedSlider';

const styles = {
  progressBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  picker: {
    aspectRatio: 1,
    backgroundColor: 'white',
    position: 'absolute',
    left: 0,
    bottom: 0,
    cursor: 'grab',
  },
} satisfies Record<string, React.CSSProperties>;

export { AnimatedSlider };
