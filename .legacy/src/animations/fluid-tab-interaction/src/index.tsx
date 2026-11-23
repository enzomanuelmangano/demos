import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useState } from 'react';

import { SegmentedControl } from './components/segmented-control';

import type { MaterialCommunityIcons } from '@expo/vector-icons';

const Data: {
  name: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { name: 'Accounts', icon: 'wallet-outline' },
  { name: 'Deposits', icon: 'bank' },
  { name: 'Funds', icon: 'chart-bar' },
];

const App = () => {
  const [selected, setSelected] = useState(Data[0]);
  const { width: windowWidth } = useWindowDimensions();

  return (
    <View style={styles.container}>
      <SegmentedControl
        data={Data}
        onPress={item => setSelected(item)}
        selected={selected}
        width={windowWidth - 40}
        height={50}
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
