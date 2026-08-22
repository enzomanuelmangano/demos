import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { memo, useCallback } from 'react';

import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';

import { AnimationInspirations } from '../../../animations/inspirations';
import { getIconSource } from '../icon-source';
import { ICON_RADIUS_RATIO } from '../use-grid-layout';

import type { Demo } from '../demos';

interface Props {
  demo: Demo;
  cellWidth: number;
  cellHeight: number;
  iconSize: number;
}

// GitHub source for a demo — folder name === slug (see scripts/generate-icon-map).
const sourceUrl = (slug: string) =>
  `https://github.com/enzomanuelmangano/demos/tree/main/src/animations/${slug}`;

// NATIVE-SPIKE launcher cell — the icon square is the Link.Trigger
// (withAppleZoom) of an expo-router Link, so the open/close morph is UIKit's
// iOS 18 native zoom, and long-press gets the native UIKit context menu with
// a live route preview (Link.Preview + Link.Menu) instead of the zeego menu.
// One UIKit system owns both touches — no tap/long-press split to manage.
// Label stays outside the trigger so only the icon square morphs.
const AppIconNativeComponent = ({
  demo,
  cellWidth,
  cellHeight,
  iconSize,
}: Props) => {
  const { slug, name } = demo;
  const radius = iconSize * ICON_RADIUS_RATIO;

  const inspiration = AnimationInspirations[slug];
  const inspirationLink = inspiration?.link ?? null;

  const onInspiration = useCallback(() => {
    if (inspirationLink) Linking.openURL(inspirationLink);
  }, [inspirationLink]);

  const onShare = useCallback(() => {
    const url = sourceUrl(slug);
    Share.share({ message: `${name} — ${url}`, url });
  }, [slug, name]);

  const onViewCode = useCallback(() => {
    Linking.openURL(sourceUrl(slug));
  }, [slug]);

  return (
    <View style={[styles.cell, { width: cellWidth, height: cellHeight }]}>
      <Link href={`/animations/${slug}`} asChild>
        <Link.Trigger withAppleZoom>
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
        </Link.Trigger>
        <Link.Preview />
        <Link.Menu>
          {inspirationLink ? (
            <Link.MenuAction icon="lightbulb" onPress={onInspiration}>
              Inspiration
            </Link.MenuAction>
          ) : null}
          <Link.MenuAction icon="square.and.arrow.up" onPress={onShare}>
            Share
          </Link.MenuAction>
          <Link.MenuAction
            icon="chevron.left.forwardslash.chevron.right"
            onPress={onViewCode}>
            View Code
          </Link.MenuAction>
        </Link.Menu>
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
