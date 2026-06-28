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
          styles.iconShadow,
          {
            width: iconSize,
            height: iconSize,
            borderRadius: iconSize * 0.2237,
            borderCurve: 'continuous', // iOS continuous-corner ratio
          },
        ]}>
        <View
          style={[
            styles.iconClip,
            {
              width: iconSize,
              height: iconSize,
              borderCurve: 'continuous',
              borderRadius: iconSize * 0.2237,
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
  // Soft elevation under each tile. Lives on a wrapper (not the clip) because
  // the clip's overflow:hidden would otherwise mask its own shadow.
  iconShadow: {
    borderCurve: 'continuous',
    boxShadow: '0px 5px 9px rgba(27, 34, 51, 0.18)',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  label: {
    color: 'rgba(28,28,34,0.92)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    maxWidth: '100%',
    textAlign: 'center',
  },
});
