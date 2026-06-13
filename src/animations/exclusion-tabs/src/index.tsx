import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useState } from 'react';

import { ExclusionTabs } from './components/exclusion-tabs';

const tabs = ['Home', 'Changelog', 'Career', 'About'];

const App = () => {
  const { width: windowWidth } = useWindowDimensions();
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // e2e outcome probe: exposes the selected tab index and that a tab change has
  // fired (the tabs are Skia-drawn with no inspectable RN state).
  const [tabChangeCount, setTabChangeCount] = useState(0);

  return (
    <View style={styles.container}>
      <Text testID="exclusion-tabs-status" style={styles.statusProbe}>
        {`tabchanged:${tabChangeCount}#${activeTabIndex}`}
      </Text>
      <View testID="exclusion-tabs">
        <ExclusionTabs
          tabs={tabs}
          activeTabIndex={activeTabIndex}
          onTabChange={tab => {
            setActiveTabIndex(tabs.indexOf(tab));
            setTabChangeCount(count => count + 1);
          }}
          containerWidth={windowWidth}
          height={45}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
  // Near-invisible to the eye, but on-screen for the e2e accessibility tree.
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#808080',
    opacity: 0.012,
    zIndex: 10,
  },
});

export { App };
