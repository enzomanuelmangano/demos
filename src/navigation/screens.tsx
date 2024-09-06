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
import React from 'react';

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
import { FibonacciShader } from '../animations/fibonacci-shader';
import { FamilyNumberInput } from '../animations/family-number-input';
import { BalanceSlider } from '../animations/balance-slider';
import { FibonacciShaderGrid } from '../animations/fibonacci-shader-grid';
import { VerificationCode } from '../animations/verification-code';
import { EmailDemo } from '../animations/email-demo';
import { ScrollTransition3D } from '../animations/3d-scroll-transition';
import { StaggeredCardNumber } from '../animations/staggered-card-number';
import { StackedBottomSheet } from '../animations/stacked-bottom-sheet';
import { GLTransitions } from '../animations/gl-transitions';
import { PrequelSlider } from '../animations/prequel-slider';
import { EmptyQRCode } from '../animations/empty-qrcode';
import { InfiniteCarousel } from '../animations/infinite-carousel';
import { TwodosSlide } from '../animations/twodos-slide';
import { WheelPicker } from '../animations/wheel-picker';
import { StackedList } from '../animations/stacked-list';
import { GeometryButton } from '../animations/geometry-button';
import { RecordButton } from '../animations/record-button';
import { GridVisualizer } from '../animations/grid-visualizer';
import { IMessageStack } from '../animations/imessage-stack';
import { AtlasButton } from '../animations/atlas-button';
import { CheckboxInteractions } from '../animations/checkbox-interactions';
import { InteractionAppearance } from '../animations/interaction-appearance';
import { DotSheet } from '../animations/dot-sheet';
import { CoverflowCarousel } from '../animations/coverflow-carousel';
import { PaperFolding } from '../animations/paper';
import { MilesBarChart } from '../animations/miles-bar-chart';
import { Steps } from '../animations/steps';
import { PomodoroTimer } from '../animations/pomodoro-timer';
import { ClerkToast } from '../animations/clerk-toast';

import { withCustomBackIcon } from './with-custom-back-icon-hoc';

const ICON_SIZE = 24;
const ICON_COLOR = 'white';
const DefaultIconProps = {
  size: ICON_SIZE,
  color: ICON_COLOR,
};

const Screens = [
  {
    name: 'Mobile Input',
    route: 'MobileInput',
    component: MobileInput,
    backIconDark: false,
    icon: () => <AntDesign name="smileo" {...DefaultIconProps} />,
  },
  {
    name: 'Swipe Cards',
    route: 'SwipeCards',
    component: SwipeCards,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="cards" {...DefaultIconProps} />,
  },
  {
    name: 'Spiral',
    route: 'Spiral',
    component: Spiral,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="math-compass" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Scroll Progress',
    route: 'ScrollProgress',
    component: ScrollProgress,
    backIconDark: false,
    icon: () => <Feather name="percent" {...DefaultIconProps} />,
  },
  {
    name: 'Animated Grid List',
    route: 'AnimatedGridList',
    component: AnimatedGridList,
    backIconDark: false,
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
    backIconDark: false,
    icon: () => <Ionicons name="tennisball" {...DefaultIconProps} />,
  },
  {
    name: 'Shared Transitions',
    route: 'SharedTransitions',
    component: SharedTransitions,
    alert: true,
    icon: () => <MaterialIcons name="sync" {...DefaultIconProps} />,
  },
  {
    name: 'Story List',
    route: 'StoryList',
    component: StoryList,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="book-open" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Dynamic Tab Indicator',
    route: 'DynamicTabIndicator',
    component: DynamicTabIndicatorContainer,
    alert: true,
    iconMarginTop: 50,
    backIconDark: false,
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
    backIconDark: false,
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
    backIconDark: false,
    icon: () => <Ionicons name="barcode" {...DefaultIconProps} />,
  },
  {
    name: 'Color Carousel',
    route: 'ColorCarousel',
    component: ColorCarousel,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="palette" {...DefaultIconProps} />,
  },
  {
    name: 'Animated 3D Parallax',
    route: 'Animated3DParallax',
    component: Animated3DParallax,
    backIconDark: false,
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
    iconMarginTop: 40,
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
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="radar" {...DefaultIconProps} />,
  },
  {
    name: 'Image Cropper',
    route: 'ImageCropper',
    component: ImageCropper,
    backIconDark: false,
    iconMarginTop: 40,
    icon: () => <MaterialCommunityIcons name="crop" {...DefaultIconProps} />,
  },
  {
    name: 'Custom Drawer',
    route: 'CustomDrawer',
    component: CustomDrawer,
    iconMarginTop: 30,
    icon: () => <MaterialCommunityIcons name="menu" {...DefaultIconProps} />,
  },
  {
    name: 'Selectable Grid List',
    route: 'SelectableGridList',
    component: SelectableGridList,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="select-all" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Animated Count Text',
    route: 'AnimatedCountText',
    component: AnimatedCountText,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="counter" {...DefaultIconProps} />,
  },
  {
    name: 'QR Code Generator',
    route: 'QRCodeGenerator',
    component: QRCodeGenerator,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="qrcode" {...DefaultIconProps} />,
  },
  {
    name: 'Popup Handler',
    route: 'PopupHandler',
    component: PopupHandler,
    alert: true,
    icon: () => (
      <MaterialCommunityIcons name="blur-radial" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Twitter Tab Bar',
    route: 'TwitterTabBar',
    component: TwitterTabBar,
    backIconDark: false,
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
    backIconDark: false,
    alert: true,
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
    backIconDark: false,
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
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="arrow-up" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Skia Color Picker',
    route: 'SkiaColorPicker',
    component: SkiaColorPicker,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="palette" {...DefaultIconProps} />,
  },
  {
    name: 'Blurred Scroll',
    route: 'BlurredScroll',
    component: BlurredScroll,
    backIconDark: false,
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
    backIconDark: false,
    icon: () => <Octicons name="number" {...DefaultIconProps} />,
  },
  {
    name: 'Blurred Bottom Bar',
    route: 'BlurredBottomBar',
    component: BlurredBottomBar,
    backIconDark: false,
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
    icon: () => <MaterialCommunityIcons name="sort" {...DefaultIconProps} />,
  },
  {
    name: 'Fibonacci Shader',
    route: 'FibonacciShader',
    component: FibonacciShader,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="sphere" {...DefaultIconProps} />,
  },
  {
    name: 'Family Number Input',
    route: 'FamilyNumberInput',
    component: FamilyNumberInput,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="dots-grid" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Balance Slider',
    route: 'BalanceSlider',
    component: BalanceSlider,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="scale-balance" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Fibonacci Shader Grid',
    route: 'FibonacciShaderGrid',
    component: FibonacciShaderGrid,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="grid-large" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Verification Code',
    route: 'VerificationCode',
    component: VerificationCode,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="security" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Email Demo',
    route: 'EmailDemo',
    component: EmailDemo,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="delete" {...DefaultIconProps} />,
  },
  {
    name: '3D Scroll Transition',
    route: 'ScrollTransition3D',
    component: ScrollTransition3D,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="rotate-3d" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Staggered Card Number',
    route: 'StaggeredCardNumber',
    component: StaggeredCardNumber,
    icon: () => (
      <MaterialCommunityIcons
        name="credit-card-outline"
        {...DefaultIconProps}
      />
    ),
  },
  {
    name: 'Stacked Bottom Sheet',
    route: 'StackedBottomSheet',
    component: StackedBottomSheet,
    icon: () => <MaterialCommunityIcons name="card" {...DefaultIconProps} />,
  },
  {
    name: 'GL Transitions',
    route: 'GLTransitions',
    component: GLTransitions,
    iconMarginTop: 100,
    icon: () => (
      <MaterialCommunityIcons name="transition-masked" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Prequel Slider',
    route: 'PrequelSlider',
    component: PrequelSlider,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons
        name="picture-in-picture-bottom-right"
        {...DefaultIconProps}
      />
    ),
  },
  {
    name: 'Empty QR Code',
    route: 'EmptyQRCode',
    component: EmptyQRCode,
    backIconDark: true,
    icon: () => <MaterialCommunityIcons name="qrcode" {...DefaultIconProps} />,
  },
  {
    name: 'Infinite Carousel',
    route: 'InfiniteCarousel',
    component: InfiniteCarousel,
    backIconDark: true,
    icon: () => (
      <MaterialCommunityIcons
        name="view-carousel-outline"
        {...DefaultIconProps}
      />
    ),
  },
  {
    name: 'Twodos Slide',
    route: 'TwodosSlide',
    component: TwodosSlide,
    backIconDark: true,
    icon: () => (
      <MaterialCommunityIcons name="pan-right" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Wheel Picker',
    route: 'WheelPicker',
    component: WheelPicker,
    backIconDark: true,
    icon: () => (
      <MaterialCommunityIcons name="ship-wheel" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Stacked List',
    route: 'StackedList',
    component: StackedList,
    backIconDark: true,
    icon: () => (
      <MaterialCommunityIcons
        name="notification-clear-all"
        {...DefaultIconProps}
      />
    ),
  },
  {
    name: 'Geometry Button',
    route: 'GeometryButton',
    component: GeometryButton,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="sphere" {...DefaultIconProps} />,
  },
  {
    name: 'Record Button',
    route: 'RecordButton',
    component: RecordButton,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="record" {...DefaultIconProps} />,
  },
  {
    name: 'Grid Visualizer',
    route: 'GridVisualizer',
    component: GridVisualizer,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="grid" {...DefaultIconProps} />,
  },
  {
    name: 'iMessageStack',
    route: 'IMessageStack',
    component: IMessageStack,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="gesture-swipe" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Atlas Button',
    route: 'AtlasButton',
    component: AtlasButton,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="react" {...DefaultIconProps} />,
  },
  {
    name: 'Checkbox Interactions',
    route: 'CheckboxInteractions',
    component: CheckboxInteractions,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="checkbox-outline" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Interaction Appearance',
    route: 'InteractionAppearance',
    component: InteractionAppearance,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="theme-light-dark" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Dot Sheet',
    route: 'DotSheet',
    component: DotSheet,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="paperclip" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Coverflow Carousel',
    route: 'CoverflowCarousel',
    component: CoverflowCarousel,
    backIconDark: true,
    icon: () => (
      <MaterialCommunityIcons name="view-carousel" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Paper Folding',
    route: 'PaperFolding',
    component: PaperFolding,
    backIconDark: true,
    icon: () => (
      <MaterialCommunityIcons name="paper-roll" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Miles Bar Chart',
    route: 'MilesBarChart',
    component: MilesBarChart,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="chart-bar" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Steps',
    route: 'Steps',
    component: Steps,
    backIconDark: true,
    icon: () => (
      <MaterialCommunityIcons name="step-forward" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Pomodoro Timer',
    route: 'PomodoroTimer',
    component: PomodoroTimer,
    backIconDark: false,
    icon: () => (
      <MaterialCommunityIcons name="timer-outline" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Clerk Toast',
    route: 'ClerkToast',
    component: ClerkToast,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="toaster" {...DefaultIconProps} />,
  },
]
  .map((item, index) => {
    return {
      ...item,
      id: index,
      component: withCustomBackIcon({
        Component: item.component,
        backIconDark: item.backIconDark,
        iconMarginTop: item.iconMarginTop,
        alert: item.alert,
      }),
    };
  })
  .reverse();

export { Screens };
