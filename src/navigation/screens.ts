import { MobileInput } from '../animations/mobile-input';
import { ScrollProgress } from '../animations/scroll-progress';
import { Spiral } from '../animations/spiral';
import { SwipeCards } from '../animations/swipe-cards';

const Screens = [
  {
    name: 'Mobile Input',
    route: 'MobileInput',
    component: MobileInput,
  },
  {
    name: 'Swipe Cards',
    route: 'SwipeCards',
    component: SwipeCards,
  },
  {
    name: 'Spiral',
    route: 'Spiral',
    component: Spiral,
  },
  {
    name: 'Scroll Progress',
    route: 'ScrollProgress',
    component: ScrollProgress,
  },
] as const;

export { Screens };
