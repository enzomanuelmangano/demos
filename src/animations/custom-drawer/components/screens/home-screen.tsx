import { View, Text, StyleSheet } from 'react-native';

const HomeScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home Screen</Text>
      <Text style={styles.subtitle}>Welcome to the home screen!</Text>
      <Text style={styles.description}>
        This is a sample home screen to demonstrate the custom drawer
        navigation.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  description: {
    color: '#888',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  subtitle: {
    color: '#666',
    fontSize: 18,
    marginBottom: 20,
  },
  title: {
    color: '#333',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});

export { HomeScreen };
