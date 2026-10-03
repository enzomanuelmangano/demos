import { StyleSheet, Text, View } from 'react-native';

import { useEffect, useRef, useState } from 'react';

import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

// Frame-time HUD for profiling the demos. Enabled only when the bundle is
// built with EXPO_PUBLIC_PERF_HUD=1, so it never ships to users.
//
// It measures both threads that drive an animation:
// - UI: a Reanimated frame callback, fired once per display refresh on the
//   UI thread. A late callback means the UI thread missed a frame.
// - JS: a requestAnimationFrame loop on the JS thread.
//
// Counting restarts whenever the demo changes, after a short settle delay, so
// the numbers describe the running animation and not the mount. The worst
// frame during that settle delay is reported separately as `mount`.
export const PERF_HUD_ENABLED = process.env.EXPO_PUBLIC_PERF_HUD === '1';

const FRAME_MS = 1000 / 60;
// A frame counts as dropped once it takes longer than one and a half refresh
// intervals; each extra interval it spans is one dropped frame.
const DROP_THRESHOLD_MS = FRAME_MS * 1.5;
const SETTLE_MS = 2500;
// Counting stops after this window, so whatever runs after a scripted
// interaction (an accessibility-tree read, a screenshot) is not counted.
const WINDOW_MS = 8000;

type FrameStats = {
  // Negative until the measuring thread sees its first frame after a reset;
  // each thread then anchors the window on its own clock.
  start: number;
  last: number;
  frames: number;
  dropped: number;
  worst: number;
  mountWorst: number;
};

const emptyStats = (): FrameStats => ({
  start: -1,
  last: 0,
  frames: 0,
  dropped: 0,
  worst: 0,
  mountWorst: 0,
});

const record = (stats: FrameStats, now: number, delta: number) => {
  'worklet';
  if (stats.start < 0) {
    stats.start = now + SETTLE_MS;
  }
  if (now > stats.start + WINDOW_MS) {
    return;
  }
  stats.last = now;
  if (now < stats.start) {
    stats.mountWorst = Math.max(stats.mountWorst, delta);
    return;
  }
  stats.frames += 1;
  stats.worst = Math.max(stats.worst, delta);
  if (delta > DROP_THRESHOLD_MS) {
    stats.dropped += Math.round(delta / FRAME_MS) - 1;
  }
};

const format = (label: string, stats: FrameStats) => {
  const elapsed = Math.max(stats.last - stats.start, 1);
  const fps = (stats.frames / elapsed) * 1000;
  const done = stats.last - stats.start >= WINDOW_MS - 100 ? ' done' : '';
  return `${label}${done} ${fps.toFixed(1)}fps drop ${stats.dropped} worst ${Math.round(
    stats.worst,
  )}ms mount ${Math.round(stats.mountWorst)}ms`;
};

export const PerfHud = () => {
  const pathname = usePathname();
  const { slug } = useGlobalSearchParams<{ slug?: string }>();
  const routeKey = `${pathname}:${slug ?? ''}`;

  const uiStats = useSharedValue<FrameStats>(emptyStats());
  const jsStats = useRef<FrameStats>(emptyStats());
  const [text, setText] = useState('');

  useEffect(() => {
    uiStats.set(emptyStats());
    jsStats.current = emptyStats();
  }, [routeKey, uiStats]);

  useFrameCallback(frameInfo => {
    'worklet';
    const delta = frameInfo.timeSincePreviousFrame;
    if (delta === null) {
      return;
    }
    uiStats.modify(stats => {
      'worklet';
      record(stats, frameInfo.timestamp, delta);
      return stats;
    });
  });

  useEffect(() => {
    let previous = performance.now();
    // React Native's rAF timestamp is not a reliable per-frame clock, so
    // the loop reads the time itself.
    let handle = requestAnimationFrame(function loop() {
      const now = performance.now();
      record(jsStats.current, now, now - previous);
      previous = now;
      handle = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setText(
        `${format('UI', uiStats.get())} | ${format(
          'JS',
          jsStats.current,
        )} | ${routeKey}`,
      );
    }, 500);
    return () => clearInterval(interval);
  }, [routeKey, uiStats]);

  return (
    <View pointerEvents="none" style={styles.container}>
      <Text
        testID="perf-hud"
        accessibilityLabel={`PERF ${text}`}
        style={styles.text}>
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    bottom: 4,
    left: 4,
    padding: 2,
    position: 'absolute',
    right: 4,
  },
  text: {
    color: '#0f0',
    fontSize: 8,
  },
});
