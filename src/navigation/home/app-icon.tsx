import { Pressable, StyleSheet, Text, View } from 'react-native';

import { memo } from 'react';

import { Image } from 'expo-image';
import Transition from 'react-native-screen-transitions';

import { BOUNDS_GROUP } from './constants';
import { getIconSource } from './icon-source';

import type { Demo } from './demos';

interface Props {
  demo: Demo;
  cellWidth: number;
  cellHeight: number;
  iconSize: number;
  // Only the visible page's icons register a shared-bound Trigger. The package
  // re-renders every boundary in the group when a transition begins; with all
  // 122 mounted that was a ~130ms JS-thread block on each tap. Off-page icons
  // (never tappable) render a plain Pressable that doesn't subscribe to the
  // transition context, so they stay out of that re-render.
  active: boolean;
  onPress: (slug: string) => void;
}

// The squircle + label that fills one cell. Shared by the active (Trigger) and
// inactive (plain Pressable) variants so both look identical.
const IconContent = ({ demo, iconSize }: { demo: Demo; iconSize: number }) => (
  <>
    <View
      style={[
        styles.iconClip,
        {
          width: iconSize,
          height: iconSize,
          borderCurve: 'continuous',
          borderRadius: iconSize * 0.2237, // iOS continuous-corner ratio
        },
      ]}>
      <Image
        source={getIconSource(demo.slug)}
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={demo.slug}
      />
    </View>
    <Text numberOfLines={1} style={styles.label}>
      {demo.name}
    </Text>
  </>
);

// One SpringBoard cell. On the active page it's a shared-bound Trigger keyed by
// slug, so tapping zooms it open via bounds({ id: slug }).navigation.zoom();
// off-page it's a plain Pressable (no boundary registered, no transition-time
// re-render).
const AppIconComponent = ({
  demo,
  cellWidth,
  cellHeight,
  iconSize,
  active,
  onPress,
}: Props) => {
  const cellStyle = [styles.cell, { width: cellWidth, height: cellHeight }];

  if (!active) {
    return (
      <Pressable style={cellStyle} onPress={() => onPress(demo.slug)}>
        <IconContent demo={demo} iconSize={iconSize} />
      </Pressable>
    );
  }

  return (
    <Transition.Boundary.Trigger
      id={demo.slug}
      group={BOUNDS_GROUP}
      style={cellStyle}
      onPress={() => onPress(demo.slug)}>
      <IconContent demo={demo} iconSize={iconSize} />
    </Transition.Boundary.Trigger>
  );
};

export const AppIcon = memo(AppIconComponent);

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  iconClip: {
    backgroundColor: '#1c1c1e',
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 6,
    maxWidth: '100%',
    textAlign: 'center',
  },
});
