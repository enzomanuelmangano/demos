'use client';

import React, { forwardRef, useImperativeHandle } from 'react';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';
import { useAnimatedValue, useAnimatedValues } from '@/lib/animation';

const SIZE = 100.0;

/** Il quadrato animato: stile applicato al nodo a ogni frame. */
function useSquareStyle(
  apply: (node: HTMLDivElement) => void,
  deps: unknown[] = []
) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) apply(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

const AnimatedSquare = forwardRef<InteractiveForwardRefProps>((_, ref) => {
  const progress = useAnimatedValue(1);
  const scale = useAnimatedValue(2);
  const nodeRef = useSquareStyle(() => {});

  useAnimatedValues([progress, scale], ([p, s]) => {
    const node = nodeRef.current;
    if (!node) return;
    node.style.opacity = String(p);
    node.style.borderRadius = `${(p * SIZE) / 2}px`;
    node.style.transform = `scale(${s}) rotate(${p * 2 * Math.PI}rad)`;
  });

  const reset = React.useCallback(() => {
    progress.set(1);
    scale.set(2);
  }, [progress, scale]);

  const play = React.useCallback(() => {
    reset();
    setTimeout(() => {
      // `withRepeat(withSpring(...), -1, true)`: la molla va avanti e indietro
      // all'infinito. La riproduciamo alternando il target a ogni assestamento.
      const bounce = (
        value: typeof progress,
        from: number,
        to: number,
        goingTo = to
      ) => {
        value.spring(goingTo, {
          damping: 10,
          stiffness: 100,
          onFinish: () => bounce(value, from, to, goingTo === to ? from : to),
        });
      };
      bounce(progress, 1, 0.5);
      bounce(scale, 2, 1);
    }, 100);
  }, [progress, scale, reset]);

  useImperativeHandle(ref, () => ({ play, reset, pause: () => {} }));

  return (
    <div style={styles.container}>
      <div
        ref={nodeRef}
        style={{ height: SIZE, width: SIZE, backgroundColor: 'blue' }}
      />
    </div>
  );
});

AnimatedSquare.displayName = 'AnimatedSquare';

const AnimatedSquareOpacity = forwardRef<InteractiveForwardRefProps>(
  (_, ref) => {
    const progress = useAnimatedValue(0);
    const nodeRef = useSquareStyle(() => {});

    useAnimatedValues([progress], ([p]) => {
      if (nodeRef.current) nodeRef.current.style.opacity = String(p);
    });

    const reset = React.useCallback(() => progress.set(0), [progress]);

    const play = React.useCallback(() => {
      reset();
      setTimeout(() => progress.timing(1, { duration: 500 }), 100);
    }, [progress, reset]);

    useImperativeHandle(ref, () => ({ play, reset, pause: () => {} }));

    return (
      <div style={styles.container}>
        <div
          ref={nodeRef}
          style={{ height: SIZE, width: SIZE, backgroundColor: 'blue' }}
        />
      </div>
    );
  }
);

AnimatedSquareOpacity.displayName = 'AnimatedSquareOpacity';

type AnimatedSquareOpacityAndScaleProps = {
  scaleAnimationType: 'spring' | 'timing';
  fromOpacity?: number;
  toOpacity?: number;
  showBorderRadiusAnimation?: boolean;
};

const AnimatedSquareOpacityAndScale = forwardRef<
  InteractiveForwardRefProps,
  AnimatedSquareOpacityAndScaleProps
>(
  (
    {
      scaleAnimationType,
      fromOpacity = 0,
      toOpacity = 1,
      showBorderRadiusAnimation = false,
    },
    ref
  ) => {
    const progress = useAnimatedValue(fromOpacity);
    const scale = useAnimatedValue(1);
    const nodeRef = useSquareStyle(() => {});

    useAnimatedValues(
      [progress, scale],
      ([p, s]) => {
        const node = nodeRef.current;
        if (!node) return;
        node.style.opacity = String(p);
        node.style.borderRadius = showBorderRadiusAnimation
          ? `${(p * SIZE) / 2}px`
          : '0px';
        node.style.transform = `scale(${s})`;
      },
      [showBorderRadiusAnimation]
    );

    const reset = React.useCallback(() => {
      progress.set(fromOpacity);
      scale.set(1);
    }, [progress, scale, fromOpacity]);

    const play = React.useCallback(() => {
      reset();
      setTimeout(() => {
        progress.timing(toOpacity, { duration: 500 });
        if (scaleAnimationType === 'spring') {
          scale.spring(2, { damping: 10, stiffness: 100 });
        } else {
          scale.timing(2, { duration: 300 });
        }
      }, 100);
    }, [progress, scale, reset, toOpacity, scaleAnimationType]);

    useImperativeHandle(ref, () => ({ play, reset, pause: () => {} }));

    return (
      <div style={styles.container}>
        <div
          ref={nodeRef}
          style={{ height: SIZE, width: SIZE, backgroundColor: 'blue' }}
        />
      </div>
    );
  }
);

AnimatedSquareOpacityAndScale.displayName = 'AnimatedSquareOpacityAndScale';

const styles = {
  container: {
    display: 'flex',
    flex: 1,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
} satisfies Record<string, React.CSSProperties>;

const AnimatedSquareOpacityAndScaleSpring =
  forwardRef<InteractiveForwardRefProps>((_, ref) => (
    <AnimatedSquareOpacityAndScale
      ref={ref}
      scaleAnimationType="spring"
      fromOpacity={1}
      toOpacity={0.5}
    />
  ));
AnimatedSquareOpacityAndScaleSpring.displayName =
  'AnimatedSquareOpacityAndScaleSpring';

const AnimatedSquareOpacityAndScaleBorderRadiusSpring =
  forwardRef<InteractiveForwardRefProps>((_, ref) => (
    <AnimatedSquareOpacityAndScale
      ref={ref}
      scaleAnimationType="spring"
      fromOpacity={1}
      toOpacity={0.5}
      showBorderRadiusAnimation
    />
  ));
AnimatedSquareOpacityAndScaleBorderRadiusSpring.displayName =
  'AnimatedSquareOpacityAndScaleBorderRadiusSpring';

const AnimatedSquareOpacityAndScaleTiming =
  forwardRef<InteractiveForwardRefProps>((_, ref) => (
    <AnimatedSquareOpacityAndScale
      ref={ref}
      scaleAnimationType="timing"
      fromOpacity={0}
      toOpacity={1}
    />
  ));
AnimatedSquareOpacityAndScaleTiming.displayName =
  'AnimatedSquareOpacityAndScaleTiming';

type AnimatedSquareOpacityAndScaleDemoProps = {
  scaleAnimationType: 'spring' | 'timing';
  showBorderRadiusAnimation?: boolean;
};

export const AnimatedSquareOpacityAndScaleDemo = forwardRef<
  InteractiveForwardRefProps,
  AnimatedSquareOpacityAndScaleDemoProps
>(({ scaleAnimationType, showBorderRadiusAnimation = false }, ref) => (
  <InteractiveBox
    ref={ref}
    withPlay
    // eslint-disable-next-line react/no-children-prop -- InteractiveBox accetta il tipo componente
    children={
      scaleAnimationType === 'spring'
        ? showBorderRadiusAnimation
          ? AnimatedSquareOpacityAndScaleBorderRadiusSpring
          : AnimatedSquareOpacityAndScaleSpring
        : AnimatedSquareOpacityAndScaleTiming
    }
  />
));

AnimatedSquareOpacityAndScaleDemo.displayName =
  'AnimatedSquareOpacityAndScaleDemo';

export const FinalAnimatedSquareDemo = () => (
  // eslint-disable-next-line react/no-children-prop -- InteractiveBox accetta il tipo componente
  <InteractiveBox children={AnimatedSquare} withPlay withReset />
);

export const AnimatedSquareOpacityDemo = () => (
  // eslint-disable-next-line react/no-children-prop -- InteractiveBox accetta il tipo componente
  <InteractiveBox children={AnimatedSquareOpacity} withPlay />
);
