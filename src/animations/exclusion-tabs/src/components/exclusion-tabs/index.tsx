import { Blur, ColorMatrix, Group, Paint } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import Touchable from 'react-native-skia-gesture';

import { ExclusionTabText } from './exclusion-tab-text';
import { ExclusionTabBox } from './exclusion-tab-box';
import { useBoxWidths } from './hooks/use-text-widths';

type ExclusionTabsProps = {
  tabs: readonly string[];
  activeTabIndex: number;
  onTabChange: (tab: string) => void;
  containerWidth: number;
  height: number;
  backgroundColor?: string;
  activeBackgroundColor?: string;
};

export function ExclusionTabs({
  tabs,
  activeTabIndex,
  onTabChange,
  containerWidth,
  height,
  backgroundColor = '#000000',
  activeBackgroundColor = '#3E82F7',
}: ExclusionTabsProps) {
  // This is where the magic happens 🪄
  // I highly recomment you to check my Metaball Tutorial to understand how this works
  // Metaball https://youtu.be/HOxZegqnDC4
  // I used already this technique in some very old Patreon animations
  // And it's crazy how often you can reuse this same technique.
  // I have no idea on how to implement this same effect in React Native without using Skia
  const layer = useMemo(() => {
    return (
      <Paint>
        <Blur blur={5} />
        <ColorMatrix
          matrix={[
            // R, G, B, A, Bias (Offset)
            // prettier-ignore
            1, 0, 0, 0, 0,
            // prettier-ignore
            0, 1, 0, 0, 0,
            // prettier-ignore
            0, 0, 1, 0, 0,
            // prettier-ignore
            0, 0, 0, 15, -9,
          ]}
        />
      </Paint>
    );
  }, []);

  const internalBoxPadding = 20;

  const { totalWidth } = useBoxWidths({
    tabs,
    internalBoxPadding,
  });

  const horizontalTabsPadding = Math.max((containerWidth - totalWidth) / 2, 0);

  return (
    <Touchable.Canvas
      style={{
        width: containerWidth,
        height,
      }}>
      {/* 1. Why 2 different Groups for the Boxes and Texts?
       * We just want to apply the "layer" to the Boxes and not to the Texts
       * otherwise the text will be blurred as well (and we definitely don't want that)
       * 2. Try to comment the "layer" and see the difference 🫠
       * I strongly recommend you to play around with the values to see the effect 🎨
       */}
      <Group layer={layer}>
        {tabs.map((tab, index) => (
          <ExclusionTabBox
            key={tab}
            tabs={tabs}
            index={index}
            activeIndex={activeTabIndex}
            onPress={() => onTabChange(tab)}
            height={height}
            activeBackgroundColor={activeBackgroundColor}
            backgroundColor={backgroundColor}
            horizontalTabsPadding={horizontalTabsPadding}
            internalBoxPadding={internalBoxPadding}
          />
        ))}
      </Group>
      <Group>
        {tabs.map((tab, index) => {
          return (
            <ExclusionTabText
              key={tab}
              tabs={tabs}
              activeTabIndex={activeTabIndex}
              index={index}
              height={height}
              horizontalTabsPadding={horizontalTabsPadding}
              internalBoxPadding={internalBoxPadding}
            />
          );
        })}
      </Group>
    </Touchable.Canvas>
  );
}
