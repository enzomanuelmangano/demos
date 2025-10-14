import { StyleSheet, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableOpacity } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCustomNavigation } from './navigation/expansion-provider';

import type { AppData } from './apps-list/constants';
import type { RouteProp } from '@react-navigation/native';

/**
 * Navigation stack parameter list
 */
export type RootStackParamList = {
  Home: undefined;
  AppDetail: { item: AppData };
};

/**
 * Props for the AppDetailScreen component
 */
interface AppDetailScreenProps {
  route: RouteProp<RootStackParamList, 'AppDetail'>;
}

/**
 * AppDetailScreen component displays a full-screen version of the selected app
 * with the same gradient background and a back button
 */
export const AppDetailScreen: React.FC<AppDetailScreenProps> = ({ route }) => {
  const { item } = route.params;
  const { top: safeTop } = useSafeAreaInsets();
  const navigation = useCustomNavigation();

  const handleGoBack = () => {
    navigation.backTransition();
  };

  return (
    <View style={styles.container}>
      {/* Gradient background */}
      <LinearGradient
        colors={item.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      />

      {/* Back button */}
      <PressableOpacity
        onPress={handleGoBack}
        style={[styles.backButton, { top: safeTop + 16 }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={24} color="rgba(0, 0, 0, 0.7)" />
      </PressableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 22,
    elevation: 3,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    width: 44,
  },
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
});
