/**
 * Main application entry point for the Ticket Demo app.
 * Displays a flippable ticket with front and back sides in a centered layout.
 */

import { StyleSheet, View } from 'react-native';

import { Ticket } from './components/ticket';
import { BackSide } from './components/ticket/back-side';
import { FrontSide } from './components/ticket/front-side';

/**
 * Root component of the application.
 * Sets up the main layout with a dark background and centered ticket.
 */
export const ThreadsHoloTicket = () => {
  return (
    <View style={styles.container}>
      {/* Ticket container with elevated z-index to ensure proper rendering */}
      <View style={{ zIndex: 10000 }}>
        <Ticket
          width={300}
          height={400}
          frontSide={<FrontSide />}
          backSide={<BackSide />}
        />
      </View>
    </View>
  );
};

/**
 * Global styles for the app
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070018', // Dark purple background
    alignItems: 'center',
    justifyContent: 'center',
  },
});
