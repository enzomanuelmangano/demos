'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import { InteractiveForwardRefProps } from '@/components/interactive';
import { easeInOutQuad, interpolate } from '@/lib/animation';

// The logarithmic spiral will depend on the index
const logarithmicSpiral = ({
  angle,
  index,
}: {
  angle: number;
  index: number;
}) => {
  const a = index / 4;
  const k = 0.005;
  return {
    x: a * Math.exp(k * angle) * Math.cos(angle * index),
    y: a * Math.exp(k * angle) * Math.sin(angle * index),
  };
};

const spiralCircleCount = 1500;
const ANIMATION_DURATION = 1500;

type SpiralProps = {
  withFixedRadius?: boolean;
  withSweepGradient?: boolean;
  withAnimation?: boolean;
};

/**
 * Porting della spirale da react-native-skia a Canvas 2D.
 *
 * Corrispondenze:
 * - `<Path>` con 1500 `addCircle` → un solo `Path2D` con altrettanti `arc`
 * - `<SweepGradient>`             → `createConicGradient`
 * - `<BlurMask blur={5} style="solid">` → il tracciato viene disegnato una
 *   seconda volta sotto, con `filter: blur(5px)`: "solid" in Skia significa
 *   forma piena più alone sfocato.
 * - `withTiming` sulle coordinate  → interpolazione fra posizione precedente e
 *   nuova, guidata da requestAnimationFrame.
 */
const Spiral = forwardRef<InteractiveForwardRefProps, SpiralProps>(
  (
    { withFixedRadius = false, withSweepGradient = true, withAnimation = true },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const angleRef = useRef(Math.PI / 2);
    const fromRef = useRef<{ x: number; y: number }[]>([]);
    const toRef = useRef<{ x: number; y: number }[]>([]);
    const startedAtRef = useRef<number | null>(null);
    const rafRef = useRef<number | null>(null);

    const coordinatesFor = (angle: number) =>
      Array.from({ length: spiralCircleCount }, (_, index) =>
        logarithmicSpiral({ angle, index })
      );

    const draw = useCallback(
      (progress: number) => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = container.getBoundingClientRect();
        if (width === 0 || height === 0) return;

        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const maxDistance = Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);

        // `<Group transform={[translateX, translateY]}>`
        ctx.save();
        ctx.translate(width / 2, height / 2);

        const path = new Path2D();
        const from = fromRef.current;
        const to = toRef.current;

        for (let index = 0; index < spiralCircleCount; index++) {
          const a = from[index];
          const b = to[index];
          if (!b) continue;
          const x = a ? a.x + (b.x - a.x) * progress : b.x;
          const y = a ? a.y + (b.y - a.y) * progress : b.y;

          const distanceFromCenter = Math.sqrt(x ** 2 + y ** 2);
          const radius = withFixedRadius
            ? 1
            : interpolate(distanceFromCenter, [0, maxDistance], [1, 0.1]);

          if (radius <= 0) continue;
          path.moveTo(x + radius, y);
          path.arc(x, y, radius, 0, Math.PI * 2);
        }

        if (withSweepGradient) {
          const gradient = ctx.createConicGradient(0, 0, 0);
          gradient.addColorStop(0, 'cyan');
          gradient.addColorStop(1 / 3, 'magenta');
          gradient.addColorStop(2 / 3, 'yellow');
          gradient.addColorStop(1, 'cyan');
          ctx.fillStyle = gradient;

          // alone sfocato (BlurMask style="solid")
          ctx.save();
          ctx.filter = 'blur(5px)';
          ctx.fill(path);
          ctx.restore();
        } else {
          ctx.fillStyle = 'white';
        }

        ctx.fill(path);
        ctx.restore();
      },
      [withFixedRadius, withSweepGradient]
    );

    const animateTo = useCallback(
      (angle: number) => {
        fromRef.current = toRef.current.length
          ? toRef.current
          : coordinatesFor(angleRef.current);
        angleRef.current = angle;
        toRef.current = coordinatesFor(angle);
        startedAtRef.current = null;

        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

        const duration = withAnimation ? ANIMATION_DURATION : 0;

        const step = (now: number) => {
          if (startedAtRef.current === null) startedAtRef.current = now;
          const elapsed = now - startedAtRef.current;
          const t = duration === 0 ? 1 : Math.min(elapsed / duration, 1);
          draw(easeInOutQuad(t));
          rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
        };

        rafRef.current = requestAnimationFrame(step);
      },
      [draw, withAnimation]
    );

    useEffect(() => {
      toRef.current = coordinatesFor(angleRef.current);
      draw(1);

      const onResize = () => draw(1);
      window.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('resize', onResize);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }, [draw]);

    useImperativeHandle(ref, () => ({
      play: () => animateTo(Math.PI * 2 * Math.random()),
      reset: () => animateTo(Math.PI / 2),
      pause: () => {},
    }));

    return (
      <div
        ref={containerRef}
        style={{ display: 'flex', flex: 1, backgroundColor: '#0a0a0a' }}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
    );
  }
);

Spiral.displayName = 'Spiral';

export { Spiral };
