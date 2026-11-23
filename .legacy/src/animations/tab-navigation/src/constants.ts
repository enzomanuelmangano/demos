import type { AntDesign } from '@expo/vector-icons';

export const TABS_DATA: {
  label: string;
  icon: keyof typeof AntDesign.glyphMap;
}[] = [
  {
    label: 'Accounts',
    icon: 'user-add',
  },
  {
    label: 'Home',
    icon: 'home',
  },
  {
    label: 'Payments',
    icon: 'wallet',
  },
  {
    label: 'Transfers',
    icon: 'swap',
  },
];
