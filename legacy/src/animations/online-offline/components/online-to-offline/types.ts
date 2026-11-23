export type OfflineToOnlineProps = {
  offline: string[];
  online: string[];
  itemSize: number;
  gap: number;
  listPadding?: number;
  listColor?: string;
  sectionGap?: number;
};

export type ListItem = {
  item: string;
  isOffline: boolean;
};

export type LayoutDimensions = {
  listWidth: number;
  onlineBackgroundWidth: number;
  offlineBackgroundStart: number;
  offlineBackgroundWidth: number;
  overlap: number;
};

export type BackgroundSectionProps = {
  width: number;
  left: number;
  listPadding: number;
  listColor: string;
};

export type ItemProps = {
  item: string;
  leftPosition: number;
  itemSize: number;
  listColor: string;
  isOffline: boolean;
  zIndex: number;
};
