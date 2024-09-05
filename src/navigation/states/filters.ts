import { atom } from 'jotai';

import { Screens } from '../screens';

export const SearchFilterAtom = atom('');

export const ActiveScreensAtom = atom(get => {
  const filterText = get(SearchFilterAtom);
  return Screens.filter(screen =>
    screen.name.toLowerCase().includes(filterText.toLowerCase()),
  );
});
