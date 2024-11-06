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
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { App };
