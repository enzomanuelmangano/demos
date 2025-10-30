import { View, StyleSheet, Text, Linking, Switch } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useAtom } from 'jotai';
import { PressableScale } from 'pressto';

import { getAnimationMetadata } from '../animations/registry';
import { ShowUnstableAnimationsAtom } from '../navigation/states/filters';

type IoniconsIconName = React.ComponentProps<typeof Ionicons>['name'];

interface GeneralItem {
  title: string;
  description: string;
  icon: IoniconsIconName;
  backgroundColor: string;
  type: string;
}

interface GeneralProps {
  slug?: string;
}

export const General = ({ slug }: GeneralProps) => {
  const [showUnstable, setShowUnstable] = useAtom(ShowUnstableAnimationsAtom);

  const metadata = slug ? getAnimationMetadata(slug) : null;
  const sourceDescription = slug
    ? `View ${metadata?.name || 'this animation'} on GitHub`
    : 'View the code on GitHub';

  const Items: readonly GeneralItem[] = [
    {
      title: 'Show Unstable',
      description: 'Show or hide work-in-progress demos',
      icon: 'flask',
      backgroundColor: '#FF9500',
      type: 'unstable',
    },
    {
      title: 'Source Code',
      description: sourceDescription,
      icon: 'logo-github',
      backgroundColor: '#24292e',
      type: 'source',
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
      case 'source':
        const sourceUrl = slug
          ? `https://github.com/enzomanuelmangano/demos/tree/main/src/animations/${slug}`
          : 'https://github.com/enzomanuelmangano/demos/tree/main/src/animations';
        Linking.openURL(sourceUrl);
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
