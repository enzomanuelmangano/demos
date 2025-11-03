import { View, StyleSheet, Text, Linking, Switch } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useAtom } from 'jotai';
import { PressableScale } from 'pressto';

import {
  HideDrawerIconAtom,
  ShowUnstableAnimationsAtom,
} from '../navigation/states/filters';

type IoniconsIconName = React.ComponentProps<typeof Ionicons>['name'];

interface GeneralItem {
  title: string;
  description: string;
  icon: IoniconsIconName;
  backgroundColor: string;
  type: string;
}

export const General = () => {
  const [showUnstable, setShowUnstable] = useAtom(ShowUnstableAnimationsAtom);
  const [hideDrawerIcon, setHideDrawerIcon] = useAtom(HideDrawerIconAtom);

  const Items: readonly GeneralItem[] = [
    {
      title: 'Show Unstable',
      description: 'Show or hide work-in-progress demos',
      icon: 'flask',
      backgroundColor: '#FF9500',
      type: 'unstable',
    },
    {
      title: 'Hide Drawer Icon',
      description: 'Hide the drawer icon in animation screens',
      icon: 'eye-off-outline',
      backgroundColor: '#5856D6',
      type: 'hideDrawer',
    },
    {
      title: 'Sponsor',
      description: 'Support the project and help keep it running',
      icon: 'heart',
      backgroundColor: '#E74C3C',
      type: 'sponsor',
    },
  ] as const;

  const handleItemPress = (type: string) => {
    switch (type) {
      case 'unstable':
        setShowUnstable(!showUnstable);
        break;
      case 'hideDrawer':
        setHideDrawerIcon(!hideDrawerIcon);
        break;
      case 'sponsor':
        Linking.openURL('https://github.com/sponsors/enzomanuelmangano');
        break;
    }
  };

  return (
    <View style={styles.container}>
      {Items.map(item => (
        <PressableScale
          style={styles.item}
          key={item.type}
          onPress={() => handleItemPress(item.type)}>
          <View>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: item.backgroundColor },
              ]}>
              <Ionicons name={item.icon} size={22} color="white" />
            </View>
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
          {item.type === 'unstable' && (
            <Switch
              value={showUnstable}
              onValueChange={setShowUnstable}
              trackColor={{ false: '#3e3e3e', true: '#FF9500' }}
              thumbColor="#ffffff"
            />
          )}
          {item.type === 'hideDrawer' && (
            <Switch
              value={hideDrawerIcon}
              onValueChange={setHideDrawerIcon}
              trackColor={{ false: '#3e3e3e', true: '#5856D6' }}
              thumbColor="#ffffff"
            />
          )}
        </PressableScale>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  description: {
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
  },
  iconContainer: {
    alignItems: 'center',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    marginRight: 16,
    width: 50,
  },
  item: {
    backgroundColor: '#3A3A3C',
    borderCurve: 'continuous',
    borderRadius: 16,
    flexDirection: 'row',
    padding: 18,
  },
  textContainer: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
