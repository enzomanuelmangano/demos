import { View, StyleSheet, Text, Linking, Switch } from 'react-native';

import { useCallback } from 'react';

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAtom } from 'jotai';
import { PressableScale } from 'pressto';

import { HideCloseButtonAtom } from '../navigation/states/close-button';
import { ShowUnstableAnimationsAtom } from '../navigation/states/filters';
import { ShowTouchesAtom, canShowTouches } from '../navigation/states/touches';

type IoniconsIconName = React.ComponentProps<typeof Ionicons>['name'];

interface GeneralItem {
  title: string;
  description: string;
  icon: IoniconsIconName;
  backgroundColor: string;
  type: string;
}

const Items: readonly GeneralItem[] = [
  {
    title: 'Show Unstable',
    description: 'Show or hide work-in-progress demos',
    icon: 'flask',
    backgroundColor: '#FF9500',
    type: 'unstable',
  },
  {
    title: 'Hide Close Button',
    description: 'Close demos with the drag down only',
    icon: 'close-circle-outline',
    backgroundColor: '#5856D6',
    type: 'closeButton',
  },
  {
    title: 'Show Touches',
    description: 'Draw a disc under each finger, for screen recordings',
    icon: 'finger-print',
    backgroundColor: '#34C759',
    type: 'touches',
  },
  {
    title: 'Sponsor',
    description: 'Support the project and help keep it running',
    icon: 'heart',
    backgroundColor: '#E74C3C',
    type: 'sponsor',
  },
] as const;

// "Show Touches" only where the native overlay is in the binary: Android, and
// any iOS build made before the module was added, have nothing to switch.
const VisibleItems = Items.filter(
  item => item.type !== 'touches' || canShowTouches(),
);

const BurntToastOptions = {
  layout: {
    iconSize: {
      height: 20,
      width: 20,
    },
  },
  duration: 1,
};

// All of this mess because I want to support Expo Go too
// and importing burnt outside would break the Expo Go build
// (and I still want native toasts 😆)
const updateUnstableDemos = () => {
  if (Constants.executionEnvironment !== 'bare') return;
  const Burnt = require('burnt');
  return Burnt.toast({
    title: 'Unstable demos have been updated',
    ...BurntToastOptions,
  });
};

export const General = () => {
  const [showUnstable, setShowUnstable] = useAtom(ShowUnstableAnimationsAtom);
  const [hideCloseButton, setHideCloseButton] = useAtom(HideCloseButtonAtom);
  const [showTouches, setShowTouches] = useAtom(ShowTouchesAtom);

  const handleItemPress = useCallback(
    (type: string) => {
      switch (type) {
        case 'unstable': {
          updateUnstableDemos();
          setShowUnstable(prev => !prev);
          break;
        }
        case 'closeButton': {
          setHideCloseButton(prev => !prev);
          break;
        }
        case 'touches': {
          setShowTouches(prev => !prev);
          break;
        }
        case 'sponsor': {
          Linking.openURL('https://github.com/sponsors/enzomanuelmangano');
          break;
        }
      }
    },
    [setShowUnstable, setHideCloseButton, setShowTouches],
  );

  return (
    <View style={styles.container}>
      {VisibleItems.map(item => (
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
          {item.type === 'closeButton' && (
            <Switch
              value={hideCloseButton}
              onValueChange={setHideCloseButton}
              trackColor={{ false: '#3e3e3e', true: '#5856D6' }}
              thumbColor="#ffffff"
            />
          )}
          {item.type === 'touches' && (
            <Switch
              value={showTouches}
              onValueChange={setShowTouches}
              trackColor={{ false: '#3e3e3e', true: '#34C759' }}
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
