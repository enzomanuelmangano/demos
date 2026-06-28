import { StyleSheet, Text, View } from 'react-native';

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
  onPress: (slug: string) => void;
}

// One SpringBoard cell: squircle icon + label. The whole cell is a shared-bound
// Trigger keyed by slug, so tapping zooms it open into the demo via
// bounds({ id: slug }).navigation.zoom(). Every icon stays a mounted Trigger:
// the package writes each boundary's transition style into a shared map keyed
// by slug and applies it to this owner view, so the Trigger must not unmount
// mid-transition or it can re-mount reading a stale (hidden) style.
const AppIconComponent = ({
  demo,
  cellWidth,
  cellHeight,
  iconSize,
  onPress,
}: Props) => {
  return (
    <Transition.Boundary.Trigger
      id={demo.slug}
      group={BOUNDS_GROUP}
      style={[styles.cell, { width: cellWidth, height: cellHeight }]}
      onPress={() => onPress(demo.slug)}>
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
