'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import { InteractiveForwardRefProps } from '@/components/interactive';
import { easeInOutQuad } from '@/lib/animation';

const getRandomColor = () => {
  return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
};

const initialLeftColor = 'red';
const initialRightColor = 'blue';

type AnimatedGradientProps = {
  animated?: boolean;
};

/** Un colore CSS qualsiasi risolto in componenti RGB, per poterlo interpolare. */
const toRgb = (color: string): [number, number, number] => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
};

const mix = (
  from: [number, number, number],
  to: [number, number, number],
  t: number
) =>
  `rgb(${from.map((c, i) => Math.round(c + (to[i] - c) * t)).join(', ')})`;

/**
 * Porting da react-native-skia: `<Fill>` con `<LinearGradient>` da (0,0)
 * all'angolo opposto del canvas, con i due colori animati via `withTiming`.
 */
export const AnimatedGradient = forwardRef<
  InteractiveForwardRefProps,
  AnimatedGradientProps
>(({ animated = true }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef({
    from: [toRgb(initialLeftColor), toRgb(initialRightColor)] as const,
    to: [toRgb(initialLeftColor), toRgb(initialRightColor)] as const,
  });
  const rafRef = useRef<number | null>(null);

  const draw = useCallback((progress: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { from, to } = colorsRef.current;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, mix(from[0], to[0], progress));
    gradient.addColorStop(1, mix(from[1], to[1], progress));

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }, []);

  const animateTo = useCallback(
    (left: string, right: string) => {
      const { from, to } = colorsRef.current;
      colorsRef.current = {
        // riparte dal colore attualmente mostrato
        from: to.length ? to : from,
        to: [toRgb(left), toRgb(right)] as const,
      };

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      const duration = animated ? 250 : 0;
      let startedAt: number | null = null;

      const step = (now: number) => {
        if (startedAt === null) startedAt = now;
        const t = duration === 0 ? 1 : Math.min((now - startedAt) / duration, 1);
        draw(easeInOutQuad(t));
        rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };

      rafRef.current = requestAnimationFrame(step);
    },
    [animated, draw]
  );

  useEffect(() => {
    draw(1);
    const onResize = () => draw(1);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  useImperativeHandle(ref, () => ({
    play: () => animateTo(getRandomColor(), getRandomColor()),
    reset: () => animateTo(initialLeftColor, initialRightColor),
    pause: () => {},
  }));

  return (
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', flex: 1 }} />
  );
});

AnimatedGradient.displayName = 'AnimatedGradient';
