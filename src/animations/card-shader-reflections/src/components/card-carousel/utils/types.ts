/**
 * Type definitions for the Card Carousel components
 */
import type { SharedValue } from 'react-native-reanimated';

/**
 * Represents the data structure for a credit card
 * @property id - Unique identifier for the card (also determines card type)
 * @property title - Card title/name displayed on the card
 * @property price - Price or value associated with the card
 * @property description - Additional card description
 */
export interface CardData {
  id: number;
  title: string;
  price: string;
  description: string;
}

/**
 * Props for the Card component
 * @property item - Card data to be displayed
 * @property index - Position of the card in the carousel
 * @property scrollX - Shared value tracking horizontal scroll position
 */
export interface CardProps {
  item: CardData;
  index: number;
  scrollX: SharedValue<number>;
}

/**
 * Uniforms passed to the Skia shader for card rendering
 * @property rotate - Current rotation value for the card
 * @property resolution - Width and height of the card [width, height]
 * @property cardType - Type of card (0=Silver, 1=Gold, 2=Platinum)
 */
export interface CardUniforms {
  rotate: SharedValue<number>;
  resolution: [number, number];
  cardType: number;
}
