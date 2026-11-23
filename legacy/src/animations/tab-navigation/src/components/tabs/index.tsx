import { useWindowDimensions, View } from 'react-native';

import { Tab } from './tab';

import type { AntDesign } from '@expo/vector-icons';

type TabsProps = {
  tabs: { label: string; icon: keyof typeof AntDesign.glyphMap }[];
  activeTabIndex: number;
  setActiveTabIndex: (index: number) => void;
};
/**
 * Tabs component for displaying a row of tabs with icons and labels.
 * It dynamically adjusts tab widths based on the window size and number of tabs.
 */
export const Tabs = ({
  activeTabIndex,
  setActiveTabIndex,
  tabs,
}: TabsProps) => {
  const { width: windowWidth } = useWindowDimensions();
  const gap = 10;
  const paddingHorizontal = 10;

  const tabsWidth =
    windowWidth - paddingHorizontal * 2 - gap * (tabs.length - 1);

  const maxTabWidth = 170;
  const minTabWidth = (tabsWidth - maxTabWidth) / (tabs.length - 1);

  return (
    <View
      style={{
        width: windowWidth,
        gap,
        flexDirection: 'row',
        paddingHorizontal,
      }}>
      {tabs.map((tab, index) => (
        <Tab
          onPress={() => {
            setActiveTabIndex(index);
          }}
          icon={tab.icon}
          key={index}
          label={tab.label}
          maxWidth={maxTabWidth}
          minWidth={minTabWidth}
          isActive={index === activeTabIndex}
        />
      ))}
    </View>
  );
};
