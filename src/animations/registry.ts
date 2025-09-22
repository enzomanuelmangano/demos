export type IconFamily =
  | 'AntDesign'
  | 'Entypo'
  | 'Feather'
  | 'FontAwesome'
  | 'Ionicons'
  | 'MaterialCommunityIcons'
  | 'MaterialIcons'
  | 'Octicons';

export interface AnimationMetadataType extends Record<string, unknown> {
  name: string;
  route: string;
  iconName: string;
  iconFamily: IconFamily;
  alert?: boolean;
  iconColor?: string;
}

export interface IconMetadata {
  iconName: string;
  iconFamily: IconFamily;
}

import { ScrollTransition3D } from './3d-scroll-transition';
import { ActionTray } from './action-tray';
import { AddToCart } from './add-to-cart';
import { AirbnbFlipInteraction } from './airbnb-flip-interaction';
import { AirbnbSlider } from './airbnb-slider';
import { AlertDrawer } from './alert-drawer';
import { Animated3DParallax } from './animated-3d-parallax';
import { AnimatedClipBox } from './animated-clip-box';
import { AnimatedCountText } from './animated-count-text';
import { AnimatedGridList } from './animated-grid-list';
import { AnimatedIndicatorList } from './animated-indicator-list';
import { AtlasButton } from './atlas-button';
import { AudioPlayer } from './audioplayer';
import { BalanceSlider } from './balance-slider';
import { BezierCurveOutline } from './bezier-curve-outline';
import { BlurCircles } from './blur-circles';
import { BlurredBottomBar } from './blurred-bottom-bar';
import { BlurredScroll } from './blurred-scroll';
import { BottomBarSkia } from './bottom-bar-skia';
import { CardShaderReflections } from './card-shader-reflections';
import { CheckboxInteractions } from './checkbox-interactions';
import { CircularCarousel } from './circular-carousel';
import { ClerkToast } from './clerk-toast';
import { ClockTimePicker } from './clock-time-picker';
import { ColorCarousel } from './color-carousel';
import { ComposableTextScreen } from './composable-text';
import { CoverflowCarousel } from './coverflow-carousel';
import { CubertoSlider } from './cuberto-slider';
import { CustomDrawer } from './custom-drawer';
import { DeleteButton } from './delete-button';
import { DotSheet } from './dot-sheet';
import { DragToSort } from './drag-to-sort';
import { DraggablePanel } from './draggable-panel';
import { DurationSlider } from './duration-slider';
import { DynamicBlurTabs } from './dynamic-blur-tabs';
import { DynamicTabIndicatorContainer } from './dynamic-tab-indicator';
import { EmailDemo } from './email-demo';
import { EmptyQRCode } from './empty-qrcode';
import { EverybodyCanCook } from './everybody-can-cook';
import { ExclusionTabs } from './exclusion-tabs';
import { ExpandableMiniPlayer } from './expandable-mini-player';
import { FamilyNumberInput } from './family-number-input';
import { FibonacciShader } from './fibonacci-shader';
import { FibonacciShaderGrid } from './fibonacci-shader-grid';
import { FloatingBottomBar } from './floating-bottom-bar';
import { FloatingModal } from './floating-modal';
import { FluidSlider } from './fluid-slider';
import { FluidTabInteraction } from './fluid-tab-interaction';
import { FourierVisualizer } from './fourier-visualizer';
import { FractalGlass } from './fractal-glass';
import { GeometryButton } from './geometry-button';
import { GitHubContributions } from './github-contributions';
import { GitHubOnboarding } from './github-onboarding';
import { GLTransitions } from './gl-transitions';
import { GridVisualizer } from './grid-visualizer';
import { ImageCropper } from './image-cropper';
import { IMessageStack } from './imessage-stack';
import { InfiniteCarousel } from './infinite-carousel';
import { InteractionAppearance } from './interaction-appearance';
import { IosHomeBouncy } from './ios-home-bouncy';
import { iOSHomeGrid } from './ios-home-grid';
import { LinearTabInteraction } from './linear-tab-interaction';
import { LoadingButton } from './loading-button';
import { Metaball } from './metaball';
import { MilesBarChart } from './miles-bar-chart';
import { MobileInput } from './mobile-input';
import { MotionBlur } from './motion-blur';
import { OnlineOffline } from './online-offline';
import { PaperFolding } from './paper-folding';
import { ParticlesButton } from './particles-button';
import { PomodoroTimer } from './pomodoro-timer';
import { PopupHandler } from './popup-handler';
import { PrequelSlider } from './prequel-slider';
import { QRCodeGenerator } from './qrcode';
import { RadarChartContainer } from './radar-chart';
import { RecordButton } from './record-button';
import { ScrollProgress } from './scroll-progress';
import { ScrollableBottomSheet } from './scrollable-bottom-sheet';
import { SelectableGridList } from './selectable-grid-list';
import { ShakeToDeleteAnimation } from './shake-to-delete';
import { SharedTransitions } from './shared-transition';
import { SkiaBottomSheet } from './skia-bottom-sheet';
import { SkiaColorPicker } from './skia-color-picker';
import { SlideToReveal } from './slide-to-reveal';
import { SmoothDropdown } from './smooth-dropdown';
import { Snake } from './snake';
import { Spiral } from './spiral';
import { SplitButton } from './split-button';
import { StackedBottomSheet } from './stacked-bottom-sheet';
import { StackedCarousel } from './stacked-carousel';
import { StackedList } from './stacked-list';
import { StackedModals } from './stacked-modals';
import { StaggeredCardNumber } from './staggered-card-number';
import { SteddyGraphInteraction } from './steddy-graph-interaction';
import { Steps } from './steps';
import { StoryList } from './story-list';
import { Sudoku } from './sudoku';
import { SwipeCards } from './swipe-cards';
import { TabNavigation } from './tab-navigation';
import { TelegramThemeSwitch } from './telegram-theme-switch';
import { ThemeCanvasAnimation } from './theme-canvas-animation';
import { ThreadsHoloTicket } from './threads-holo-ticket/src';
import { TimeMachine } from './time-machine';
import { Toast } from './toast';
import { TwitterTabBar } from './twitter-tab-bar';
import { TwodosSlide } from './twodos-slide';
import { VerificationCode } from './verification-code';
import { VerificationCodeFace } from './verification-code-face';
import { WheelPicker } from './wheel-picker';

export const AnimationRegistry = {
  'mobile-input': MobileInput,
  'swipe-cards': SwipeCards,
  spiral: Spiral,
  'scroll-progress': ScrollProgress,
  'animated-grid-list': AnimatedGridList,
  'floating-bottom-bar': FloatingBottomBar,
  'animated-clip-box': AnimatedClipBox,
  'theme-canvas-animation': ThemeCanvasAnimation,
  'add-to-cart': AddToCart,
  'bottom-bar-skia': BottomBarSkia,
  'cuberto-slider': CubertoSlider,
  metaball: Metaball,
  'shared-transitions': SharedTransitions,
  'story-list': StoryList,
  'dynamic-tab-indicator': DynamicTabIndicatorContainer,
  'blur-circles': BlurCircles,
  'smooth-dropdown': SmoothDropdown,
  'skia-bottom-sheet': SkiaBottomSheet,
  'floating-modal': FloatingModal,
  'audio-player': AudioPlayer,
  'color-carousel': ColorCarousel,
  'animated-3d-parallax': Animated3DParallax,
  'fluid-slider': FluidSlider,
  'animated-indicator-list': AnimatedIndicatorList,
  'radar-chart': RadarChartContainer,
  'image-cropper': ImageCropper,
  'custom-drawer': CustomDrawer,
  'selectable-grid-list': SelectableGridList,
  'animated-count-text': AnimatedCountText,
  'qr-code-generator': QRCodeGenerator,
  'popup-handler': PopupHandler,
  'twitter-tab-bar': TwitterTabBar,
  'circular-carousel': CircularCarousel,
  'split-button': SplitButton,
  'telegram-theme-switch': TelegramThemeSwitch,
  'fourier-visualizer': FourierVisualizer,
  'github-onboarding': GitHubOnboarding,
  'loading-button': LoadingButton,
  'scrollable-bottom-sheet': ScrollableBottomSheet,
  'skia-color-picker': SkiaColorPicker,
  'blurred-scroll': BlurredScroll,
  'airbnb-slider': AirbnbSlider,
  'steddy-graph-interaction': SteddyGraphInteraction,
  'action-tray': ActionTray,
  toast: Toast,
  'slide-to-reveal': SlideToReveal,
  'blurred-bottom-bar': BlurredBottomBar,
  'fractal-glass': FractalGlass,
  'drag-to-sort': DragToSort,
  'fibonacci-shader': FibonacciShader,
  'family-number-input': FamilyNumberInput,
  'balance-slider': BalanceSlider,
  'fibonacci-shader-grid': FibonacciShaderGrid,
  'verification-code': VerificationCode,
  'email-demo': EmailDemo,
  'scroll-transition-3d': ScrollTransition3D,
  'staggered-card-number': StaggeredCardNumber,
  'stacked-bottom-sheet': StackedBottomSheet,
  'gl-transitions': GLTransitions,
  'prequel-slider': PrequelSlider,
  'empty-qr-code': EmptyQRCode,
  'infinite-carousel': InfiniteCarousel,
  'twodos-slide': TwodosSlide,
  'wheel-picker': WheelPicker,
  'stacked-list': StackedList,
  'geometry-button': GeometryButton,
  'record-button': RecordButton,
  'grid-visualizer': GridVisualizer,
  'imessage-stack': IMessageStack,
  'atlas-button': AtlasButton,
  'checkbox-interactions': CheckboxInteractions,
  'interaction-appearance': InteractionAppearance,
  'dot-sheet': DotSheet,
  'coverflow-carousel': CoverflowCarousel,
  'paper-folding': PaperFolding,
  'miles-bar-chart': MilesBarChart,
  steps: Steps,
  'pomodoro-timer': PomodoroTimer,
  'exclusion-tabs': ExclusionTabs,
  'clerk-toast': ClerkToast,
  'duration-slider': DurationSlider,
  'alert-drawer': AlertDrawer,
  'motion-blur': MotionBlur,
  'linear-tab-interaction': LinearTabInteraction,
  'delete-button': DeleteButton,
  'dynamic-blur-tabs': DynamicBlurTabs,
  snake: Snake,
  'expandable-mini-player': ExpandableMiniPlayer,
  'bezier-curve-outline': BezierCurveOutline,
  'tab-navigation': TabNavigation,
  'stacked-modals': StackedModals,
  'verification-code-face': VerificationCodeFace,
  'everybody-can-cook': EverybodyCanCook,
  'threads-holo-ticket': ThreadsHoloTicket,
  'fluid-tab-interaction': FluidTabInteraction,
  'shake-to-delete': ShakeToDeleteAnimation,
  'composable-text': ComposableTextScreen,
  'card-shader-reflections': CardShaderReflections,
  'clock-time-picker': ClockTimePicker,
  sudoku: Sudoku,
  'particles-button': ParticlesButton,
  'ios-home-grid': iOSHomeGrid,
  'time-machine': TimeMachine,
  'ios-home-bouncy': IosHomeBouncy,
  'online-offline': OnlineOffline,
  'draggable-panel': DraggablePanel,
  'github-contributions': GitHubContributions,
  'stacked-carousel': StackedCarousel,
  'airbnb-flip-interaction': AirbnbFlipInteraction,
} as const;

export const AnimationMetadata: Record<string, AnimationMetadataType> = {
  'mobile-input': {
    name: 'Mobile Input',
    route: 'MobileInput',
    iconName: 'smile',
    iconFamily: 'AntDesign',
  },
  'swipe-cards': {
    name: 'Swipe Cards',
    route: 'SwipeCards',
    iconName: 'cards',
    iconFamily: 'MaterialCommunityIcons',
  },
  spiral: {
    name: 'Spiral',
    route: 'Spiral',
    iconName: 'math-compass',
    iconFamily: 'MaterialCommunityIcons',
  },
  'scroll-progress': {
    name: 'Scroll Progress',
    route: 'ScrollProgress',
    iconName: 'percent',
    iconFamily: 'Feather',
  },
  'animated-grid-list': {
    name: 'Animated Grid List',
    route: 'AnimatedGridList',
    iconName: 'grid',
    iconFamily: 'Feather',
  },
  'floating-bottom-bar': {
    name: 'Floating Bottom Bar',
    route: 'FloatingBottomBar',
    iconName: 'highlight',
    iconFamily: 'MaterialIcons',
  },
  'animated-clip-box': {
    name: 'Animated Clip Box',
    route: 'AnimatedClipBox',
    iconName: 'crop-square',
    iconFamily: 'MaterialIcons',
  },
  'theme-canvas-animation': {
    name: 'Theme Canvas Animation',
    route: 'ThemeCanvasAnimation',
    iconName: 'color-lens',
    iconFamily: 'MaterialIcons',
  },
  'add-to-cart': {
    name: 'Add to Cart',
    route: 'AddToCart',
    iconName: 'add-shopping-cart',
    iconFamily: 'MaterialIcons',
  },
  'bottom-bar-skia': {
    name: 'BottomBarSkia',
    route: 'BottomBarSkia',
    iconName: 'tablet',
    iconFamily: 'Feather',
  },
  'cuberto-slider': {
    name: 'Cuberto Slider',
    route: 'CubertoSlider',
    iconName: 'balloon',
    iconFamily: 'MaterialCommunityIcons',
  },
  metaball: {
    name: 'Metaball',
    route: 'Metaball',
    iconName: 'tennisball',
    iconFamily: 'Ionicons',
  },
  'shared-transitions': {
    name: 'Shared Transitions',
    route: 'SharedTransitions',
    alert: true,
    iconName: 'sync',
    iconFamily: 'MaterialIcons',
    iconColor: 'yellow',
  },
  'story-list': {
    name: 'Story List',
    route: 'StoryList',
    iconName: 'book-open',
    iconFamily: 'MaterialCommunityIcons',
  },
  'dynamic-tab-indicator': {
    name: 'Dynamic Tab Indicator',
    route: 'DynamicTabIndicator',
    iconName: 'tab',
    iconFamily: 'MaterialIcons',
  },
  'blur-circles': {
    name: 'Blur Circles',
    route: 'BlurCircles',
    iconName: 'blur-on',
    iconFamily: 'MaterialIcons',
  },
  'smooth-dropdown': {
    name: 'Smooth Dropdown',
    route: 'SmoothDropdown',
    iconName: 'arrow-drop-down',
    iconFamily: 'MaterialIcons',
  },
  'skia-bottom-sheet': {
    name: 'Skia BottomSheet',
    route: 'SkiaBottomSheet',
    iconName: 'card',
    iconFamily: 'MaterialCommunityIcons',
  },
  'floating-modal': {
    name: 'Floating Modal',
    route: 'FloatingModal',
    iconName: 'popup',
    iconFamily: 'Entypo',
  },
  'audio-player': {
    name: 'AudioPlayer',
    route: 'AudioPlayer',
    iconName: 'barcode',
    iconFamily: 'Ionicons',
  },
  'color-carousel': {
    name: 'Color Carousel',
    route: 'ColorCarousel',
    iconName: 'palette',
    iconFamily: 'MaterialCommunityIcons',
  },
  'animated-3d-parallax': {
    name: 'Animated 3D Parallax',
    route: 'Animated3DParallax',
    iconName: 'twitter',
    iconFamily: 'MaterialCommunityIcons',
  },
  'fluid-slider': {
    name: 'Fluid Slider',
    route: 'FluidSlider',
    iconName: 'water',
    iconFamily: 'MaterialCommunityIcons',
  },
  'animated-indicator-list': {
    name: 'Animated Indicator List',
    route: 'AnimatedIndicatorList',
    iconName: 'format-list-bulleted',
    iconFamily: 'MaterialCommunityIcons',
  },
  'radar-chart': {
    name: 'Radar Chart',
    route: 'RadarChart',
    iconName: 'radar',
    iconFamily: 'MaterialCommunityIcons',
  },
  'image-cropper': {
    name: 'Image Cropper',
    route: 'ImageCropper',
    iconName: 'crop',
    iconFamily: 'MaterialCommunityIcons',
  },
  'custom-drawer': {
    name: 'Custom Drawer',
    route: 'CustomDrawer',
    iconName: 'menu',
    iconFamily: 'MaterialCommunityIcons',
  },
  'selectable-grid-list': {
    name: 'Selectable Grid List',
    route: 'SelectableGridList',
    iconName: 'select-all',
    iconFamily: 'MaterialCommunityIcons',
  },
  'animated-count-text': {
    name: 'Animated Count Text',
    route: 'AnimatedCountText',
    iconName: 'counter',
    iconFamily: 'MaterialCommunityIcons',
  },
  'qr-code-generator': {
    name: 'QR Code Generator',
    route: 'QRCodeGenerator',
    iconName: 'qrcode',
    iconFamily: 'MaterialCommunityIcons',
  },
  'popup-handler': {
    name: 'Popup Handler',
    route: 'PopupHandler',
    iconName: 'blur-radial',
    iconFamily: 'MaterialCommunityIcons',
  },
  'twitter-tab-bar': {
    name: 'Twitter Tab Bar',
    route: 'TwitterTabBar',
    iconName: 'twitter',
    iconFamily: 'MaterialCommunityIcons',
  },
  'circular-carousel': {
    name: 'Circular Carousel',
    route: 'CircularCarousel',
    iconName: 'circle',
    iconFamily: 'MaterialCommunityIcons',
  },
  'split-button': {
    name: 'Split Button',
    route: 'SplitButton',
    iconName: 'call-split',
    iconFamily: 'MaterialCommunityIcons',
  },
  'telegram-theme-switch': {
    name: 'Telegram Theme Switch',
    route: 'TelegramThemeSwitch',
    iconName: 'telegram',
    iconFamily: 'FontAwesome',
  },
  'fourier-visualizer': {
    name: 'Fourier Visualizer',
    route: 'FourierVisualizer',
    iconName: 'paintbrush',
    iconFamily: 'Octicons',
  },
  'github-onboarding': {
    name: 'GitHub Onboarding',
    route: 'GitHubOnboarding',
    iconName: 'mark-github',
    iconFamily: 'Octicons',
  },
  'loading-button': {
    name: 'Loading Button',
    route: 'LoadingButton',
    iconName: 'loading',
    iconFamily: 'AntDesign',
  },
  'scrollable-bottom-sheet': {
    name: 'Scrollable Bottom Sheet',
    route: 'ScrollableBottomSheet',
    iconName: 'arrow-up',
    iconFamily: 'MaterialCommunityIcons',
  },
  'skia-color-picker': {
    name: 'Skia Color Picker',
    route: 'SkiaColorPicker',
    iconName: 'palette',
    iconFamily: 'MaterialCommunityIcons',
  },
  'blurred-scroll': {
    name: 'Blurred Scroll',
    route: 'BlurredScroll',
    iconName: 'blur',
    iconFamily: 'MaterialCommunityIcons',
  },
  'airbnb-slider': {
    name: 'AirBnb Slider',
    route: 'AirBnbSlider',
    iconName: 'counter',
    iconFamily: 'MaterialCommunityIcons',
  },
  'steddy-graph-interaction': {
    name: 'Steddy Graph Interaction',
    route: 'SteddyGraphInteraction',
    iconName: 'chart-line',
    iconFamily: 'MaterialCommunityIcons',
  },
  'action-tray': {
    name: 'Action Tray',
    route: 'ActionTray',
    iconName: 'card',
    iconFamily: 'MaterialCommunityIcons',
  },
  toast: {
    name: 'Toast',
    route: 'Toast',
    iconName: 'message',
    iconFamily: 'MaterialCommunityIcons',
  },
  'slide-to-reveal': {
    name: 'Slide to Reveal',
    route: 'SlideToReveal',
    iconName: 'number',
    iconFamily: 'Octicons',
  },
  'blurred-bottom-bar': {
    name: 'Blurred Bottom Bar',
    route: 'BlurredBottomBar',
    iconName: 'blur-linear',
    iconFamily: 'MaterialCommunityIcons',
  },
  'fractal-glass': {
    name: 'Fractal Glass',
    route: 'FractalGlass',
    iconName: 'mirror',
    iconFamily: 'MaterialCommunityIcons',
  },
  'drag-to-sort': {
    name: 'Drag to Sort',
    route: 'DragToSort',
    iconName: 'sort',
    iconFamily: 'MaterialCommunityIcons',
  },
  'fibonacci-shader': {
    name: 'Fibonacci Shader',
    route: 'FibonacciShader',
    iconName: 'sphere',
    iconFamily: 'MaterialCommunityIcons',
  },
  'family-number-input': {
    name: 'Family Number Input',
    route: 'FamilyNumberInput',
    iconName: 'dots-grid',
    iconFamily: 'MaterialCommunityIcons',
  },
  'balance-slider': {
    name: 'Balance Slider',
    route: 'BalanceSlider',
    iconName: 'scale-balance',
    iconFamily: 'MaterialCommunityIcons',
  },
  'fibonacci-shader-grid': {
    name: 'Fibonacci Shader Grid',
    route: 'FibonacciShaderGrid',
    iconName: 'grid-large',
    iconFamily: 'MaterialCommunityIcons',
  },
  'verification-code': {
    name: 'Verification Code',
    route: 'VerificationCode',
    iconName: 'security',
    iconFamily: 'MaterialCommunityIcons',
  },
  'email-demo': {
    name: 'Email Demo',
    route: 'EmailDemo',
    iconName: 'delete',
    iconFamily: 'MaterialCommunityIcons',
  },
  'scroll-transition-3d': {
    name: '3D Scroll Transition',
    route: 'ScrollTransition3D',
    iconName: 'rotate-3d',
    iconFamily: 'MaterialCommunityIcons',
  },
  'staggered-card-number': {
    name: 'Staggered Card Number',
    route: 'StaggeredCardNumber',
    iconName: 'credit-card-outline',
    iconFamily: 'MaterialCommunityIcons',
  },
  'stacked-bottom-sheet': {
    name: 'Stacked Bottom Sheet',
    route: 'StackedBottomSheet',
    iconName: 'card',
    iconFamily: 'MaterialCommunityIcons',
  },
  'gl-transitions': {
    name: 'GL Transitions',
    route: 'GLTransitions',
    iconName: 'transition-masked',
    iconFamily: 'MaterialCommunityIcons',
  },
  'prequel-slider': {
    name: 'Prequel Slider',
    route: 'PrequelSlider',
    iconName: 'picture-in-picture-bottom-right',
    iconFamily: 'MaterialCommunityIcons',
  },
  'empty-qr-code': {
    name: 'Empty QR Code',
    route: 'EmptyQRCode',
    iconName: 'qrcode',
    iconFamily: 'MaterialCommunityIcons',
  },
  'infinite-carousel': {
    name: 'Infinite Carousel',
    route: 'InfiniteCarousel',
    iconName: 'view-carousel-outline',
    iconFamily: 'MaterialCommunityIcons',
  },
  'twodos-slide': {
    name: 'Twodos Slide',
    route: 'TwodosSlide',
    iconName: 'pan-right',
    iconFamily: 'MaterialCommunityIcons',
  },
  'wheel-picker': {
    name: 'Wheel Picker',
    route: 'WheelPicker',
    iconName: 'ship-wheel',
    iconFamily: 'MaterialCommunityIcons',
  },
  'stacked-list': {
    name: 'Stacked List',
    route: 'StackedList',
    iconName: 'notification-clear-all',
    iconFamily: 'MaterialCommunityIcons',
  },
  'geometry-button': {
    name: 'Geometry Button',
    route: 'GeometryButton',
    iconName: 'sphere',
    iconFamily: 'MaterialCommunityIcons',
  },
  'record-button': {
    name: 'Record Button',
    route: 'RecordButton',
    iconName: 'record',
    iconFamily: 'MaterialCommunityIcons',
  },
  'grid-visualizer': {
    name: 'Grid Visualizer',
    route: 'GridVisualizer',
    alert: true,
    iconName: 'grid',
    iconFamily: 'MaterialCommunityIcons',
  },
  'imessage-stack': {
    name: 'iMessageStack',
    route: 'IMessageStack',
    iconName: 'gesture-swipe',
    iconFamily: 'MaterialCommunityIcons',
  },
  'atlas-button': {
    name: 'Atlas Button',
    route: 'AtlasButton',
    iconName: 'react',
    iconFamily: 'MaterialCommunityIcons',
  },
  'checkbox-interactions': {
    name: 'Checkbox Interactions',
    route: 'CheckboxInteractions',
    iconName: 'checkbox-outline',
    iconFamily: 'MaterialCommunityIcons',
  },
  'interaction-appearance': {
    name: 'Interaction Appearance',
    route: 'InteractionAppearance',
    iconName: 'theme-light-dark',
    iconFamily: 'MaterialCommunityIcons',
  },
  'dot-sheet': {
    name: 'Dot Sheet',
    route: 'DotSheet',
    iconName: 'paperclip',
    iconFamily: 'MaterialCommunityIcons',
  },
  'coverflow-carousel': {
    name: 'Coverflow Carousel',
    route: 'CoverflowCarousel',
    iconName: 'view-carousel',
    iconFamily: 'MaterialCommunityIcons',
  },
  'paper-folding': {
    name: 'Paper Folding',
    route: 'PaperFolding',
    iconName: 'paper-roll',
    iconFamily: 'MaterialCommunityIcons',
  },
  'miles-bar-chart': {
    name: 'Miles Bar Chart',
    route: 'MilesBarChart',
    iconName: 'chart-bar',
    iconFamily: 'MaterialCommunityIcons',
  },
  steps: {
    name: 'Steps',
    route: 'Steps',
    iconName: 'step-forward',
    iconFamily: 'MaterialCommunityIcons',
  },
  'pomodoro-timer': {
    name: 'Pomodoro Timer',
    route: 'PomodoroTimer',
    iconName: 'timer-outline',
    iconFamily: 'MaterialCommunityIcons',
  },
  'exclusion-tabs': {
    name: 'Exclusion Tabs',
    route: 'ExclusionTabs',
    iconName: 'tab',
    iconFamily: 'MaterialCommunityIcons',
  },
  'clerk-toast': {
    name: 'Clerk Toast',
    route: 'ClerkToast',
    iconName: 'toaster',
    iconFamily: 'MaterialCommunityIcons',
  },
  'duration-slider': {
    name: 'Duration Slider',
    route: 'DurationSlider',
    iconName: 'timer',
    iconFamily: 'MaterialCommunityIcons',
  },
  'alert-drawer': {
    name: 'Alert Drawer',
    route: 'AlertDrawer',
    iconName: 'alert',
    iconFamily: 'MaterialCommunityIcons',
  },
  'motion-blur': {
    name: 'Motion Blur',
    route: 'MotionBlur',
    iconName: 'blur',
    iconFamily: 'MaterialCommunityIcons',
  },
  'linear-tab-interaction': {
    name: 'Linear Tab Interaction',
    route: 'LinearTabInteraction',
    iconName: 'tab',
    iconFamily: 'MaterialCommunityIcons',
  },
  'delete-button': {
    name: 'Delete Button',
    route: 'DeleteButton',
    iconName: 'delete',
    iconFamily: 'MaterialCommunityIcons',
  },
  'dynamic-blur-tabs': {
    name: 'Dynamic Blur Tabs',
    route: 'DynamicBlurTabs',
    iconName: 'blur',
    iconFamily: 'MaterialCommunityIcons',
  },
  snake: {
    name: 'Snake',
    route: 'Snake',
    iconName: 'snake',
    iconFamily: 'MaterialCommunityIcons',
  },
  'expandable-mini-player': {
    name: 'Expandable Mini Player',
    route: 'ExpandableMiniPlayer',
    iconName: 'music',
    iconFamily: 'MaterialCommunityIcons',
  },
  'bezier-curve-outline': {
    name: 'Bezier Curve Outline',
    route: 'BezierCurveOutline',
    iconName: 'vector-bezier',
    iconFamily: 'MaterialCommunityIcons',
  },
  'tab-navigation': {
    name: 'Tab Navigation',
    route: 'TabNavigation',
    iconName: 'tab',
    iconFamily: 'MaterialCommunityIcons',
  },
  'stacked-modals': {
    name: 'Stacked Modals',
    route: 'StackedModals',
    iconName: 'card',
    iconFamily: 'MaterialCommunityIcons',
  },
  'verification-code-face': {
    name: 'Verification Code Face',
    route: 'VerificationCodeFace',
    iconName: 'baby-face',
    iconFamily: 'MaterialCommunityIcons',
  },
  'everybody-can-cook': {
    name: 'Everybody Can Cook',
    route: 'EverybodyCanCook',
    iconName: 'food',
    iconFamily: 'MaterialCommunityIcons',
  },
  'threads-holo-ticket': {
    name: 'Threads Holo Ticket',
    route: 'ThreadsHoloTicket',
    iconName: 'ticket',
    iconFamily: 'MaterialCommunityIcons',
  },
  'fluid-tab-interaction': {
    name: 'Fluid Tab Interaction',
    route: 'FluidTabInteraction',
    iconName: 'blur',
    iconFamily: 'MaterialCommunityIcons',
  },
  'shake-to-delete': {
    name: 'Shake to Delete',
    route: 'ShakeToDelete',
    iconName: 'shaker',
    iconFamily: 'MaterialCommunityIcons',
  },
  'composable-text': {
    name: 'Composable Text',
    route: 'ComposableText',
    iconName: 'text',
    iconFamily: 'MaterialCommunityIcons',
  },
  'card-shader-reflections': {
    name: 'Card Shader Reflections',
    route: 'CardShaderReflections',
    iconName: 'card',
    iconFamily: 'MaterialCommunityIcons',
  },
  'clock-time-picker': {
    name: 'Clock Time Picker',
    route: 'ClockTimePicker',
    iconName: 'clock',
    iconFamily: 'MaterialCommunityIcons',
  },
  sudoku: {
    name: 'Sudoku',
    route: 'Sudoku',
    iconName: 'grid',
    iconFamily: 'MaterialCommunityIcons',
  },
  'particles-button': {
    name: 'Particles Button',
    route: 'ParticlesButton',
    iconName: 'atom',
    iconFamily: 'MaterialCommunityIcons',
  },
  'ios-home-grid': {
    name: 'iOS Home Grid',
    route: 'iOSHomeGrid',
    iconName: 'grid-large',
    iconFamily: 'MaterialCommunityIcons',
  },
  'time-machine': {
    name: 'Time Machine',
    route: 'TimeMachine',
    iconName: 'timelapse',
    iconFamily: 'MaterialCommunityIcons',
  },
  'ios-home-bouncy': {
    name: 'iOS Home Bouncy',
    route: 'IosHomeBouncy',
    iconName: 'home',
    iconFamily: 'MaterialCommunityIcons',
  },
  'online-offline': {
    name: 'Online Offline',
    route: 'OnlineOffline',
    iconName: 'network',
    iconFamily: 'MaterialCommunityIcons',
  },
  'draggable-panel': {
    name: 'Draggable Panel',
    route: 'DraggablePanel',
    iconName: 'pan-top-left',
    iconFamily: 'MaterialCommunityIcons',
  },
  'github-contributions': {
    name: 'GitHub Contributions',
    route: 'GitHubContributions',
    iconName: 'mark-github',
    iconFamily: 'Octicons',
  },
  'stacked-carousel': {
    name: 'Stacked Carousel',
    route: 'StackedCarousel',
    iconName: 'view-carousel',
    iconFamily: 'MaterialCommunityIcons',
  },
  'airbnb-flip-interaction': {
    name: 'Airbnb Flip Interaction',
    route: 'AirbnbFlipInteraction',
    iconName: 'account',
    iconFamily: 'MaterialCommunityIcons',
  },
} as const;

export type AnimationSlug = keyof typeof AnimationRegistry;
export type AnimationComponent = (typeof AnimationRegistry)[AnimationSlug];
export type AnimationMeta = (typeof AnimationMetadata)[AnimationSlug];

export const getAnimationComponent = (
  slug: string,
): AnimationComponent | undefined => {
  return AnimationRegistry[slug as AnimationSlug];
};

export const getAnimationMetadata = (
  slug: string,
): AnimationMeta | undefined => {
  return AnimationMetadata[slug as AnimationSlug];
};

export const getAllAnimations = () => {
  return Object.keys(AnimationRegistry).map(slug => ({
    slug,
    component: AnimationRegistry[slug as AnimationSlug],
    metadata: AnimationMetadata[slug as AnimationSlug],
  }));
};
