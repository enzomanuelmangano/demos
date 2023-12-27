const ScreenNamesArray = [
  'Home',
  'Search',
  'Notifications',
  'Message',
] as const;

const ScreenNames = ScreenNamesArray.reduce(
  (acc, name) => {
    acc[name] = name;
    return acc;
  },
  {} as { [key in (typeof ScreenNamesArray)[number]]: string },
);

export { ScreenNames, ScreenNamesArray };
