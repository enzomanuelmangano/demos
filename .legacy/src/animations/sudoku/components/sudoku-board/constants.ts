import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const BOARD_SIZE = Math.min(width - 48, 400);
export const CELL_SIZE = BOARD_SIZE / 9;
