'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import { InteractiveForwardRefProps } from '@/components/interactive';
import { interpolate, linear, useAnimatedValue } from '@/lib/animation';

const DEFAULT_SIZE = 128;

type LoaderProps = {
  type:
    | 'basic'
    | 'with-gradient'
    | 'with-animation'
    | 'with-basic-animation'
    | 'with-progress';
  start?: number;
};

/**
 * `setProgress` è opzionale: i chiamanti passano un
 * `Ref<InteractiveForwardRefProps>` (i controlli play/pause/reset della
 * InteractiveBox), che così resta assegnabile.
 */
export type LoaderRef = InteractiveForwardRefProps & {
  setProgress?: (value: number) => void;
};

/**
 * Porting da react-native-skia a Canvas 2D.
 *
 * - `<Path style="stroke" start={s} end={1} strokeCap="round">` → un arco che
 *   parte a `s * 2π` e arriva a `2π`, con `lineCap: 'round'`.
 * - `<SweepGradient>` → `createConicGradient`.
 * - `<BlurMask blur={5} style="solid">` → l'arco è disegnato due volte, la
 *   prima con `filter: blur(5px)` (in Skia "solid" = forma piena + alone).
 */
export const Loader = forwardRef<LoaderRef, LoaderProps>(
  ({ type, start: startProp }, ref) => {
    const size = DEFAULT_SIZE;
    const strokeWidth = 15;
    const radius = (size - strokeWidth) / 2;
    const canvasSize = size + 30;

    const progress = useAnimatedValue(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const spins = type === 'with-animation' || type === 'with-basic-animation';

    const startFor = useCallback(
      (value: number) => {
        if (type === 'basic') return 0;
        if (type === 'with-animation') {
          return interpolate(value, [0, 0.5, 1], [0.6, 0.3, 0.6]);
        }
        if (type === 'with-progress') return startProp ?? 0.6;
        return 0.6;
      },
      [type, startProp]
    );

    const draw = useCallback(
      (value: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== canvasSize * dpr) {
          canvas.width = canvas.height = canvasSize * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        const center = canvasSize / 2;
        const start = startFor(value);

        const arc = new Path2D();
        // Skia parte dalle 3 di orologio, come Canvas 2D: nessuna rotazione.
        arc.arc(center, center, radius, start * Math.PI * 2, Math.PI * 2);

        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';

        const plain = type === 'basic' || type === 'with-progress';

        if (plain) {
          ctx.strokeStyle = '#6370CA';
        } else {
          const gradient = ctx.createConicGradient(0, center, center);
          gradient.addColorStop(0, 'cyan');
          gradient.addColorStop(1 / 3, 'magenta');
          gradient.addColorStop(2 / 3, 'yellow');
          gradient.addColorStop(1, 'cyan');
          ctx.strokeStyle = gradient;

          ctx.save();
          ctx.filter = 'blur(5px)';
          ctx.stroke(arc);
          ctx.restore();
        }

        ctx.stroke(arc);

        if (spins && containerRef.current) {
          containerRef.current.style.transform = `rotate(${2 * Math.PI * value}rad)`;
        }
      },
      [canvasSize, radius, startFor, spins, type]
    );

    useEffect(() => {
      draw(progress.get());
      return progress.subscribe(draw);
    }, [progress, draw]);

    useImperativeHandle(
      ref,
      () => ({
        play: () => {
          progress.set(0);
          if (spins) {
            progress.timing(1, {
              duration: 1000,
              easing: linear,
              repeat: -1,
            });
          }
        },
        reset: () => progress.set(0),
        pause: () => progress.cancel(),
        setProgress: (value: number) => progress.set(value),
      }),
      [progress, spins]
    );

    return (
      <div style={styles.container}>
        <div
          ref={containerRef}
          className={spins ? 'animate-[fadeIn_1000ms_ease-out]' : undefined}
        >
          <canvas
            ref={canvasRef}
            style={{ width: canvasSize, height: canvasSize }}
          />
        </div>
      </div>
    );
  }
);

Loader.displayName = 'Loader';

const styles = {
  container: {
    display: 'flex',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
} satisfies Record<string, React.CSSProperties>;
