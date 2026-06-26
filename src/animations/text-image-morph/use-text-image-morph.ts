import { useEffect, useMemo, useState } from 'react';

import { useFont, useImage } from '@shopify/react-native-skia';

import { buildAtlas } from './atlas';
import { GLYPH_FONT_SIZE } from './constants';
import { buildLayout } from './layout';
import { computeTargets } from './sampling';

import type { Atlas } from './atlas';
import type { MorphTargets } from './sampling';
import type {
  DataSourceParam,
  SkFont,
  SkRect,
} from '@shopify/react-native-skia';

const PAGE_FONT = require('./assets/Newsreader.ttf');

export interface TextImageMorphData {
  ready: boolean;
  pageXY: Float32Array;
  sprites: SkRect[];
  font: SkFont | null;
  atlas: Atlas;
  targets: MorphTargets | null; // null until the deferred sampling completes
}

interface Params {
  image: DataSourceParam;
  paragraph: string;
  width: number;
  height: number;
}

const EMPTY_F32 = new Float32Array(0);
const EMPTY_SPRITES: SkRect[] = [];

export const useTextImageMorph = ({
  image,
  paragraph,
  width,
  height,
}: Params): TextImageMorphData => {
  const pictureImage = useImage(image);
  const font = useFont(PAGE_FONT, GLYPH_FONT_SIZE);

  const atlas = useMemo(() => buildAtlas(paragraph), [paragraph]);

  // cheap — paints the page text immediately
  const layout = useMemo(() => {
    if (!font || width <= 0 || height <= 0) {
      return null;
    }
    return buildLayout(atlas, paragraph, font, width, height);
  }, [atlas, paragraph, font, width, height]);

  // expensive sampling, deferred past the first paint; arrives as an immutable
  // object the renderer keys its buffers off
  const [targets, setTargets] = useState<MorphTargets | null>(null);
  useEffect(() => {
    setTargets(null);
    if (!layout || !pictureImage) {
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) {
        return;
      }
      const t = computeTargets(layout.pageXY, pictureImage, width, height);
      if (!cancelled) {
        setTargets(t);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [layout, pictureImage, width, height]);

  return {
    ready: !!layout && !!font,
    pageXY: layout?.pageXY ?? EMPTY_F32,
    sprites: layout?.sprites ?? EMPTY_SPRITES,
    font: font ?? null,
    atlas,
    targets,
  };
};
