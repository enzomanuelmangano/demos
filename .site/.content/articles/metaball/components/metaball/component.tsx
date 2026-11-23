'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { AnimatedSlider, SliderRef } from './animated-slider';

import { InteractiveForwardRefProps } from '@/components/interactive';
import {
  useAnimatedValue,
  useAnimatedValues,
  usePanGesture,
  type AnimatedValueController,
} from '@/lib/animation';

const RADIUS = 80;

type MetaballProps = {
  type: 'basic' | 'with-pan' | 'with-blur' | 'with-color-matrix';
};

type SliderContainerProps = {
  label: string;
  sliderRef: React.RefObject<SliderRef | null>;
  value: AnimatedValueController;
  initialProgress: number;
  minValue?: number;
  maxValue?: number;
  width: number;
};

const SliderContainer: React.FC<SliderContainerProps> = ({
  label,
  sliderRef,
  value,
  initialProgress,
  minValue = 0,
  maxValue = 100,
  width,
}) => {
  const [progress, setProgress] = useState(initialProgress);
  const labelText = label + ' (' + progress.toFixed(0) + ')';

  const handleUpdate = useCallback(
    (next: number) => {
      value.set(next);
      setProgress(next);
    },
    [value]
  );

  return (
    <div style={{ ...styles.sliderContainer, width: Math.min(width * 0.7, 350) }}>
      <span style={styles.label}>{labelText}</span>
      <AnimatedSlider
        style={{ width: Math.min(width * 0.5, 250), height: 2 }}
        minValue={minValue}
        maxValue={maxValue}
        ref={sliderRef}
        onUpdate={handleUpdate}
        initialProgress={initialProgress}
      />
    </div>
  );
};

/** `Dimensions.get('window').width` in origine. */
const useWindowWidth = () => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
};

/**
 * Porting dell'effetto metaball da react-native-skia.
 *
 * L'originale disegnava due cerchi in un `<Group>` con un `layer` che applica
 * `<Blur>` e `<ColorMatrix>`: la matrice alza molto il canale alpha e sottrae
 * un bias, così i bordi sfocati che si sovrappongono superano la soglia e le
 * due forme si fondono.
 *
 * Sul web è la stessa pipeline: i cerchi vanno su un canvas, e il canvas riceve
 * `filter: blur(Npx) url(#goo)` dove `#goo` è un `feColorMatrix` con la stessa
 * riga alpha. Le convenzioni coincidono (canali normalizzati 0-1), quindi i
 * valori dei tre slider si trasferiscono senza conversioni.
 */
export const Metaball = React.forwardRef<
  InteractiveForwardRefProps,
  MetaballProps
>(({ type }, ref) => {
  const filterId = useId().replace(/:/g, '');
  const windowWidth = useWindowWidth();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  const cx = useAnimatedValue(0);
  const cy = useAnimatedValue(0);

  const blur = useAnimatedValue(30);
  const alpha = useAnimatedValue(60);
  const position = useAnimatedValue(30);

  const blurSliderRef = useRef<SliderRef>(null);
  const alphaSliderRef = useRef<SliderRef>(null);
  const positionSliderRef = useRef<SliderRef>(null);

  const context = useRef({ x: 0, y: 0 });

  const showToast = useCallback(() => {
    toast.info('Slooow down - Continue reading 👀', {
      description: 'The Pan Gesture implementation is in the next demo 👇',
      duration: 3000,
      position: 'bottom-center',
      dismissible: true,
    });
  }, []);

  useImperativeHandle(ref, () => ({
    reset: () => {
      blurSliderRef.current?.setProgress(30);
      alphaSliderRef.current?.setProgress(60);
      positionSliderRef.current?.setProgress(30);
    },
    play: () => {},
    pause: () => {},
  }));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    if (sizeRef.current.width !== width || sizeRef.current.height !== height) {
      sizeRef.current = { width, height };
      cx.set(width / 2);
      cy.set(height / 2);
    }

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // `<SweepGradient c={vec(0, 0)} colors={['cyan','magenta','cyan']} />`.
    // Il centro effettivo è quello del canvas: nel rendering originale la
    // sweep gira attorno al centro (magenta a sinistra, cyan a destra).
    const gradient = ctx.createConicGradient(0, width / 2, height / 2);
    gradient.addColorStop(0, 'cyan');
    gradient.addColorStop(0.5, 'magenta');
    gradient.addColorStop(1, 'cyan');
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.arc(cx.get(), cy.get(), RADIUS, 0, Math.PI * 2);
    ctx.arc(width / 2, height / 2, RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }, [cx, cy]);

  const applyFilter = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (type === 'basic' || type === 'with-pan') {
      canvas.style.filter = 'none';
      return;
    }

    canvas.style.filter =
      type === 'with-color-matrix'
        ? `blur(${blur.get()}px) url(#${filterId})`
        : `blur(${blur.get()}px)`;
  }, [type, blur, filterId]);

  const panRef = usePanGesture<HTMLDivElement>({
    onBegin: () => {
      if (type === 'basic') {
        showToast();
        return;
      }
      context.current = { x: cx.get(), y: cy.get() };
    },
    onUpdate: ({ translationX, translationY }) => {
      if (type === 'basic') return;
      cx.set(translationX + context.current.x);
      cy.set(translationY + context.current.y);
    },
    onEnd: () => {
      if (type === 'basic') return;
      cx.spring(sizeRef.current.width / 2);
      cy.spring(sizeRef.current.height / 2);
    },
  });

  useAnimatedValues([cx, cy], () => draw());
  useAnimatedValues([blur, alpha, position], () => applyFilter());

  useEffect(() => {
    draw();
    applyFilter();
    const onResize = () => {
      draw();
      applyFilter();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw, applyFilter]);

  // La matrice va riscritta quando cambiano alpha/position: React non
  // ri-renderizza (i valori vivono fuori dallo stato), quindi la aggiorniamo
  // direttamente sull'elemento SVG.
  const matrixRef = useRef<SVGFEColorMatrixElement>(null);
  useAnimatedValues([alpha, position], ([a, p]) => {
    matrixRef.current?.setAttribute(
      'values',
      `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${a} ${-p}`
    );
  });

  return (
    <div style={styles.fill}>
      {type === 'with-color-matrix' && (
        <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
          <filter id={filterId}>
            <feColorMatrix
              ref={matrixRef}
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 60 -30"
            />
          </filter>
        </svg>
      )}
      <div
        ref={(node) => {
          containerRef.current = node;
          panRef.current = node;
        }}
        style={styles.fill}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      {type === 'with-color-matrix' && (
        <div style={styles.slidersContainer}>
          <SliderContainer
            label="blur"
            sliderRef={blurSliderRef}
            value={blur}
            initialProgress={30}
            width={windowWidth}
          />
          <SliderContainer
            label="alpha"
            sliderRef={alphaSliderRef}
            value={alpha}
            initialProgress={60}
            minValue={1}
            maxValue={100}
            width={windowWidth}
          />
          <SliderContainer
            label="pos"
            sliderRef={positionSliderRef}
            value={position}
            initialProgress={30}
            width={windowWidth}
          />
        </div>
      )}
    </div>
  );
});

Metaball.displayName = 'Metaball';

const styles = {
  // Default di una View di react-native-web: `minHeight: 0` lascia che l'area
  // del canvas si restringa per far posto agli slider (sul mobile), e gli
  // slider non si restringono (`flexShrink: 0`).
  fill: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    position: 'relative',
  },
  slidersContainer: {
    display: 'flex',
    flexShrink: 0,
    flexDirection: 'column',
    width: '100%',
    alignItems: 'center',
    marginBottom: 50,
  },
  sliderContainer: {
    display: 'flex',
    height: 45,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  label: {
    // Era un <Text>: line-height normal (14px), non quello ereditato.
    lineHeight: 'normal',
    fontSize: 12,
    fontFamily: 'monospace',
    color: 'var(--color-text-body)',
    width: '20%',
    minWidth: 90,
  },
} satisfies Record<string, React.CSSProperties>;
