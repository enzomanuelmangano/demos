import { File, Paths } from 'expo-file-system';

/**
 * Launch timing for release builds, which have no console: build with
 * `EXPO_PUBLIC_PERF_LOG=1` and every mark is written, with React Native's own
 * startup timing, to `<cache>/perf-log.json` once the home is up. Off by
 * default, and then it costs nothing.
 *
 * Read it from a simulator with:
 *   cat "$(xcrun simctl get_app_container booted com.reactiive.app data)/Library/Caches/perf-log.json"
 */
const ENABLED = process.env.EXPO_PUBLIC_PERF_LOG === '1';

const marks: Record<string, number> = {};
// Wall-clock time of each mark, comparable with the time the app was
// launched (simctl launch on the same host, or device logs).
const wall: Record<string, number> = {};

export const perfMark = (name: string) => {
  if (!ENABLED || name in marks) return;
  marks[name] = performance.now();
  wall[name] = Date.now();
};

export const perfFlush = () => {
  if (!ENABLED) return;
  const startup = (
    performance as unknown as { rnStartupTiming?: Record<string, number> }
  ).rnStartupTiming;
  try {
    new File(Paths.cache, 'perf-log.json').write(
      JSON.stringify({ marks, wall, startup: { ...startup } }),
    );
  } catch {
    // Timing is best effort: it must never take the app down.
  }
};

perfMark('perf-log-module');
