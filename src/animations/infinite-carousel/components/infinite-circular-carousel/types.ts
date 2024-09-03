import type { StyleProp, ViewStyle } from 'react-native'; // Importing types for styles from react-native

import type { CarouselItemProps } from './carousel-item'; // Importing type for CarouselItemProps from './carousel-item'

// Props type for InfiniteCircularCarousel component
export type InfiniteCircularCarouselProps<T> = {
  data: T[]; // Array of data items for the carousel
  style?: StyleProp<ViewStyle>; // Style prop for the carousel container
  onItemSelected?: (item: T) => void; // Callback function for item selection
  listViewPort?: number; // Width of the carousel viewport
  listItemWidth?: number; // Width of each carousel item
  centered?: boolean; // Whether carousel items should be centered
  onActiveIndexChanged?: (activeIndex: number) => void; // Callback function for active index change
  snapEnabled?: boolean; // Whether snapping is enabled
  interpolateConfig?: CarouselItemProps<T>['interpolateConfig']; // Configuration object for interpolation
  renderItem: CarouselItemProps<T>['renderItem']; // Function to render each item
};

// Ref type for InfiniteCircularCarousel component
export type InfiniteCircularCarouselRef = {
  scrollToIndex: (index: number, animated?: boolean) => void; // Method to scroll to a specific index
};
