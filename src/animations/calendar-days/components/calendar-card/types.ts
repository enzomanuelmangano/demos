import type { SharedValue } from 'react-native-reanimated';

export type CalendarCardProps = {
  progress: SharedValue<number>;
  totalPages: number;
};

export type PageProps = {
  index: number;
  progress: SharedValue<number>;
  frontPageNumber: number;
  backPageNumber: number;
  totalPages: number;
};

export type StaticPageProps = {
  pageNumber: number;
  position: 'top' | 'bottom';
};

export type PageFaceProps = {
  pageNumber: number;
  variant: 'front' | 'back';
};
