import { Dimensions } from 'react-native';

export type ThemeDataType = {
  primary: string;
  secondary: string;
  title: string;
};

export const ThemeData: ThemeDataType[] = [
  {
    primary: '#CB832E',
    secondary: '#7B6746',
    title: 'Classic',
  },
  {
    primary: '#A37125',
    secondary: '#756245',
    title: 'Brass',
  },
  {
    primary: '#43972A',
    secondary: '#486A41',
    title: 'Green',
  },
  {
    primary: '#48A067',
    secondary: '#47725F',
    title: 'Light Green',
  },
  {
    primary: '#CA3E9D',
    secondary: '#7B5372',
    title: 'Pink',
  },
  {
    primary: '#CC5FA8',
    secondary: '#7E5C72',
    title: 'Light Pink',
  },
  {
    primary: '#4733C9',
    secondary: '#5E517B',
    title: 'Indigo',
  },
  {
    primary: '#CA2B1D',
    secondary: '#784348',
    title: 'Red',
  },
  {
    primary: '#9271C9',
    secondary: '#6B627A',
    title: 'Lilac',
  },
  {
    primary: '#49A27B',
    secondary: '#457068',
    title: 'Teal',
  },
  {
    primary: '#7B91A1',
    secondary: '#6B6A72',
    title: 'Clay',
  },
  {
    primary: '#3273B3',
    secondary: '#4B6175',
    title: 'Blue',
  },
];

export const { width: WindowWidth, height: WindowHeight } =
  Dimensions.get('window');

export const DEFAULT_WHITE = '#CBCBCD';
