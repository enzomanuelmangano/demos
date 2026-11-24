'use client';

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef,
  useState,
} from 'react';

import {
  interpolate,
  useAnimatedValue,
  useAnimatedValues,
  usePanGesture,
} from '@/lib/animation';

import {
  SPRING_CONFIG,
  useSheetDimensions,
  useSheetPosition,
  SHEET_BACKGROUND,
  CONTENT_BACKGROUND,
  CONTAINER_BACKGROUND,
  SHEET_BORDER_RADIUS,
  HANDLE_WIDTH,
  HANDLE_HEIGHT,
  HANDLE_MARGIN,
  HANDLE_BACKGROUND,
  BUTTON_SIZE,
  BUTTON_BACKGROUND,
  BUTTON_OPACITY,
} from './constants';

// Initial Setup Demo
export const InitialSetup = () => {
  return <div style={styles.container} />;
};

// Basic Component Demo
type BottomSheetProps = {
  children?: React.ReactNode;
  hasBackdrop?: boolean;
};

const BasicBottomSheet: React.FC<BottomSheetProps> = ({ children }) => {
  const { sheetWidth, sheetHeight } = useSheetDimensions();

  return (
    <div
      style={{
        ...styles.bottomSheetContainer,
        height: sheetHeight,
        width: sheetWidth,
      }}
    >
      <div style={styles.line} />
      {children}
    </div>
  );
};

export const BasicComponent = () => (
  <div style={styles.container}>
    <BasicBottomSheet>
      <div style={{ flex: 1, backgroundColor: CONTENT_BACKGROUND }} />
    </BasicBottomSheet>
  </div>
);

/**
 * Il drag verticale del foglio, condiviso dalle tre demo.
 * Era `Gesture.Pan()` + `useSharedValue` di Reanimated.
 */
function useSheetDrag({
  onSettle,
}: {
  onSettle?: (destination: number) => void;
} = {}) {
  const { sheetWidth, sheetHeight } = useSheetDimensions();
  const { bottomPosition, topPosition, threshold } = useSheetPosition();
  const translateY = useAnimatedValue(bottomPosition);
  const context = useRef({ y: 0 });

  // Le posizioni dipendono dalla larghezza della finestra, che al primo
  // render (lato server) vale 0: il foglio partirebbe dalla posizione mobile
  // anche su desktop. Quando cambiano, un foglio fermo su una delle due
  // posizioni si sposta su quella nuova.
  const positionsRef = useRef({ bottomPosition, topPosition });
  useEffect(() => {
    const previous = positionsRef.current;
    positionsRef.current = { bottomPosition, topPosition };
    const y = translateY.get();
    if (y === previous.bottomPosition) translateY.set(bottomPosition);
    else if (y === previous.topPosition) translateY.set(topPosition);
  }, [bottomPosition, topPosition, translateY]);
  const sheetRef = useRef<HTMLDivElement>(null);

  const settle = useCallback(
    (destination: number) => {
      onSettle?.(destination);
      translateY.spring(destination, SPRING_CONFIG);
    },
    [translateY, onSettle]
  );

  const panRef = usePanGesture<HTMLDivElement>({
    onBegin: () => {
      context.current = { y: translateY.get() };
    },
    onUpdate: (event) => {
      translateY.set(
        Math.max(event.translationY + context.current.y, topPosition)
      );
    },
    onEnd: () => {
      settle(translateY.get() > threshold ? bottomPosition : topPosition);
    },
  });

  useAnimatedValues([translateY], ([y]) => {
    const node = sheetRef.current;
    if (!node) return;
    const borderRadius = interpolate(
      y,
      [topPosition, bottomPosition],
      [SHEET_BORDER_RADIUS.min, SHEET_BORDER_RADIUS.max]
    );
    node.style.borderRadius = `${borderRadius}px`;
    // Nell'originale lo stile statico aveva `translateX: -sheetWidth / 2`, ma
    // in react-native una `transform` successiva sostituisce la precedente: lo
    // stile animato (solo translateY) la cancellava. Il foglio resta centrato
    // dal layout, senza spostamento orizzontale.
    node.style.transform = `translateY(${y}px)`;
  });

  const setRef = (node: HTMLDivElement | null) => {
    panRef.current = node;
    sheetRef.current = node;
  };

  return {
    setRef,
    settle,
    translateY,
    sheetWidth,
    sheetHeight,
    bottomPosition,
    topPosition,
  };
}

// Pan Gesture Demo
const PanBottomSheet: React.FC<BottomSheetProps> = ({ children }) => {
  const { setRef, sheetWidth, sheetHeight } = useSheetDrag();

  return (
    <div
      ref={setRef}
      style={{
        ...styles.bottomSheetContainer,
        height: sheetHeight,
        width: sheetWidth,
      }}
    >
      <div style={styles.line} />
      {children}
    </div>
  );
};

export const PanGesture = () => (
  <div style={styles.container}>
    <PanBottomSheet>
      <div style={{ flex: 1, backgroundColor: CONTENT_BACKGROUND }} />
    </PanBottomSheet>
  </div>
);

// Border Radius Demo
const BorderRadiusBottomSheet: React.FC<BottomSheetProps> = ({ children }) => {
  const { setRef, sheetWidth, sheetHeight } = useSheetDrag();

  return (
    <div
      ref={setRef}
      style={{
        ...styles.bottomSheetContainer,
        height: sheetHeight,
        width: sheetWidth,
      }}
    >
      <div style={styles.line} />
      {children}
    </div>
  );
};

export const BorderRadius = () => (
  <div style={styles.container}>
    <BorderRadiusBottomSheet>
      <div style={{ flex: 1, backgroundColor: CONTENT_BACKGROUND }} />
    </BorderRadiusBottomSheet>
  </div>
);

// Final Demo with External Control
export type BottomSheetRefProps = {
  scrollTo: (destination: number) => void;
  isActive: () => boolean;
};

const AnimatedBackdrop: React.FC<{
  active: boolean;
  onTap: () => void;
}> = ({ active, onTap }) => (
  <button onClick={onTap} className="absolute inset-0">
    <div
      style={{
        ...stylesBackdrop.container,
        position: 'absolute',
        inset: 0,
        opacity: active ? 1 : 0,
        transition: 'opacity 200ms linear',
      }}
    />
  </button>
);

const stylesBackdrop = {
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
} satisfies Record<string, React.CSSProperties>;

const FinalBottomSheet = forwardRef<BottomSheetRefProps, BottomSheetProps>(
  ({ children, hasBackdrop = true }, ref) => {
    const [active, setActive] = useState(false);
    const activeRef = useRef(false);

    const { setRef, settle, sheetWidth, sheetHeight, bottomPosition } =
      useSheetDrag({
        onSettle: (destination) => {
          activeRef.current = destination !== bottomPositionRef.current;
          setActive(activeRef.current);
        },
      });

    // `bottomPosition` serve dentro onSettle, che è creato prima: lo leggiamo
    // da un ref per evitare una dipendenza circolare fra i due hook.
    const bottomPositionRef = useRef(bottomPosition);
    bottomPositionRef.current = bottomPosition;

    useImperativeHandle(
      ref,
      () => ({
        scrollTo: settle,
        isActive: () => activeRef.current,
      }),
      [settle]
    );

    return (
      <>
        {hasBackdrop && (
          <AnimatedBackdrop
            active={active}
            onTap={() => settle(bottomPosition)}
          />
        )}
        <div
          ref={setRef}
          style={{
            ...styles.bottomSheetContainer,
            height: sheetHeight,
            width: sheetWidth,
          }}
        >
          <div style={styles.line} />
          {children}
        </div>
      </>
    );
  }
);

FinalBottomSheet.displayName = 'FinalBottomSheet';

type FinalDemoProps = {
  hasBackdrop?: boolean;
};

export const FinalDemo: React.FC<FinalDemoProps> = ({ hasBackdrop = true }) => {
  const ref = useRef<BottomSheetRefProps>(null);
  const { bottomPosition, topPosition } = useSheetPosition();

  const onPress = useCallback(() => {
    const isActive = ref?.current?.isActive();
    ref?.current?.scrollTo(isActive ? bottomPosition : topPosition);
  }, [bottomPosition, topPosition]);

  return (
    <div style={styles.container}>
      <button type="button" style={styles.button} onClick={onPress} />
      <FinalBottomSheet ref={ref} hasBackdrop={hasBackdrop}>
        <div style={{ flex: 1, backgroundColor: CONTENT_BACKGROUND }} />
      </FinalBottomSheet>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flex: 1,
    position: 'relative',
    backgroundColor: CONTAINER_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bottomSheetContainer: {
    display: 'flex',
    flexDirection: 'column',
    position: 'absolute',
    backgroundColor: SHEET_BACKGROUND,
    borderRadius: SHEET_BORDER_RADIUS.max,
    zIndex: 100,
    boxShadow: '0 2px 3.84px rgba(0, 0, 0, 0.25)',
    cursor: 'grab',
  },
  line: {
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    backgroundColor: HANDLE_BACKGROUND,
    alignSelf: 'center',
    marginTop: HANDLE_MARGIN,
    marginBottom: HANDLE_MARGIN,
    borderRadius: HANDLE_HEIGHT / 2,
    flex: 'none',
  },
  button: {
    height: BUTTON_SIZE,
    aspectRatio: 1,
    backgroundColor: BUTTON_BACKGROUND,
    borderRadius: BUTTON_SIZE / 2,
    opacity: BUTTON_OPACITY,
    zIndex: 50,
    border: 'none',
    cursor: 'pointer',
  },
} satisfies Record<string, React.CSSProperties>;
