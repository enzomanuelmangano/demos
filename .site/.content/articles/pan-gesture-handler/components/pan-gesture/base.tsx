'use client';

import React, { forwardRef, useImperativeHandle, useRef } from 'react';

import { InteractiveForwardRefProps } from '@/components/interactive';
import {
  useAnimatedValue,
  useAnimatedValues,
  usePanGesture,
} from '@/lib/animation';

const SIZE = 100.0;
const CIRCLE_RADIUS = SIZE * 2;

export const PanGestureDemo = forwardRef<InteractiveForwardRefProps>(
  (_, ref) => {
    const translateX = useAnimatedValue(0);
    const translateY = useAnimatedValue(0);
    const startX = useRef(0);
    const startY = useRef(0);
    const squareRef = useRef<HTMLDivElement>(null);

    const panRef = usePanGesture<HTMLDivElement>({
      onBegin: () => {
        startX.current = translateX.get();
        startY.current = translateY.get();
      },
      onUpdate: (event) => {
        translateX.set(event.translationX + startX.current);
        translateY.set(event.translationY + startY.current);
      },
      onEnd: () => {
        const distance = Math.sqrt(translateX.get() ** 2 + translateY.get() ** 2);

        if (distance < CIRCLE_RADIUS + SIZE / 2) {
          translateX.spring(0);
          translateY.spring(0);
        }
      },
    });

    useAnimatedValues([translateX, translateY], ([x, y]) => {
      const node = squareRef.current;
      if (node) node.style.transform = `translate(${x}px, ${y}px)`;
    });

    const onReset = () => {
      translateX.spring(0);
      translateY.spring(0);
    };

    const onPlay = () => {
      // Simula un drag animando verso una posizione casuale
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * (CIRCLE_RADIUS - SIZE / 2);
      translateX.spring(Math.cos(angle) * distance);
      translateY.spring(Math.sin(angle) * distance);
    };

    useImperativeHandle(ref, () => ({
      play: onPlay,
      reset: onReset,
      pause: () => {},
    }));

    return (
      <div style={styles.container}>
        <div style={styles.circle}>
          <div
            ref={(node) => {
              panRef.current = node;
              squareRef.current = node;
            }}
            style={styles.square}
          />
        </div>
      </div>
    );
  }
);

PanGestureDemo.displayName = 'PanGestureDemo';

const styles = {
  // Default di una View di react-native-web: senza `minHeight/minWidth: 0` un
  // flex item non scende sotto il contenuto (il cerchio da 400px) e su
  // schermi stretti il cerchio non resta centrato nel riquadro.
  container: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  square: {
    width: SIZE,
    height: SIZE,
    backgroundColor: 'rgba(0, 0, 255, 0.5)',
    borderRadius: 20,
    cursor: 'grab',
  },
  circle: {
    display: 'flex',
    flexShrink: 0,
    width: CIRCLE_RADIUS * 2,
    height: CIRCLE_RADIUS * 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CIRCLE_RADIUS,
    borderWidth: 5,
    borderStyle: 'solid',
    borderColor: 'rgba(0, 0, 255, 0.5)',
  },
} satisfies Record<string, React.CSSProperties>;
