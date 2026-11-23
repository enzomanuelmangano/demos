import type { MaterialIcons } from '@expo/vector-icons';

type ScreenName = keyof typeof MaterialIcons.glyphMap;

const ScreenNamesArray: ScreenName[] = [
  'home',
  'search',
  'favorite',
  'person',
  'settings',
] as const;

const ScreenNames = ScreenNamesArray.reduce(
  (acc, name) => {
    acc[name] = name;
    return acc;
  },
  {} as { [key in (typeof ScreenNamesArray)[number]]: string },
);

export { ScreenNames, ScreenNamesArray };
