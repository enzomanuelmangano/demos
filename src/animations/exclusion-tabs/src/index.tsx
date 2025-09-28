import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useState } from 'react';

import { ExclusionTabs } from './components/exclusion-tabs';

const tabs = ['Home', 'Changelog', 'Career', 'About'];

const App = () => {
  const { width: windowWidth } = useWindowDimensions();
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  return (
    <View style={styles.container}>
      <ExclusionTabs
        tabs={tabs}
        activeTabIndex={activeTabIndex}
        onTabChange={tab => {
          setActiveTabIndex(tabs.indexOf(tab));
        }}
        containerWidth={windowWidth}
        height={45}
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
