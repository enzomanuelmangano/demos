import { ActionTray } from '../animations/action-tray';
import { AddToCart } from '../animations/add-to-cart';
import { AirbnbSlider } from '../animations/airbnb-slider';
import { Animated3DParallax } from '../animations/animated-3d-parallax';
import { AnimatedClipBox } from '../animations/animated-clip-box';
import { AnimatedCountText } from '../animations/animated-count-text';
import { AnimatedGridList } from '../animations/animated-grid-list';
import { AnimatedIndicatorList } from '../animations/animated-indicator-list';
import { AudioPlayer } from '../animations/audioplayer';
import { BlurCircles } from '../animations/blur-circles';
import { BlurredBottomBar } from '../animations/blurred-bottom-bar';
import { BlurredScroll } from '../animations/blurred-scroll';
import { BottomBarSkia } from '../animations/bottom-bar-skia';
import { CircularSlider } from '../animations/circular-slider';
import { ColorCarousel } from '../animations/color-carousel';
import { CubertoSlider } from '../animations/cuberto-slider';
import { CustomDrawer } from '../animations/custom-drawer';
import { DragToSort } from '../animations/drag-to-sort';
import { DynamicTabIndicatorContainer } from '../animations/dynamic-tab-indicator';
import { FloatingBottomBar } from '../animations/floating-bottom-bar';
import { FloatingModal } from '../animations/floating-modal';
import { FluidSlider } from '../animations/fluid-slider';
import { FourierVisualizer } from '../animations/fourier-visualizer';
import { FractalGlass } from '../animations/fractal-glass';
import { GitHubOnboarding } from '../animations/github-onboarding';
import { ImageCropper } from '../animations/image-cropper';
import { LoadingButton } from '../animations/loading-button';
import { Metaball } from '../animations/metaball';
import { MobileInput } from '../animations/mobile-input';
import { PopupHandler } from '../animations/popup-handler';
import { QRCodeGenerator } from '../animations/qrcode';
import { RadarChartContainer } from '../animations/radar-chart';
import { ScrollProgress } from '../animations/scroll-progress';
import { ScrollableBottomSheet } from '../animations/scrollable-bottom-sheet';
import { SelectableGridList } from '../animations/selectable-grid-list';
import { SharedTransitions } from '../animations/shared-transition';
import { SkiaBottomSheet } from '../animations/skia-bottom-sheet';
import { SkiaColorPicker } from '../animations/skia-color-picker';
import { SlideToReveal } from '../animations/slide-to-reveal';
import { SmoothDropdown } from '../animations/smooth-dropdown';
import { Spiral } from '../animations/spiral';
import { SplitButton } from '../animations/split-button';
import { SteddyGraphInteraction } from '../animations/steddy-graph-interaction';
import { StoryList } from '../animations/story-list';
import { SwipeCards } from '../animations/swipe-cards';
import { TelegramThemeSwitch } from '../animations/telegram-theme-switch';
import { ThemeCanvasAnimation } from '../animations/theme-canvas-animation';
import { Toast } from '../animations/toast';
import { TwitterTabBar } from '../animations/twitter-tab-bar';

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
  {
    name: 'Dynamic Tab Indicator',
    route: 'DynamicTabIndicator',
    component: DynamicTabIndicatorContainer,
  },
  {
    name: 'Blur Circles',
    route: 'BlurCircles',
    component: BlurCircles,
  },
  {
    name: 'Smooth Dropdown',
    route: 'SmoothDropdown',
    component: SmoothDropdown,
  },
  {
    name: 'Skia BottomSheet',
    route: 'SkiaBottomSheet',
    component: SkiaBottomSheet,
  },
  {
    name: 'Floating Modal',
    route: 'FloatingModal',
    component: FloatingModal,
  },
  {
    name: 'AudioPlayer',
    route: 'AudioPlayer',
    component: AudioPlayer,
  },
  {
    name: 'Color Carousel',
    route: 'ColorCarousel',
    component: ColorCarousel,
  },
  {
    name: 'Animated 3D Parallax',
    route: 'Animated3DParallax',
    component: Animated3DParallax,
  },
  {
    name: 'Fluid Slider',
    route: 'FluidSlider',
    component: FluidSlider,
  },
  {
    name: 'Animated Indicator List',
    route: 'AnimatedIndicatorList',
    component: AnimatedIndicatorList,
  },
  {
    name: 'Radar Chart',
    route: 'RadarChart',
    component: RadarChartContainer,
  },
  {
    name: 'Image Cropper',
    route: 'ImageCropper',
    component: ImageCropper,
  },
  {
    name: 'Custom Drawer',
    route: 'CustomDrawer',
    component: CustomDrawer,
  },
  {
    name: 'Selectable Grid List',
    route: 'SelectableGridList',
    component: SelectableGridList,
  },
  {
    name: 'Animated Count Text',
    route: 'AnimatedCountText',
    component: AnimatedCountText,
  },
  {
    name: 'QR Code Generator',
    route: 'QRCodeGenerator',
    component: QRCodeGenerator,
  },
  {
    name: 'Popup Handler',
    route: 'PopupHandler',
    component: PopupHandler,
  },
  {
    name: 'Twitter Tab Bar',
    route: 'TwitterTabBar',
    component: TwitterTabBar,
  },
  {
    name: 'Circular Slider',
    route: 'CircularSlider',
    component: CircularSlider,
  },
  {
    name: 'Split Button',
    route: 'SplitButton',
    component: SplitButton,
  },
  {
    name: 'Telegram Theme Switch',
    route: 'TelegramThemeSwitch',
    component: TelegramThemeSwitch,
  },
  {
    name: 'Fourier Visualizer',
    route: 'FourierVisualizer',
    component: FourierVisualizer,
  },
  {
    name: 'GitHub Onboarding',
    route: 'GitHubOnboarding',
    component: GitHubOnboarding,
  },
  {
    name: 'Loading Button',
    route: 'LoadingButton',
    component: LoadingButton,
  },
  {
    name: 'Scrollable Bottom Sheet',
    route: 'ScrollableBottomSheet',
    component: ScrollableBottomSheet,
  },
  {
    name: 'Skia Color Picker',
    route: 'SkiaColorPicker',
    component: SkiaColorPicker,
  },
  {
    name: 'Blurred Scroll',
    route: 'BlurredScroll',
    component: BlurredScroll,
  },
  {
    name: 'AirBnb Slider',
    route: 'AirBnbSlider',
    component: AirbnbSlider,
  },
  {
    name: 'Steddy Graph Interaction',
    route: 'SteddyGraphInteraction',
    component: SteddyGraphInteraction,
  },
  {
    name: 'Action Tray',
    route: 'ActionTray',
    component: ActionTray,
  },
  {
    name: 'Toast',
    route: 'Toast',
    component: Toast,
  },
  {
    name: 'Slide to Reveal',
    route: 'SlideToReveal',
    component: SlideToReveal,
  },
  {
    name: 'Blurred Bottom Bar',
    route: 'BlurredBottomBar',
    component: BlurredBottomBar,
  },
  {
    name: 'Fractal Glass',
    route: 'FractalGlass',
    component: FractalGlass,
  },
  {
    name: 'Drag to Sort',
    route: 'DragToSort',
    component: DragToSort,
  },
] as const;

export { Screens };
