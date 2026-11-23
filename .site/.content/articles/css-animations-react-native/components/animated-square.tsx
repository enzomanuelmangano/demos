'use client';

import React, { useEffect, useMemo, useState } from 'react';

import {
  INTERACTIVE_CONSTANTS,
  InteractiveButtons,
} from '@/components/interactive';
import { interpolate, useAnimatedStyle, useAnimatedValue } from '@/lib/animation';

type AnimatedSquareProps = {
  withoutRepeat?: boolean;
  withoutPause?: boolean;
};

const SIZE = 100;
const DURATION = 2000;

export const AnimatedSquare: React.FC<AnimatedSquareProps> = ({
  withoutRepeat = false,
  withoutPause = false,
}: AnimatedSquareProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const progress = useAnimatedValue(0);

  const squareRef = useAnimatedStyle<HTMLDivElement>(progress, (value) => ({
    borderRadius: value * 20,
    transform: `scale(${interpolate(value, [0, 1], [0.5, 1])}) rotate(${value * 360}deg)`,
    opacity: interpolate(value, [0, 1], [0.5, 1]),
  }));

  useEffect(() => {
    progress.set(0);
    progress.timing(1, {
      duration: DURATION,
      repeat: withoutRepeat ? 1 : -1,
      reverse: true,
    });
    // Il ciclo parte in pausa: era `withPause(..., isPaused)` di redash.
    progress.pause();
  }, [progress, withoutRepeat]);

  useEffect(() => {
    if (withoutRepeat || withoutPause) return;
    if (isPlaying) progress.resume();
    else progress.pause();
  }, [isPlaying, progress, withoutRepeat, withoutPause]);

  const buttons = useMemo(() => {
    if (withoutRepeat) {
      return [
        {
          type: 'play',
          onClick: () => {
            progress.set(0);
            progress.timing(1, { duration: DURATION });
          },
        },
      ] as const;
    }

    if (withoutPause) {
      return [
        {
          type: 'play',
          onClick: () => {
            progress.set(0);
            progress.timing(1, {
              duration: DURATION,
              repeat: -1,
              reverse: true,
            });
          },
        },
        {
          type: 'reset',
          onClick: () => progress.set(0),
        },
      ] as const;
    }

    return [
      {
        type: 'play-pause',
        isPlaying,
        onClick: () => setIsPlaying((prev) => !prev),
      },
    ] as const;
  }, [withoutRepeat, withoutPause, isPlaying, progress]);

  return (
    <div style={styles.container}>
      <div
        ref={squareRef}
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          height: SIZE,
          width: SIZE,
        }}
      />
      <InteractiveButtons
        buttons={buttons as unknown as Parameters<
          typeof InteractiveButtons
        >[0]['buttons']}
        theme="light"
      />
    </div>
  );
};

export const styles = {
  container: {
    display: 'flex',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INTERACTIVE_CONSTANTS.THEME.DARK.BACKGROUND,
  },
} satisfies Record<string, React.CSSProperties>;
