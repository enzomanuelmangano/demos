import { Dimensions } from 'react-native';

import type { CardData } from './types';

export enum CardType {
  Silver = 0,
  Gold = 1,
  Platinum = 2,
  Metal = 3,
}

export const { width: SCREEN_WIDTH } = Dimensions.get('window');
export const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.7);
export const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.58); // Standard credit card ratio
export const SPACING = 20;

export const CARD_DATA: CardData[] = [
  {
    id: CardType.Metal,
    title: 'Metal',
    price: '100 € one off',
    description:
      'Exclusive metal card. 3% Saveback on all purchases. VIP concierge, lounge access & elite benefits.',
  },
  {
    id: CardType.Silver,
    title: 'Silver',
    price: '5 € one off',
    description: 'Elegant silver card. 0.5% Saveback on your payments.',
  },
  {
    id: CardType.Gold,
    title: 'Gold',
    price: '10 € one off',
    description: 'Luxury gold card. 1% Saveback on all purchases.',
  },
  {
    id: CardType.Platinum,
    title: 'Platinum',
    price: '50 € one off',
    description:
      'Exclusive platinum card. 2% Saveback on all purchases. Priority support & luxury benefits.',
  },
];
