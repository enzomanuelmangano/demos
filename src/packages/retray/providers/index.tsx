import { Provider } from './main';
import { RetrayThemeProvider, type RetrayTheme } from './theme';
import { type RetrayComponents } from './components';

export const Retray = {
  Navigator: Provider,
  Theme: RetrayThemeProvider,
};

export { RetrayThemes, useRetrayTheme } from './theme';
export { useRetray } from './main';

export type { RetrayTheme, RetrayComponents };
