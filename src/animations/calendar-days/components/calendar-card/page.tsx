import { StyleSheet } from 'react-native';

import Animated from 'react-native-reanimated';

import { PAGE_SIZE, SIZE } from './constants';
import { PageFace } from './page-face';
import { CastShadow } from './page-shadows';
import { usePageFlipAnimation } from './use-page-flip-animation';

import type { PageProps } from './types';

export const Page = ({
  index,
  progress,
  frontPageNumber,
  backPageNumber,
  totalPages,
}: PageProps) => {
  const { pageFlipProgress, rFlipStyle } = usePageFlipAnimation({
    index,
    progress,
    totalPages,
  });

  return (
    <>
      <CastShadow pageFlipProgress={pageFlipProgress} />

      <Animated.View style={[rFlipStyle, styles.pageContainer]}>
        <PageFace
          pageNumber={frontPageNumber}
          variant="front"
          pageFlipProgress={pageFlipProgress}
        />
        <PageFace
          pageNumber={backPageNumber}
          variant="back"
          pageFlipProgress={pageFlipProgress}
        />
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  pageContainer: {
    height: PAGE_SIZE,
    position: 'absolute',
    top: PAGE_SIZE,
    transformOrigin: ['50%', '50%', 0.005],
    width: SIZE,
  },
});
