import { createBox, createText } from '@shopify/restyle';

import type { Theme } from './palette';

export const View = createBox<Theme>();
export const Text = createText<Theme>();
