const Empty = '';

const EmptyTab = {
  name: Empty,
  icon: Empty,
};

export const isEmptyTab = (tab: typeof EmptyTab) => tab.name === Empty;
export const isNotEmptyTab = (tab: typeof EmptyTab) => !isEmptyTab(tab);

export const NoteTab = {
  name: 'note',
  icon: 'edit',
};

export const BaseTabs = [
  {
    name: '(home-stack)',
    icon: 'home',
  },
  {
    name: 'inbox',
    icon: 'inbox',
  },
  NoteTab,
  {
    name: 'search',
    icon: 'search',
  },
  {
    name: 'settings',
    icon: 'settings',
  },
] as const;

export const SecondLayerTabs = [
  EmptyTab,
  EmptyTab,
  NoteTab,
  EmptyTab,
  EmptyTab,
] as const;

export const ThirdLayerTabs = [
  {
    name: 'back',
    icon: 'backarrow',
  },
  EmptyTab,
  NoteTab,
  EmptyTab,
  {
    name: 'menu',
    icon: 'menu',
  },
] as const;
