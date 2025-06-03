import type { RouteProp } from '@react-navigation/native';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppData } from './apps-list/constants';
import { useCustomNavigation } from './navigation/expansion-provider';

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
      <TouchableOpacity
        onPress={handleGoBack}
        style={[styles.backButton, { top: safeTop + 16 }]}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={24} color="rgba(0, 0, 0, 0.7)" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
});
