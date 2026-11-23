import type { CarouselItemProps } from './carousel-item';
import type { StyleProp, ViewStyle } from 'react-native';

export type InfiniteCircularCarouselProps<T> = {
  data: T[];
  style?: StyleProp<ViewStyle>;
  onItemSelected?: (item: T) => void;
  listViewPort?: number;
  listItemWidth?: number;
  centered?: boolean;
  onActiveIndexChanged?: (activeIndex: number) => void;
  snapEnabled?: boolean;
  interpolateConfig?: CarouselItemProps<T>['interpolateConfig'];
  renderItem: CarouselItemProps<T>['renderItem'];
};

export type InfiniteCircularCarouselRef = {
  scrollToIndex: (index: number, animated?: boolean) => void;
};
