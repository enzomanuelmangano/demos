import { Pressable, StyleSheet, Text, View } from 'react-native';

import { memo } from 'react';

import { Image } from 'expo-image';
import { Link } from 'expo-router';

import { getIconSource } from '../icon-source';
import { ICON_RADIUS_RATIO } from '../use-grid-layout';

import type { Demo } from '../demos';

interface Props {
  demo: Demo;
  cellWidth: number;
  cellHeight: number;
  iconSize: number;
}

// SPIKE: iOS 18 native zoom-transition launcher cell.
//
// The whole open/close morph is UIKit's UIViewController.Transition.zoom,
// wired through expo-router's Link.AppleZoom: the Link injects a zoom-source
// identifier param, and the native stack's screen picks it up and hands the
// wrapped view to UIKit as the transition source. No shared-value overlay, no
// transition boundaries, no per-frame reactions — the entire mechanism the
// main branch hand-builds is replaced by these two wrapper components.
//
// The AppleZoom wraps the ICON SQUARE only (label outside), mirroring the main
// branch's bound choice: the morph must be symmetric about the icon.
// Context menu + search are deliberately absent — this spike only evaluates
// the native zoom's feel and cost.
const AppIconNativeComponent = ({
  demo,
  cellWidth,
  cellHeight,
  iconSize,
}: Props) => {
  const { slug, name } = demo;
  const radius = iconSize * ICON_RADIUS_RATIO;

  return (
    <View style={[styles.cell, { width: cellWidth, height: cellHeight }]}>
      <Link href={`/animations/${slug}`} asChild>
        <Link.AppleZoom>
          <Pressable>
            {({ pressed }) => (
              <View style={pressed ? styles.pressedDim : null}>
                <View
                  style={[
                    styles.iconShadow,
                    {
                      width: iconSize,
                      height: iconSize,
                      borderRadius: radius,
                      borderCurve: 'continuous',
                    },
                  ]}>
                  <View
                    style={[
                      styles.iconClip,
                      {
                        width: iconSize,
                        height: iconSize,
                        borderRadius: radius,
                        borderCurve: 'continuous',
                      },
                    ]}>
                    <Image
                      source={getIconSource(slug)}
                      style={styles.image}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={slug}
                    />
                  </View>
                </View>
              </View>
            )}
          </Pressable>
        </Link.AppleZoom>
      </Link>
      <Text numberOfLines={1} style={styles.label}>
        {name}
      </Text>
    </View>
  );
};

export const AppIconNative = memo(AppIconNativeComponent);

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
  iconShadow: {
    borderCurve: 'continuous',
    boxShadow: '0px 5px 9px rgba(27, 34, 51, 0.18)',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    maxWidth: '100%',
    textAlign: 'center',
  },
  pressedDim: {
    opacity: 0.6,
  },
});
