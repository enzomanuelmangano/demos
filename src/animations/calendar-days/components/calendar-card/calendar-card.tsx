import { StyleSheet, Text, View } from 'react-native';

import {
  BODY_COLOR,
  BODY_HEIGHT,
  HEADER_COLOR,
  HEADER_HEIGHT,
  SIZE,
} from './constants';
import { Page } from './page';
import { StaticPage } from './static-page';

import type { CalendarCardProps } from './types';

const Header = () => (
  <View style={styles.header}>
    <Text style={styles.headerText}>ON THE</Text>
  </View>
);

type BodyProps = CalendarCardProps;

const Body = ({ progress, totalPages }: BodyProps) => (
  <View style={styles.body}>
    <StaticPage pageNumber={1} position="top" />
    <StaticPage pageNumber={totalPages + 1} position="bottom" />

    {Array.from({ length: totalPages }).map((_, index) => (
      <Page
        key={index}
        index={index}
        progress={progress}
        frontPageNumber={index + 1}
        backPageNumber={index + 2}
        totalPages={totalPages}
      />
    ))}
  </View>
);

export const CalendarCard = ({ progress, totalPages }: CalendarCardProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.cardShadow}>
        <View>
          <Header />
          <Body progress={progress} totalPages={totalPages} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  body: {
    backgroundColor: BODY_COLOR,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderCurve: 'continuous',
    height: BODY_HEIGHT,
    position: 'relative',
    width: SIZE,
  },
  cardShadow: {
    borderCurve: 'continuous',
    borderRadius: 24,
    boxShadow: '0px 0px 20px rgba(0, 0, 0, 0.1)',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    backgroundColor: HEADER_COLOR,
    borderCurve: 'continuous',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: HEADER_HEIGHT,
    justifyContent: 'center',
    width: SIZE,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 3,
  },
});
