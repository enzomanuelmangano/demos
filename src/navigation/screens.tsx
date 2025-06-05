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
import { CircularCarousel } from '../animations/circular-carousel';
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
import { PaperFolding } from '../animations/paper-folding';
import { MilesBarChart } from '../animations/miles-bar-chart';
import { Steps } from '../animations/steps';
import { PomodoroTimer } from '../animations/pomodoro-timer';
import { ClerkToast } from '../animations/clerk-toast';
import { DurationSlider } from '../animations/duration-slider';
import { AlertDrawer } from '../animations/alert-drawer';
import { MotionBlur } from '../animations/motion-blur';
import { DeleteButton } from '../animations/delete-button';
import { DynamicBlurTabs } from '../animations/dynamic-blur-tabs';
import { Snake } from '../animations/snake';
import { ExpandableMiniPlayer } from '../animations/expandable-mini-player';
import { BezierCurveOutline } from '../animations/bezier-curve-outline';
import { LinearTabInteraction } from '../animations/linear-tab-interaction';
import { TabNavigation } from '../animations/tab-navigation';
import { ExclusionTabs } from '../animations/exclusion-tabs';
import { StackedModals } from '../animations/stacked-modals';
import { VerificationCodeFace } from '../animations/verification-code-face';
import { EverybodyCanCook } from '../animations/everybody-can-cook';
import { ThreadsHoloTicket } from '../animations/threads-holo-ticket/src';
import { FluidTabInteraction } from '../animations/fluid-tab-interaction';
import { ShakeToDeleteAnimation } from '../animations/shake-to-delete';
import { ComposableTextScreen } from '../animations/composable-text';
import { CardShaderReflections } from '../animations/card-shader-reflections';
import { ClockTimePicker } from '../animations/clock-time-picker';
import { Sudoku } from '../animations/sudoku';
import { ParticlesButton } from '../animations/particles-button';
import { iOSHomeGrid } from '../animations/ios-home-grid';

import { withCustomBackIcon } from './with-custom-back-icon-hoc';

const ICON_SIZE = 24;
const ICON_COLOR = 'white';
const DefaultIconProps = {
  size: ICON_SIZE,
  color: ICON_COLOR,
};

export const Screens = [
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
    alert: true,
    icon: () => (
      <Feather name="tablet" {...DefaultIconProps} color={'yellow'} />
    ),
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
    icon: () => (
      <MaterialIcons name="sync" {...DefaultIconProps} color={'yellow'} />
    ),
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
    icon: () => (
      <MaterialIcons name="tab" {...DefaultIconProps} color={'yellow'} />
    ),
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
    alert: true,
    icon: () => (
      <MaterialCommunityIcons
        name="card"
        {...DefaultIconProps}
        color={'yellow'}
      />
    ),
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
    alert: true,
    icon: () => (
      <MaterialCommunityIcons
        name="palette"
        {...DefaultIconProps}
        color={'yellow'}
      />
    ),
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
    alert: true,
    icon: () => (
      <MaterialCommunityIcons
        name="menu"
        {...DefaultIconProps}
        color={'yellow'}
      />
    ),
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
    alert: true,
    icon: () => (
      <MaterialCommunityIcons
        name="qrcode"
        {...DefaultIconProps}
        color={'yellow'}
      />
    ),
  },
  {
    name: 'Popup Handler',
    route: 'PopupHandler',
    component: PopupHandler,
    alert: true,
    icon: () => (
      <MaterialCommunityIcons
        name="blur-radial"
        {...DefaultIconProps}
        color={'yellow'}
      />
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
    name: 'Circular Carousel',
    route: 'CircularCarousel',
    component: CircularCarousel,
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
    icon: () => (
      <FontAwesome name="telegram" {...DefaultIconProps} color={'yellow'} />
    ),
  },
  {
    name: 'Fourier Visualizer',
    route: 'FourierVisualizer',
    component: FourierVisualizer,
    alert: true,
    icon: () => (
      <Octicons name="paintbrush" {...DefaultIconProps} color={'yellow'} />
    ),
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
    alert: true,
    icon: () => (
      <AntDesign name="loading1" {...DefaultIconProps} color={'yellow'} />
    ),
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
    alert: true,
    icon: () => (
      <MaterialCommunityIcons
        name="qrcode"
        {...DefaultIconProps}
        color={'yellow'}
      />
    ),
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
    alert: true,
    icon: () => (
      <MaterialCommunityIcons
        name="grid"
        {...DefaultIconProps}
        color={'yellow'}
      />
    ),
  },
  {
    name: 'iMessageStack',
    route: 'IMessageStack',
    component: IMessageStack,
    backIconDark: false,
    alert: true,
    icon: () => (
      <MaterialCommunityIcons
        name="gesture-swipe"
        {...DefaultIconProps}
        color={'yellow'}
      />
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
    alert: true,
    icon: () => (
      <MaterialCommunityIcons
        name="paper-roll"
        {...DefaultIconProps}
        color={'yellow'}
      />
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
    name: 'Exclusion Tabs',
    route: 'ExclusionTabs',
    component: ExclusionTabs,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="tab" {...DefaultIconProps} />,
  },
  {
    name: 'Clerk Toast',
    route: 'ClerkToast',
    component: ClerkToast,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="toaster" {...DefaultIconProps} />,
  },
  {
    name: 'Duration Slider',
    route: 'DurationSlider',
    component: DurationSlider,
    backIconDark: true,
    icon: () => <MaterialCommunityIcons name="timer" {...DefaultIconProps} />,
  },
  {
    name: 'Alert Drawer',
    route: 'AlertDrawer',
    component: AlertDrawer,
    backIconDark: true,
    icon: () => <MaterialCommunityIcons name="alert" {...DefaultIconProps} />,
  },
  {
    name: 'Motion Blur',
    route: 'MotionBlur',
    component: MotionBlur,
    backIconDark: true,
    icon: () => <MaterialCommunityIcons name="blur" {...DefaultIconProps} />,
  },
  {
    name: 'Linear Tab Interaction',
    route: 'LinearTabInteraction',
    component: LinearTabInteraction,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="tab" {...DefaultIconProps} />,
  },
  {
    name: 'Delete Button',
    route: 'DeleteButton',
    component: DeleteButton,
    backIconDark: true,
    icon: () => <MaterialCommunityIcons name="delete" {...DefaultIconProps} />,
  },
  {
    name: 'Dynamic Blur Tabs',
    route: 'DynamicBlurTabs',
    component: DynamicBlurTabs,
    backIconDark: true,
    icon: () => <MaterialCommunityIcons name="blur" {...DefaultIconProps} />,
  },
  {
    name: 'Snake',
    route: 'Snake',
    component: Snake,
    backIconDark: true,
    icon: () => <MaterialCommunityIcons name="snake" {...DefaultIconProps} />,
  },
  {
    name: 'Expandable Mini Player',
    route: 'ExpandableMiniPlayer',
    component: ExpandableMiniPlayer,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="music" {...DefaultIconProps} />,
  },
  {
    name: 'Bezier Curve Outline',
    route: 'BezierCurveOutline',
    component: BezierCurveOutline,
    backIconDark: true,
    icon: () => (
      <MaterialCommunityIcons name="vector-bezier" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Tab Navigation',
    route: 'TabNavigation',
    component: TabNavigation,
    backIconDark: true,
    icon: () => <MaterialCommunityIcons name="tab" {...DefaultIconProps} />,
  },
  {
    name: 'Stacked Modals',
    route: 'StackedModals',
    component: StackedModals,
    backIconDark: true,
    icon: () => <MaterialCommunityIcons name="card" {...DefaultIconProps} />,
  },
  {
    name: 'Verification Code Face',
    route: 'VerificationCodeFace',
    component: VerificationCodeFace,
    backIconDark: true,
    icon: () => (
      <MaterialCommunityIcons name="baby-face" {...DefaultIconProps} />
    ),
  },
  {
    name: 'Everybody Can Cook',
    route: 'EverybodyCanCook',
    component: EverybodyCanCook,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="food" {...DefaultIconProps} />,
  },
  {
    name: 'Threads Holo Ticket',
    route: 'ThreadsHoloTicket',
    component: ThreadsHoloTicket,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="ticket" {...DefaultIconProps} />,
  },
  {
    name: 'Fluid Tab Interaction',
    route: 'FluidTabInteraction',
    component: FluidTabInteraction,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="blur" {...DefaultIconProps} />,
  },
  {
    name: 'Shake to Delete',
    route: 'ShakeToDelete',
    component: ShakeToDeleteAnimation,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="shaker" {...DefaultIconProps} />,
  },
  {
    name: 'Composable Text',
    route: 'ComposableText',
    component: ComposableTextScreen,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="text" {...DefaultIconProps} />,
  },
  {
    name: 'Card Shader Reflections',
    route: 'CardShaderReflections',
    component: CardShaderReflections,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="card" {...DefaultIconProps} />,
  },
  {
    name: 'Clock Time Picker',
    route: 'ClockTimePicker',
    component: ClockTimePicker,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="clock" {...DefaultIconProps} />,
  },
  {
    name: 'Sudoku',
    route: 'Sudoku',
    component: Sudoku,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="grid" {...DefaultIconProps} />,
  },
  {
    name: 'Particles Button',
    route: 'ParticlesButton',
    component: ParticlesButton,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="atom" {...DefaultIconProps} />,
  },
  {
    name: 'iOS Home Grid',
    route: 'iOSHomeGrid',
    component: iOSHomeGrid,
    backIconDark: false,
    icon: () => <MaterialCommunityIcons name="react" {...DefaultIconProps} />,
  },
]
  .map((item, index) => {
    return {
      ...item,
      id: index,
      component: withCustomBackIcon({
        Component: item.component,
        screenName: item.name,
        backIconDark: item.backIconDark,
        iconMarginTop: item.iconMarginTop,
        alert: item.alert,
      }),
    };
  })
  .reverse();
