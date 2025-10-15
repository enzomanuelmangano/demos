import { Ionicons } from '@expo/vector-icons';

import type { ComponentProps } from 'react';

type IconProps = Omit<ComponentProps<typeof Ionicons>, 'name' | 'size'>;

export const Home = (props: IconProps) => (
  <Ionicons name="home" size={24} {...props} />
);

export const Inbox = (props: IconProps) => (
  <Ionicons name="mail" size={24} {...props} />
);

export const Edit = (props: IconProps) => (
  <Ionicons name="create" size={24} {...props} />
);

export const Search = (props: IconProps) => (
  <Ionicons name="search" size={24} {...props} />
);

export const Settings = (props: IconProps) => (
  <Ionicons name="settings" size={24} {...props} />
);

export const Menu = (props: IconProps) => (
  <Ionicons name="ellipsis-horizontal" size={24} {...props} />
);

export const Backarrow = (props: IconProps) => (
  <Ionicons name="arrow-back" size={24} {...props} />
);
