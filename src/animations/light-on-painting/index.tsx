import { StyleSheet, View } from 'react-native';

import { useCallback, useEffect, useState } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { Canvas, CanvasRef } from 'react-native-webgpu';
import { scheduleOnRN } from 'react-native-worklets';

import { Paginator } from './components/paginator';
import { defaultSheetSettings } from './components/settings';
import { SettingsSheet } from './components/settings-sheet';
import {
  CORD_ANCHOR_X,
  CORD_MAX_LENGTH,
  CORD_MIN_LENGTH,
  LIGHT_GRAB_RADIUS,
  LIGHT_Z_MAX,
  LIGHT_Z_MIN,
  PAGE_COMMIT_FRACTION,
  PAGE_FLICK_VELOCITY,
  PAINTING_CENTER_Y,
  PAINTING_WIDTH_RATIO,
  RelightMode,
  TAP_DURATION,
  TAP_GAP,
  TAP_SLOP,
} from './constants';
import { useRelightRenderer } from './hooks/use-relight-renderer';
import { PAINTINGS } from './paintings';
import { cordAnchorY, createLightSettings, createLightState } from './state';

import type { SheetSettings } from './components/settings';

/**
 * Two night paintings, each built around a light source, relit by a bulb you
 * can carry across them.
 *
 * Their depth and surface normals were estimated offline and baked into a
 * surface field (see scripts/bake-painting-surface.py), so every frame is a
 * single fragment pass. Physics, uniforms and drawing all run on the UI thread,
 * so nothing the JS thread is busy with can stutter the light.
 *
 * Take hold of the bulb to drag it; swipe anywhere else to change painting.
 */
export const LightOnPainting = () => {
  const canvasRef = useSharedCanvasRef();
  const light = useSharedValue(createLightState());
  const settings = useSharedValue(createLightSettings());
  const running = useSharedValue(false);
  const layout = useSharedValue({ width: 1, height: 1 });
  const scrollX = useSharedValue(0);
  // Touch bookkeeping, all UI-thread: where the finger landed, and when the
  // last tap ended, so a double tap can be spotted without a second gesture.
  const touch = useSharedValue({ x: 0, y: 0, at: 0 });
  const lastTap = useSharedValue(0);
  const pinchStart = useSharedValue(0);
  const releaseVelocity = useSharedValue(0);

  const [sheetSettings, setSheetSettings] =
    useState<SheetSettings>(defaultSheetSettings);
  const [sheetOpen, setSheetOpen] = useState(false);

  useRelightRenderer(canvasRef, light, settings, running, scrollX);

  const applySettings = useCallback((change: Partial<SheetSettings>) => {
    setSheetSettings(current => ({ ...current, ...change }));
  }, []);

  /**
   * React owns the sheet's settings and pushes whole objects to the UI thread —
   * mutating a shared value's properties from JS would never propagate.
   *
   * The write lives in an effect rather than in the state updater above, which
   * React runs during the render phase; touching a shared value there is what
   * Reanimated's strict mode warns about.
   */
  useEffect(() => {
    settings.set({
      intensity: sheetSettings.intensity,
      // A cord with no bulb on the end reads as a stray line, so it goes too.
      cordOpacity: sheetSettings.showCord && sheetSettings.showBulb ? 1 : 0,
      bulbOpacity: sheetSettings.showBulb ? 1 : 0,
      tethered: sheetSettings.showCord && sheetSettings.showBulb,
      // Depth wins over relighting: it is a look at the field underneath.
      mode: sheetSettings.showDepth
        ? RelightMode.DEPTH
        : sheetSettings.relight
          ? RelightMode.RELIT
          : RelightMode.ALBEDO,
    });
  }, [sheetSettings, settings]);

  const openSheet = useCallback(() => setSheetOpen(true), []);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin(event => {
      'worklet';
      touch.set({ x: event.x, y: event.y, at: Date.now() });
      const state = light.get();
      const { width, height } = layout.get();
      const scale = width * PAINTING_WIDTH_RATIO;
      const bulbX = width * 0.5 + state.x * scale;
      const bulbY = height * PAINTING_CENTER_Y + state.y * scale;

      if (Math.hypot(bulbX - event.x, bulbY - event.y) <= LIGHT_GRAB_RADIUS) {
        // Keep the offset the finger grabbed at, so the bulb doesn't snap its
        // centre to the fingertip.
        state.grabX = state.x - (event.x - width * 0.5) / scale;
        state.grabY = state.y - (event.y - height * PAINTING_CENTER_Y) / scale;
        state.targetX = state.x;
        state.targetY = state.y;
        // Taking hold is what wakes the physics, cord or no cord. Set from the
        // tethered drag alone, an untethered bulb never left its rest pose —
        // the loop kept resetting it there because it had never been paid out.
        state.paidOut = true;
        state.grabbed = true;
        state.held = true;
        return;
      }
      // Not the bulb: this swipe pages between paintings. The flag goes up on
      // touch-down, not on activation — while it is down the loop stops
      // settling the page, and without it the settle undoes each drag frame.
      state.grabbed = false;
      state.pageStart = state.pageShift;
      state.paging = true;
    })
    .onUpdate(event => {
      'worklet';
      const state = light.get();
      const { width, height } = layout.get();
      const scale = width * PAINTING_WIDTH_RATIO;

      if (!state.grabbed) {
        const last = PAINTINGS.length - 1;
        const raw = state.pageStart - event.translationX / width;
        // Rubber-band past the ends rather than stopping dead.
        state.pageShift =
          raw < 0 ? raw * 0.35 : raw > last ? last + (raw - last) * 0.35 : raw;
        return;
      }

      const nextX = (event.x - width * 0.5) / scale + state.grabX;
      const nextY =
        (event.y - height * PAINTING_CENTER_Y) / scale + state.grabY;

      if (!settings.get().tethered) {
        // No cord: the light goes exactly where the finger puts it.
        state.targetX = nextX;
        state.targetY = nextY;
        return;
      }

      // Dragging pays cord out or reels it in, within its limits; the bulb is
      // then held on the arc that length allows.
      const anchorY = cordAnchorY(height / width);
      const dx = nextX - CORD_ANCHOR_X;
      const dy = nextY - anchorY;
      const distance = Math.hypot(dx, dy) || 1e-6;
      state.cordLength = Math.min(
        CORD_MAX_LENGTH,
        Math.max(CORD_MIN_LENGTH, distance),
      );
      // A target, not a position: the loop eases onto it every frame, which is
      // what keeps the bulb moving between touch events.
      state.targetX = CORD_ANCHOR_X + (dx / distance) * state.cordLength;
      state.targetY = anchorY + (dy / distance) * state.cordLength;
    })
    .onEnd(event => {
      'worklet';
      releaseVelocity.set(event.velocityX);
    })
    // The commit lives here rather than in onEnd because a cancelled pan never
    // reaches onEnd — and then no page is ever chosen, so the settle drags the
    // swipe straight back to where it started and the gesture appears dead.
    .onFinalize(event => {
      'worklet';
      const state = light.get();
      const start = touch.get();
      const travelled = Math.hypot(
        event?.translationX ?? 0,
        event?.translationY ?? 0,
      );
      if (travelled < TAP_SLOP && Date.now() - start.at < TAP_DURATION) {
        const now = Date.now();
        if (now - lastTap.get() < TAP_GAP) {
          lastTap.set(0);
          // Opening the sheet is React state, so this is the one place the
          // gesture has to hop back to the JS thread.
          scheduleOnRN(openSheet);
        } else {
          lastTap.set(now);
        }
      }

      if (state.paging) {
        // Positive when the swipe is heading towards the next painting.
        const moved = state.pageShift - state.pageStart;
        const velocity = releaseVelocity.get();
        const flicked = Math.abs(velocity) > PAGE_FLICK_VELOCITY;
        const direction = flicked ? (velocity < 0 ? 1 : -1) : Math.sign(moved);
        const committed =
          flicked || Math.abs(moved) > PAGE_COMMIT_FRACTION
            ? state.pageStart + direction
            : state.pageStart;
        state.pageTarget = Math.max(
          0,
          Math.min(PAINTINGS.length - 1, Math.round(committed)),
        );
        state.paging = false;
      }

      releaseVelocity.set(0);
      state.grabbed = false;
      state.held = false;
    });

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      'worklet';
      pinchStart.set(light.get().targetZ);
    })
    .onUpdate(event => {
      'worklet';
      light.get().targetZ = Math.min(
        LIGHT_Z_MAX,
        Math.max(LIGHT_Z_MIN, pinchStart.get() * event.scale),
      );
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  return (
    <View
      style={styles.container}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        if (width > 0 && height > 0) {
          layout.set({ width, height });
        }
      }}>
      <GestureDetector gesture={gesture}>
        <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
      </GestureDetector>

      <Paginator count={PAINTINGS.length} pageShift={scrollX} />

      {/* Mounted only while open: the SwiftUI host lays its content out even
          when the sheet is not presented, which parks a stray panel on screen. */}
      {sheetOpen && (
        <SettingsSheet
          isOpen
          settings={sheetSettings}
          onChange={applySettings}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </View>
  );
};

/** The canvas ref is a plain React ref; only its context crosses to the UI. */
const useSharedCanvasRef = () => {
  const [ref] = useState(
    () => ({ current: null }) as React.RefObject<CanvasRef | null>,
  );
  return ref;
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    flex: 1,
  },
});
