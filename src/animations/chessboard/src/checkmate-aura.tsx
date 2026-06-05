import { StyleSheet, View, useWindowDimensions } from 'react-native';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Canvas,
  Fill,
  ImageShader,
  Shader,
  makeImageFromView,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { GameReviewCard } from './components/game-review-card';
import { DEEP, EXIT_MS, GLOW, SPARK, WAVE, WAVE_MS } from './wave-shader';

import type { ShowOpts } from './types';
import type { SkImage } from '@shopify/react-native-skia';

type AuraApi = { show: (opts: ShowOpts) => void; hide: () => void };
const AuraContext = createContext<AuraApi>({ show: () => {}, hide: () => {} });
export const useCheckmateAura = () => useContext(AuraContext);

export const CheckmateAuraProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { width, height } = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const contentRef = useRef<View>(null); // wraps children only (no Canvas)
  const busy = useRef(false);

  const snapshot = useSharedValue<SkImage | null>(null);
  const progress = useSharedValue(0); // the shell sweeping out
  const breath = useSharedValue(0); // settled-glow breathing loop
  const vis = useSharedValue(0); // overlay opacity (show / hide)
  const blurIn = useSharedValue(0); // recap blur-into-focus (1 → 0)
  const origin = useSharedValue({ x: width / 2, y: height * 0.4 });

  // React state only for the (rare) card content — never per-frame.
  const [card, setCard] = useState<ShowOpts | null>(null);

  // Pending async work, tracked so we can cancel it if the screen unmounts
  // mid-transition (otherwise the rAF / timeout fire on an unmounted tree).
  const alive = useRef(true);
  const rafId = useRef<number | null>(null);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      if (cardTimer.current != null) clearTimeout(cardTimer.current);
    };
  }, []);

  const maxRadius = useDerivedValue(() => {
    const ox = origin.value.x;
    const oy = origin.value.y;
    return (
      Math.max(
        Math.hypot(ox, oy),
        Math.hypot(width - ox, oy),
        Math.hypot(ox, height - oy),
        Math.hypot(width - ox, height - oy),
      ) * 1.28
    );
  });

  const uniforms = useDerivedValue(() => ({
    u_res: [width, height],
    u_origin: [origin.value.x, origin.value.y],
    u_progress: progress.value,
    u_maxRadius: maxRadius.value,
    u_band: 64,
    u_amplitude: 50,
    u_chroma: 0.28,
    u_glowStrength: 0.55,
    u_wobble: 0.04,
    u_maxBlur: 24,
    u_breath: breath.value,
    u_tint: 0.8,
    u_glow: GLOW,
    u_deep: DEEP,
    u_spark: SPARK,
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: vis.value,
    pointerEvents: vis.value > 0.5 ? 'auto' : 'none',
  }));

  // Container gates visibility + a real Gaussian blur that clears as the recap
  // reveals (RN `filter`, new arch). The stagger handles the per-section motion.
  const cardStyle = useAnimatedStyle(() => ({
    opacity: vis.value,
    filter: [{ blur: blurIn.value * 16 }],
  }));

  // Runs on the JS thread (via scheduleOnRN) once the overlay is fully hidden —
  // clears the card and releases the busy latch. `busy` must only be mutated
  // here, never inside the reaction worklet (mutating a ref captured by a
  // worklet triggers a "modified key of an object passed to a worklet" warning).
  const clearCard = useCallback(() => {
    busy.current = false;
    setCard(null);
  }, []);

  // Free the snapshot + card once fully hidden.
  useAnimatedReaction(
    () => vis.value,
    (v, prev) => {
      if (prev !== null && prev > 0.01 && v <= 0.01) {
        snapshot.value = null;
        progress.value = 0;
        blurIn.value = 0;
        scheduleOnRN(clearCard);
      }
    },
  );

  const show = useCallback(
    async (opts: ShowOpts) => {
      if (busy.current) return;
      busy.current = true;
      origin.value = { x: opts.x, y: opts.y };
      // Snapshot the board content ONLY — not the root (which contains the Skia
      // Canvas). Capturing a view that holds a Canvas forces a synchronous
      // Canvas flush on iOS → a one-frame flicker.
      const image = await makeImageFromView(contentRef);
      if (!image || !alive.current) {
        busy.current = false;
        return;
      }
      snapshot.value = image;
      progress.value = 0;
      // Reveal on the NEXT frame: this gives the Canvas one frame to paint the
      // new SkImage (while the overlay is still invisible) so its texture is
      // uploaded to the GPU before we show it. Flipping vis in the same frame
      // paints one black frame before the texture lands → the flicker.
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        if (!alive.current) return;
        // Overlay covers — at progress 0 it is identical to the live board
        // (invisible cut), then the wave sweeps the blur across it.
        vis.value = 1;
        // Linear time — the drama lives in the dome's expansion SHAPE (an
        // ease-out shockwave, in the shader), not in the global clock. So the
        // gather/flash pace evenly while the dome still detonates.
        progress.value = withTiming(1, {
          duration: WAVE_MS,
          easing: Easing.linear,
        });
        // Slow breathing for the settled glow — shared value + withRepeat.
        breath.value = 0;
        breath.value = withRepeat(
          withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        );
      });
      // Mount the recap once the wave has swept the board — it cascades in
      // (enter()) while blurring into focus (blurIn → 0).
      cardTimer.current = setTimeout(
        () => {
          cardTimer.current = null;
          if (!alive.current) return;
          setCard(opts);
          blurIn.value = 1;
          blurIn.value = withTiming(0, {
            duration: 650,
            easing: Easing.out(Easing.cubic),
          });
        },
        Math.round(WAVE_MS * 0.55) - 750,
      );
    },
    [origin, snapshot, progress, breath, vis, blurIn],
  );

  const hide = useCallback(() => {
    vis.value = withTiming(0, {
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
    });
  }, [vis]);

  const api = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <AuraContext.Provider value={api}>
      <View ref={rootRef} collapsable={false} style={styles.fill}>
        <View ref={contentRef} collapsable={false} style={styles.fill}>
          {children}
        </View>
        <Animated.View
          style={[StyleSheet.absoluteFill, overlayStyle]}
          pointerEvents="box-none">
          <Canvas style={styles.fill} pointerEvents="none">
            <Fill>
              <Shader source={WAVE} uniforms={uniforms}>
                <ImageShader
                  image={snapshot}
                  fit="cover"
                  width={width}
                  height={height}
                />
              </Shader>
            </Fill>
          </Canvas>

          {card ? (
            <GameReviewCard card={card} style={cardStyle} onHide={hide} />
          ) : null}
        </Animated.View>
      </View>
    </AuraContext.Provider>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
