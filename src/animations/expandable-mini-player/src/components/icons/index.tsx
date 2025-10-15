import type { ComponentProps } from 'react';

import { Ionicons } from '@expo/vector-icons';

type IconProps = Omit<ComponentProps<typeof Ionicons>, 'name'>;

export const Home = (props: IconProps) => (
  <Ionicons {...props} size={24} name="home" />
);

export const Inbox = (props: IconProps) => (
  <Ionicons {...props} size={24} name="mail" />
);

export const Edit = (props: IconProps) => (
  <Ionicons {...props} size={24} name="create" />
);

export const Search = (props: IconProps) => (
  <Ionicons {...props} size={24} name="search" />
);

export const Settings = (props: IconProps) => (
  <Ionicons {...props} size={24} name="settings" />
);

export const Menu = (props: IconProps) => (
  <Ionicons {...props} size={24} name="ellipsis-horizontal" />
);

export const Backarrow = (props: IconProps) => (
  <Ionicons {...props} size={24} name="arrow-back" />
);
