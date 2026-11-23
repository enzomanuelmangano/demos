'use client';

import React, { forwardRef, useImperativeHandle, useRef } from 'react';

import {
  useAnimatedValue,
  useAnimatedValues,
  usePanGesture,
} from '@/lib/animation';
import { RN_TEXT } from '@/lib/rn-text';

const SLIDER_WIDTH = 200;
const SLIDER_HEIGHT = 40;
const KNOB_SIZE = 30;
const HIT_SLOP = 20;

const HIGHLIGHT_COLOR = '#6370CA';
const HIGHLIGHT_BRIGHT_COLOR = '#b0b8ff';
const TEXT_COLOR = '#bdbdbd';

export interface SliderRef {
  setProgress: (progress: number) => void;
}

interface SliderProps {
  label: string;
  value: number;
  onValueChange?: (value: number) => void;
  minValue?: number;
  maxValue?: number;
}

export const AnimatedSlider = forwardRef<SliderRef, SliderProps>(
  ({ label, value, onValueChange, minValue = 0, maxValue = 1 }, ref) => {
    const translateX = useAnimatedValue(0);
    const contextX = useRef(0);

    const progressRef = useRef<HTMLDivElement>(null);
    const remainingRef = useRef<HTMLDivElement>(null);
    const knobRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      setProgress: (val: number) => {
        const progress = (val - minValue) / (maxValue - minValue);
        translateX.set(progress * (SLIDER_WIDTH - KNOB_SIZE));
      },
    }));

    const panRef = usePanGesture<HTMLDivElement>({
      onBegin: () => {
        contextX.current = translateX.get();
      },
      onUpdate: (e) => {
        const next = Math.max(
          0,
          Math.min(SLIDER_WIDTH - KNOB_SIZE, contextX.current + e.translationX)
        );
        translateX.set(next);

        const progress = next / (SLIDER_WIDTH - KNOB_SIZE);
        onValueChange?.(minValue + progress * (maxValue - minValue));
      },
    });

    useAnimatedValues([translateX], ([x]) => {
      if (progressRef.current) {
        progressRef.current.style.width = `${x + KNOB_SIZE / 2}px`;
      }
      if (remainingRef.current) {
        remainingRef.current.style.width = `${SLIDER_WIDTH - (x + KNOB_SIZE / 2)}px`;
      }
      if (knobRef.current) {
        knobRef.current.style.transform = `translateX(${x}px)`;
      }
    });

    return (
      <div style={styles.container}>
        <span style={styles.label}>{label}</span>
        <div style={styles.sliderContainer}>
          <div style={styles.trackContainer}>
            <div
              ref={progressRef}
              style={{
                ...styles.trackPart,
                backgroundColor: HIGHLIGHT_BRIGHT_COLOR,
              }}
            />
            <div
              ref={remainingRef}
              style={{ ...styles.trackPart, backgroundColor: HIGHLIGHT_COLOR }}
            />
          </div>
          <div style={styles.trackHitSlop} />
          <div
            ref={(node) => {
              panRef.current = node;
              knobRef.current = node;
            }}
            style={styles.knob}
          />
        </div>
        <span style={styles.value}>{value.toFixed(2)}</span>
      </div>
    );
  }
);

AnimatedSlider.displayName = 'AnimatedSlider';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  label: {
    ...RN_TEXT,
    fontSize: 16,
    marginBottom: 5,
    color: TEXT_COLOR,
  },
  sliderContainer: {
    display: 'flex',
    // Una View di react-native è una colonna: `justifyContent: center` centra
    // in verticale. In riga centrava il knob in orizzontale, a metà corsa.
    flexDirection: 'column',
    position: 'relative',
    width: SLIDER_WIDTH,
    height: SLIDER_HEIGHT,
    justifyContent: 'center',
  },
  trackContainer: {
    width: SLIDER_WIDTH,
    height: 2,
    position: 'absolute',
    top: '50%',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  trackPart: {
    height: '100%',
  },
  trackHitSlop: {
    width: SLIDER_WIDTH,
    height: HIT_SLOP,
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    backgroundColor: 'transparent',
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: HIGHLIGHT_BRIGHT_COLOR,
    position: 'absolute',
    top: '50%',
    marginTop: -KNOB_SIZE / 2,
    boxShadow: '0 2px 3.84px rgba(0, 0, 0, 0.25)',
    cursor: 'grab',
  },
  value: {
    ...RN_TEXT,
    fontSize: 14,
    marginTop: 5,
    color: TEXT_COLOR,
  },
} satisfies Record<string, React.CSSProperties>;
