import { useWindowDimensions } from 'react-native';

import { useMemo } from 'react';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEMOS } from './demos';

import type { Demo } from './demos';

// Responsive SpringBoard layout: cols/rows derived from screen size so the icon
// stays a consistent physical size across devices; per-page count varies.
const SIDE_MARGIN = 22; // page horizontal padding
const ICON_TARGET = 62; // desired icon edge (pt) — drives the column count
const COL_GAP_MIN = 22; // minimum horizontal gap between icons
const LABEL_BLOCK = 26; // label text + gap under each icon
const ROW_GAP = 22; // vertical gap between rows
const TOP_PAD = 16; // gap below the safe-area top
const DOTS_BLOCK = 44; // reserved height for the page-dots row

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export interface GridLayout {
  cols: number;
  rows: number;
  perPage: number;
  iconSize: number;
  cellWidth: number;
  cellHeight: number;
  pageWidth: number;
  sideMargin: number;
  topPad: number;
  rowGap: number;
  pages: Demo[][];
  pageCount: number;
}

export const useGridLayout = (): GridLayout => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const availW = width - SIDE_MARGIN * 2;
    // how many icons fit horizontally at the target size + min gap
    const cols = clamp(
      Math.floor((availW + COL_GAP_MIN) / (ICON_TARGET + COL_GAP_MIN)),
      3,
      6,
    );
    const cellWidth = availW / cols;
    const iconSize = Math.min(ICON_TARGET, cellWidth - 8);
    const cellHeight = iconSize + LABEL_BLOCK;

    const availH = height - insets.top - insets.bottom - TOP_PAD - DOTS_BLOCK;
    const rows = Math.max(
      1,
      Math.floor((availH + ROW_GAP) / (cellHeight + ROW_GAP)),
    );
    const perPage = cols * rows;

    const pages: Demo[][] = [];
    for (let i = 0; i < DEMOS.length; i += perPage) {
      pages.push(DEMOS.slice(i, i + perPage));
    }

    return {
      cols,
      rows,
      perPage,
      iconSize,
      cellWidth,
      cellHeight,
      pageWidth: width,
      sideMargin: SIDE_MARGIN,
      topPad: TOP_PAD,
      rowGap: ROW_GAP,
      pages,
      pageCount: pages.length,
    };
  }, [width, height, insets.top, insets.bottom]);
};
