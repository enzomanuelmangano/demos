'use client';

import React, { forwardRef, memo, useEffect, useRef, useState } from 'react';

import { Loader } from '../component';
import { AnimatedSlider, SliderRef } from '../animated-slider';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';

const ProgressLoader = memo(
  forwardRef<InteractiveForwardRefProps>((_, ref) => {
    const [start, setStart] = useState(0);
    const sliderRef = useRef<SliderRef>(null);

    return (
      <div style={styles.container}>
        <div style={styles.loaderContainer}>
          <Loader type="with-progress" ref={ref} start={start} />
        </div>
        <div style={styles.sliderContainer}>
          <AnimatedSlider
            ref={sliderRef}
            label="Start"
            value={start}
            onValueChange={setStart}
          />
        </div>
      </div>
    );
  })
);

ProgressLoader.displayName = 'ProgressLoader';

/** `Dimensions.get('window')` in origine: quadrato solo in portrait. */
const usePortrait = () => {
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const update = () => setPortrait(window.innerWidth <= window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return portrait;
};

export function InteractiveProgressLoader() {
  const portrait = usePortrait();

  return (
    // eslint-disable-next-line react/no-children-prop -- InteractiveBox accetta il tipo componente
    <InteractiveBox
      children={ProgressLoader}
      theme="light"
      style={{ aspectRatio: portrait ? 1 : undefined }}
    />
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    flex: 1,
    justifyContent: 'center',
  },
  loaderContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 2,
  },
  sliderContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginBottom: 20,
  },
} satisfies Record<string, React.CSSProperties>;
