import { Text, TouchableOpacity, StyleSheet } from 'react-native';

type DrawerListItemProps = {
  label: string;
  onPress: () => void;
};

const DrawerListItem: React.FC<DrawerListItemProps> = ({ label, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 2,
    height: 50,
    justifyContent: 'center',
    marginBottom: 5,
    marginHorizontal: 10,
  },
  label: {
    color: 'white',
    fontWeight: '500',
    letterSpacing: 1,
    marginLeft: 15,
  },
});

export { DrawerListItem };
