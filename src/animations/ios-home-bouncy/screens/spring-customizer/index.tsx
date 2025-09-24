import { useState, type FC } from 'react';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';

import {
  ClosingSpringConfigShared,
  OpeningSpringConfigShared,
} from '../../animations/bouncy';

import {
  ClosingEnteringKeyframe,
  ClosingExitingKeyframe,
  OpeningEnteringKeyframe,
  OpeningExitingKeyframe,
} from './animations';
import { ModalContent } from './components/modal-content';
import { PullToDismissGesture } from './components/pull-to-dismiss';
import { SpringSliderContainer } from './components/spring-slider-container';
import { TabSelector } from './components/tab-selector';

type SpringTab = 'closing' | 'opening';

interface SpringCustomizerProps {
  onClose?: () => void;
}

const TAB_OPTIONS = [
  { key: 'opening' as const, label: 'Opening' },
  { key: 'closing' as const, label: 'Closing' },
];

/**
 * SpringCustomizer component provides an interface to adjust spring animation parameters
 * Allows users to customize both opening and closing spring animations
 */
export const SpringCustomizer: FC<SpringCustomizerProps> = ({ onClose }) => {
  const [selectedTab, setSelectedTab] = useState<SpringTab>('opening');

  return (
    <PullToDismissGesture onClose={onClose}>
      <ModalContent>
        <TabSelector
          options={TAB_OPTIONS}
          selectedTab={selectedTab}
          onTabChange={setSelectedTab}
        />
        <LayoutAnimationConfig skipEntering>
          {selectedTab === 'opening' ? (
            <Animated.View
              entering={OpeningEnteringKeyframe}
              exiting={OpeningExitingKeyframe}
              key="opening">
              <SpringSliderContainer
                mutableConfig={OpeningSpringConfigShared}
              />
            </Animated.View>
          ) : (
            <Animated.View
              entering={ClosingEnteringKeyframe}
              exiting={ClosingExitingKeyframe}
              key="closing">
              <SpringSliderContainer
                mutableConfig={ClosingSpringConfigShared}
              />
            </Animated.View>
          )}
        </LayoutAnimationConfig>
      </ModalContent>
    </PullToDismissGesture>
  );
};
