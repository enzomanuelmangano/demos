'use client';

import React, { useEffect, useRef } from 'react';

import { InteractiveBox } from '@/components/interactive';
import {
  useAnimatedValue,
  useAnimatedValues,
  usePanGesture,
  type AnimatedValueController,
} from '@/lib/animation';

const SIZE = 80;

/**
 * Porting di `useFollowAnimatedPosition`: era
 * `useDerivedValue(() => withSpring(x.value))`, cioè un valore che insegue
 * l'altro con una molla. Qui ri-lanciamo la molla ogni volta che la sorgente
 * cambia.
 */
function useFollow(source: AnimatedValueController) {
  const follower = useAnimatedValue(0);

  useEffect(
    () => source.subscribe((target) => follower.spring(target)),
    [source, follower]
  );

  return follower;
}

function IntroToGestures() {
  const translateX = useAnimatedValue(0);
  const translateY = useAnimatedValue(0);
  const context = useRef({ x: 0, y: 0 });

  const blueX = useFollow(translateX);
  const blueY = useFollow(translateY);
  const redX = useFollow(blueX);
  const redY = useFollow(blueY);
  const greenX = useFollow(redX);
  const greenY = useFollow(redY);

  const blueRef = useRef<HTMLDivElement>(null);
  const redRef = useRef<HTMLDivElement>(null);
  const greenRef = useRef<HTMLDivElement>(null);

  const panRef = usePanGesture<HTMLDivElement>({
    onBegin: () => {
      context.current = { x: translateX.get(), y: translateY.get() };
    },
    onUpdate: (event) => {
      translateX.set(event.translationX + context.current.x);
      translateY.set(event.translationY + context.current.y);
    },
    onEnd: () => {
      // `Dimensions.get('window').width` in origine
      const screenWidth = window.innerWidth;
      translateX.set(translateX.get() > screenWidth / 2 ? screenWidth - SIZE : 0);
    },
  });

  useAnimatedValues([blueX, blueY], ([x, y]) => {
    if (blueRef.current) {
      blueRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  });
  useAnimatedValues([redX, redY], ([x, y]) => {
    if (redRef.current) {
      redRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  });
  useAnimatedValues([greenX, greenY], ([x, y]) => {
    if (greenRef.current) {
      greenRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  });

  return (
    <div style={styles.container}>
      <div
        ref={greenRef}
        style={{ ...styles.circle, backgroundColor: 'green' }}
      />
      <div ref={redRef} style={{ ...styles.circle, backgroundColor: 'red' }} />
      <div
        ref={(node) => {
          panRef.current = node;
          blueRef.current = node;
        }}
        style={{ ...styles.circle, cursor: 'grab' }}
      />
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flex: 1,
    position: 'relative',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  circle: {
    position: 'absolute',
    height: SIZE,
    aspectRatio: 1,
    backgroundColor: 'blue',
    borderRadius: SIZE / 2,
    opacity: 0.8,
  },
} satisfies Record<string, React.CSSProperties>;

export const IntroToGesturesDemo = () => (
  // eslint-disable-next-line react/no-children-prop -- InteractiveBox accetta il tipo componente
  <InteractiveBox children={IntroToGestures} />
);
