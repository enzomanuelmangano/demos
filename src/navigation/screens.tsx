import {
  AntDesign,
  Entypo,
  Feather,
  FontAwesome,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
  Octicons,
} from '@expo/vector-icons';

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

const ICON_SIZE = 24;
const ICON_COLOR = 'black';
const DefaultIconProps = {
  size: ICON_SIZE,
  color: ICON_COLOR,
};

const Screens = [
  {
    name: 'Mobile Input',
    route: 'MobileInput',
    component: MobileInput,
    icon: () => <AntDesign name="smileo" {...DefaultIconProps} />,
  },
  {
    name: 'Swipe Cards',
    route: 'SwipeCards',
    component: SwipeCards,
    icon: () => <MaterialCommunityIcons name="cards" {...DefaultIconProps} />,
  },
  {
    name: 'Spiral',
    route: 'Spiral',
    component: Spiral,
    icon: () => (
      <MaterialCommunityIcons name="math-compass" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Scroll Progress',
    route: 'ScrollProgress',
    component: ScrollProgress,
    icon: () => <Feather name="percent" {...DefaultIconProps} />,
  },
  {
    name: 'Animated Grid List',
    route: 'AnimatedGridList',
    component: AnimatedGridList,
    icon: () => <Feather name="grid" {...DefaultIconProps} />,
  },
  {
    name: 'Floating Bottom Bar',
    route: 'FloatingBottomBar',
    component: FloatingBottomBar,
    icon: () => <MaterialIcons name="highlight" {...DefaultIconProps} />,
  },
  {
    name: 'Animated Clip Box',
    route: 'AnimatedClipBox',
    component: AnimatedClipBox,
    icon: () => <MaterialIcons name="crop-square" {...DefaultIconProps} />,
  },
  {
    name: 'Theme Canvas Animation',
    route: 'ThemeCanvasAnimation',
    component: ThemeCanvasAnimation,
    icon: () => <MaterialIcons name="color-lens" {...DefaultIconProps} />,
  },
  {
    name: 'Add to Cart',
    route: 'AddToCart',
    component: AddToCart,
    icon: () => (
      <MaterialIcons name="add-shopping-cart" {...DefaultIconProps} />
    ),
  },
  {
    name: 'BottomBarSkia',
    route: 'BottomBarSkia',
    component: BottomBarSkia,
    icon: () => <Feather name="tablet" {...DefaultIconProps} />,
  },
  {
    name: 'Cuberto Slider',
    route: 'CubertoSlider',
    component: CubertoSlider,
    icon: () => <MaterialCommunityIcons name="balloon" {...DefaultIconProps} />,
  },
  {
    name: 'Metaball',
    route: 'Metaball',
    component: Metaball,
    icon: () => <Ionicons name="tennisball" {...DefaultIconProps} />,
  },
  {
    name: 'Shared Transitions',
    route: 'SharedTransitions',
    component: SharedTransitions,
    icon: () => <MaterialIcons name="sync" {...DefaultIconProps} />,
  },
  {
    name: 'Story List',
    route: 'StoryList',
    component: StoryList,
    icon: () => (
      <MaterialCommunityIcons name="book-open" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Dynamic Tab Indicator',
    route: 'DynamicTabIndicator',
    component: DynamicTabIndicatorContainer,
    icon: () => <MaterialIcons name="tab" {...DefaultIconProps} />,
  },
  {
    name: 'Blur Circles',
    route: 'BlurCircles',
    component: BlurCircles,
    icon: () => <MaterialIcons name="blur-on" {...DefaultIconProps} />,
  },
  {
    name: 'Smooth Dropdown',
    route: 'SmoothDropdown',
    component: SmoothDropdown,
    icon: () => <MaterialIcons name="arrow-drop-down" {...DefaultIconProps} />,
  },
  {
    name: 'Skia BottomSheet',
    route: 'SkiaBottomSheet',
    component: SkiaBottomSheet,
    icon: () => <MaterialCommunityIcons name="card" {...DefaultIconProps} />,
  },
  {
    name: 'Floating Modal',
    route: 'FloatingModal',
    component: FloatingModal,
    icon: () => <Entypo name="popup" {...DefaultIconProps} />,
  },
  {
    name: 'AudioPlayer',
    route: 'AudioPlayer',
    component: AudioPlayer,
    icon: () => <Ionicons name="barcode" {...DefaultIconProps} />,
  },
  {
    name: 'Color Carousel',
    route: 'ColorCarousel',
    component: ColorCarousel,
    icon: () => <MaterialCommunityIcons name="palette" {...DefaultIconProps} />,
  },
  {
    name: 'Animated 3D Parallax',
    route: 'Animated3DParallax',
    component: Animated3DParallax,
    icon: () => <MaterialCommunityIcons name="twitter" {...DefaultIconProps} />,
  },
  {
    name: 'Fluid Slider',
    route: 'FluidSlider',
    component: FluidSlider,
    icon: () => <MaterialCommunityIcons name="water" {...DefaultIconProps} />,
  },
  {
    name: 'Animated Indicator List',
    route: 'AnimatedIndicatorList',
    component: AnimatedIndicatorList,
    icon: () => (
      <MaterialCommunityIcons
        name="format-list-bulleted"
        {...DefaultIconProps}
      />
    ),
  },
  {
    name: 'Radar Chart',
    route: 'RadarChart',
    component: RadarChartContainer,
    icon: () => <MaterialCommunityIcons name="radar" {...DefaultIconProps} />,
  },
  {
    name: 'Image Cropper',
    route: 'ImageCropper',
    component: ImageCropper,
    icon: () => <MaterialCommunityIcons name="crop" {...DefaultIconProps} />,
  },
  {
    name: 'Custom Drawer',
    route: 'CustomDrawer',
    component: CustomDrawer,
    icon: () => <MaterialCommunityIcons name="menu" {...DefaultIconProps} />,
  },
  {
    name: 'Selectable Grid List',
    route: 'SelectableGridList',
    component: SelectableGridList,
    icon: () => (
      <MaterialCommunityIcons name="select-all" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Animated Count Text',
    route: 'AnimatedCountText',
    component: AnimatedCountText,
    icon: () => <MaterialCommunityIcons name="counter" {...DefaultIconProps} />,
  },
  {
    name: 'QR Code Generator',
    route: 'QRCodeGenerator',
    component: QRCodeGenerator,
    icon: () => <MaterialCommunityIcons name="qrcode" {...DefaultIconProps} />,
  },
  {
    name: 'Popup Handler',
    route: 'PopupHandler',
    component: PopupHandler,
    icon: () => (
      <MaterialCommunityIcons name="blur-radial" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Twitter Tab Bar',
    route: 'TwitterTabBar',
    component: TwitterTabBar,
    icon: () => <MaterialCommunityIcons name="twitter" {...DefaultIconProps} />,
  },
  {
    name: 'Circular Slider',
    route: 'CircularSlider',
    component: CircularSlider,
    icon: () => <MaterialCommunityIcons name="circle" {...DefaultIconProps} />,
  },
  {
    name: 'Split Button',
    route: 'SplitButton',
    component: SplitButton,
    icon: () => (
      <MaterialCommunityIcons name="call-split" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Telegram Theme Switch',
    route: 'TelegramThemeSwitch',
    component: TelegramThemeSwitch,
    icon: () => <FontAwesome name="telegram" {...DefaultIconProps} />,
  },
  {
    name: 'Fourier Visualizer',
    route: 'FourierVisualizer',
    component: FourierVisualizer,
    icon: () => <Octicons name="paintbrush" {...DefaultIconProps} />,
  },
  {
    name: 'GitHub Onboarding',
    route: 'GitHubOnboarding',
    component: GitHubOnboarding,
    icon: () => <Octicons name="mark-github" {...DefaultIconProps} />,
  },
  {
    name: 'Loading Button',
    route: 'LoadingButton',
    component: LoadingButton,
    icon: () => <AntDesign name="loading1" {...DefaultIconProps} />,
  },
  {
    name: 'Scrollable Bottom Sheet',
    route: 'ScrollableBottomSheet',
    component: ScrollableBottomSheet,
    icon: () => (
      <MaterialCommunityIcons name="arrow-up" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Skia Color Picker',
    route: 'SkiaColorPicker',
    component: SkiaColorPicker,
    icon: () => <MaterialCommunityIcons name="palette" {...DefaultIconProps} />,
  },
  {
    name: 'Blurred Scroll',
    route: 'BlurredScroll',
    component: BlurredScroll,
    icon: () => <MaterialCommunityIcons name="blur" {...DefaultIconProps} />,
  },
  {
    name: 'AirBnb Slider',
    route: 'AirBnbSlider',
    component: AirbnbSlider,
    icon: () => <MaterialCommunityIcons name="counter" {...DefaultIconProps} />,
  },
  {
    name: 'Steddy Graph Interaction',
    route: 'SteddyGraphInteraction',
    component: SteddyGraphInteraction,
    icon: () => (
      <MaterialCommunityIcons name="chart-line" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Action Tray',
    route: 'ActionTray',
    component: ActionTray,
    icon: () => <MaterialCommunityIcons name="card" {...DefaultIconProps} />,
  },
  {
    name: 'Toast',
    route: 'Toast',
    component: Toast,
    icon: () => <MaterialCommunityIcons name="message" {...DefaultIconProps} />,
  },
  {
    name: 'Slide to Reveal',
    route: 'SlideToReveal',
    component: SlideToReveal,
    icon: () => <Octicons name="number" {...DefaultIconProps} />,
  },
  {
    name: 'Blurred Bottom Bar',
    route: 'BlurredBottomBar',
    component: BlurredBottomBar,
    icon: () => (
      <MaterialCommunityIcons name="blur-linear" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Fractal Glass',
    route: 'FractalGlass',
    component: FractalGlass,
    icon: () => <MaterialCommunityIcons name="mirror" {...DefaultIconProps} />,
  },
  {
    name: 'Drag to Sort',
    route: 'DragToSort',
    component: DragToSort,
    icon: () => <MaterialCommunityIcons name="drag" {...DefaultIconProps} />,
  },
].map((item, index) => {
  return {
    ...item,
    id: index,
  };
});

export { Screens };
