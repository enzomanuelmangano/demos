import { AddToCart } from '../animations/add-to-cart';
import { AnimatedClipBox } from '../animations/animated-clip-box';
import { AnimatedGridList } from '../animations/animated-grid-list';
import { BottomBarSkia } from '../animations/bottom-bar-skia';
import { CubertoSlider } from '../animations/cuberto-slider';
import { FloatingBottomBar } from '../animations/floating-bottom-bar';
import { Metaball } from '../animations/metaball';
import { MobileInput } from '../animations/mobile-input';
import { ScrollProgress } from '../animations/scroll-progress';
import { SharedTransitions } from '../animations/shared-transition';
import { Spiral } from '../animations/spiral';
import { StoryList } from '../animations/story-list';
import { SwipeCards } from '../animations/swipe-cards';
import { ThemeCanvasAnimation } from '../animations/theme-canvas-animation';

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
  {
    name: 'Animated Grid List',
    route: 'AnimatedGridList',
    component: AnimatedGridList,
  },
  {
    name: 'Floating Bottom Bar',
    route: 'FloatingBottomBar',
    component: FloatingBottomBar,
  },
  {
    name: 'Animated Clip Box',
    route: 'AnimatedClipBox',
    component: AnimatedClipBox,
  },
  {
    name: 'Theme Canvas Animation',
    route: 'ThemeCanvasAnimation',
    component: ThemeCanvasAnimation,
  },
  {
    name: 'Add to Cart',
    route: 'AddToCart',
    component: AddToCart,
  },
  {
    name: 'BottomBarSkia',
    route: 'BottomBarSkia',
    component: BottomBarSkia,
  },
  {
    name: 'Cuberto Slider',
    route: 'CubertoSlider',
    component: CubertoSlider,
  },
  {
    name: 'Metaball',
    route: 'Metaball',
    component: Metaball,
  },
  {
    name: 'Shared Transitions',
    route: 'SharedTransitions',
    component: SharedTransitions,
  },
  {
    name: 'Story List',
    route: 'StoryList',
    component: StoryList,
  },
] as const;

export { Screens };
