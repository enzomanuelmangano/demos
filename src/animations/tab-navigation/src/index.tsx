import { StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';

import { Tabs } from './components/tabs';
import { TABS_DATA } from './constants';

const App = () => {
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  return (
    <View style={styles.container}>
      {/* e2e outcome probe: exposes the active tab index so a test can verify
          the tap actually moved the selection. Visually negligible. */}
      <Text testID="tab-navigation-status" style={styles.statusProbe}>
        {`tab:${activeTabIndex}`}
      </Text>
      <Tabs
        tabs={TABS_DATA}
        activeTabIndex={activeTabIndex}
        setActiveTabIndex={setActiveTabIndex}
      />
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
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    opacity: 0.012,
  },
});

export { App };
