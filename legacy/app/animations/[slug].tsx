import { useLocalSearchParams } from 'expo-router';

import { DemoScreen } from '../../src/navigation/home/demo-screen';

// A demo opened by URL (a deep link or a universal link). The launcher opens
// demos through app/launch.tsx instead, which is preloaded.
export default function AnimationScreen() {
  const { slug, source } = useLocalSearchParams<{
    slug: string;
    source?: string;
  }>();
  return <DemoScreen slug={slug} source={source} />;
}
