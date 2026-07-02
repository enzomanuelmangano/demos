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

// iOS continuous-corner ratio shared by every squircle in the launcher
// (grid icons, search-row icons, the open-zoom card).
export const ICON_RADIUS_RATIO = 0.2237;

// Scalar subset of GridLayout consumed by the icon-rect math. Kept small so
// the UI-thread tap recognizer captures a handful of numbers into its worklet
// instead of the whole layout (which drags the 122-demo pages array along).
export interface IconGridMetrics {
  cols: number;
  cellWidth: number;
  cellHeight: number;
  iconSize: number;
  rowGap: number;
  sideMargin: number;
  topPad: number;
}

// On-screen rect of a cell's icon square, in viewport coordinates. The single
// source of the grid geometry used to seed the open-zoom overlay — callable
// from worklets (UI-thread tap recognizer) and JS (accessibility fallback)
// alike. `offsetX` compensates a not-exactly-page-aligned scroll (0 at rest).
export const iconRectForCell = (
  grid: IconGridMetrics,
  insetTop: number,
  cellIndex: number,
  offsetX = 0,
) => {
  'worklet';
  const col = cellIndex % grid.cols;
  const row = Math.floor(cellIndex / grid.cols);
  return {
    x:
      offsetX +
      grid.sideMargin +
      col * grid.cellWidth +
      (grid.cellWidth - grid.iconSize) / 2,
    y: insetTop + grid.topPad + row * (grid.cellHeight + grid.rowGap),
    width: grid.iconSize,
    height: grid.iconSize,
    radius: grid.iconSize * ICON_RADIUS_RATIO,
  };
};

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
