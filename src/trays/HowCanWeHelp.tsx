import { View, StyleSheet, Text } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';

import { AnimationInspirations } from '../animations/inspirations';
import { useRetray } from '../packages/retray';

type IoniconsIconName = React.ComponentProps<typeof Ionicons>['name'];

interface HelpItem {
  title: string;
  description: string;
  icon: IoniconsIconName;
  backgroundColor: string;
  type: string;
}

interface HowCanWeHelpProps {
  slug?: string;
}

export const HowCanWeHelp = ({ slug }: HowCanWeHelpProps) => {
  const AllItems: readonly HelpItem[] = [
    {
      title: 'Feedback',
      description: 'Let us know how to improve by providing some feedback',
      icon: 'chatbox-ellipses',
      backgroundColor: '#4A90E2',
      type: 'feedback',
    },
    {
      title: 'Inspiration',
      description: 'View the original inspiration for this animation',
      icon: 'bulb',
      backgroundColor: '#F5A623',
      type: 'inspiration',
    },
    {
      title: 'General',
      description: 'Settings, source code, and more',
      icon: 'settings-outline',
      backgroundColor: '#8E8E93',
      type: 'general',
    },
  ] as const;

  const { show } = useRetray();

  // Check if inspiration data exists for the current slug
  // Hide inspiration only if BOTH authorName and link are null
  const hasInspiration =
    slug &&
    AnimationInspirations[slug] &&
    !(
      AnimationInspirations[slug].authorName === null &&
      AnimationInspirations[slug].link === null
    );

  // Filter items to hide inspiration if no data is available
  const Items = AllItems.filter(
    item => item.type !== 'inspiration' || hasInspiration,
  );

  const handleItemPress = (type: string) => {
    switch (type) {
      case 'feedback':
        show('shareFeedback');
        break;
      case 'inspiration':
        show('inspiration', { slug });
        break;
      case 'general':
        show('general', { slug });
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
