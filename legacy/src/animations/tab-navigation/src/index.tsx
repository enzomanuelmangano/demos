import { StyleSheet, View } from 'react-native';

import { useState } from 'react';

import { Tabs } from './components/tabs';
import { TABS_DATA } from './constants';

const App = () => {
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  return (
    <View style={styles.container}>
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
});

export { App };
