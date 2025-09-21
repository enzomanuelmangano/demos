// Animation component imports

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

// Registry of all animation components
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

// Metadata for each animation (icons are defined as functions to avoid JSX parsing issues)
export const AnimationMetadata = {
  'mobile-input': {
    name: 'Mobile Input',
    route: 'MobileInput',
    backIconDark: false,
    iconName: 'smile' as const,
    iconFamily: 'AntDesign' as const,
  },
  'swipe-cards': {
    name: 'Swipe Cards',
    route: 'SwipeCards',
    backIconDark: false,
    iconName: 'cards' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  spiral: {
    name: 'Spiral',
    route: 'Spiral',
    backIconDark: false,
    iconName: 'math-compass' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'scroll-progress': {
    name: 'Scroll Progress',
    route: 'ScrollProgress',
    backIconDark: false,
    iconName: 'percent' as const,
    iconFamily: 'Feather' as const,
  },
  'animated-grid-list': {
    name: 'Animated Grid List',
    route: 'AnimatedGridList',
    backIconDark: false,
    iconName: 'grid' as const,
    iconFamily: 'Feather' as const,
  },
  'floating-bottom-bar': {
    name: 'Floating Bottom Bar',
    route: 'FloatingBottomBar',
    iconName: 'highlight' as const,
    iconFamily: 'MaterialIcons' as const,
  },
  'animated-clip-box': {
    name: 'Animated Clip Box',
    route: 'AnimatedClipBox',
    iconName: 'crop-square' as const,
    iconFamily: 'MaterialIcons' as const,
  },
  'theme-canvas-animation': {
    name: 'Theme Canvas Animation',
    route: 'ThemeCanvasAnimation',
    iconName: 'color-lens' as const,
    iconFamily: 'MaterialIcons' as const,
  },
  'add-to-cart': {
    name: 'Add to Cart',
    route: 'AddToCart',
    iconName: 'add-shopping-cart' as const,
    iconFamily: 'MaterialIcons' as const,
  },
  'bottom-bar-skia': {
    name: 'BottomBarSkia',
    route: 'BottomBarSkia',
    iconName: 'tablet' as const,
    iconFamily: 'Feather' as const,
  },
  'cuberto-slider': {
    name: 'Cuberto Slider',
    route: 'CubertoSlider',
    iconName: 'balloon' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  metaball: {
    name: 'Metaball',
    route: 'Metaball',
    backIconDark: false,
    iconName: 'tennisball' as const,
    iconFamily: 'Ionicons' as const,
  },
  'shared-transitions': {
    name: 'Shared Transitions',
    route: 'SharedTransitions',
    alert: true,
    iconName: 'sync' as const,
    iconFamily: 'MaterialIcons' as const,
    iconColor: 'yellow' as const,
  },
  'story-list': {
    name: 'Story List',
    route: 'StoryList',
    backIconDark: false,
    iconName: 'book-open' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'dynamic-tab-indicator': {
    name: 'Dynamic Tab Indicator',
    route: 'DynamicTabIndicator',
    iconMarginTop: 50,
    backIconDark: false,
    iconName: 'tab' as const,
    iconFamily: 'MaterialIcons' as const,
  },
  'blur-circles': {
    name: 'Blur Circles',
    route: 'BlurCircles',
    iconName: 'blur-on' as const,
    iconFamily: 'MaterialIcons' as const,
  },
  'smooth-dropdown': {
    name: 'Smooth Dropdown',
    route: 'SmoothDropdown',
    backIconDark: false,
    iconName: 'arrow-drop-down' as const,
    iconFamily: 'MaterialIcons' as const,
  },
  'skia-bottom-sheet': {
    name: 'Skia BottomSheet',
    route: 'SkiaBottomSheet',
    iconName: 'card' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'floating-modal': {
    name: 'Floating Modal',
    route: 'FloatingModal',
    iconName: 'popup' as const,
    iconFamily: 'Entypo' as const,
  },
  'audio-player': {
    name: 'AudioPlayer',
    route: 'AudioPlayer',
    backIconDark: false,
    iconName: 'barcode' as const,
    iconFamily: 'Ionicons' as const,
  },
  'color-carousel': {
    name: 'Color Carousel',
    route: 'ColorCarousel',
    backIconDark: false,
    iconName: 'palette' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'animated-3d-parallax': {
    name: 'Animated 3D Parallax',
    route: 'Animated3DParallax',
    backIconDark: false,
    iconName: 'twitter' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'fluid-slider': {
    name: 'Fluid Slider',
    route: 'FluidSlider',
    iconName: 'water' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'animated-indicator-list': {
    name: 'Animated Indicator List',
    route: 'AnimatedIndicatorList',
    iconMarginTop: 40,
    iconName: 'format-list-bulleted' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'radar-chart': {
    name: 'Radar Chart',
    route: 'RadarChart',
    backIconDark: false,
    iconName: 'radar' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'image-cropper': {
    name: 'Image Cropper',
    route: 'ImageCropper',
    backIconDark: false,
    iconMarginTop: 40,
    iconName: 'crop' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'custom-drawer': {
    name: 'Custom Drawer',
    route: 'CustomDrawer',
    iconMarginTop: 30,
    iconName: 'menu' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
    alert: true,
  },
  'selectable-grid-list': {
    name: 'Selectable Grid List',
    route: 'SelectableGridList',
    backIconDark: false,
    iconName: 'select-all' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'animated-count-text': {
    name: 'Animated Count Text',
    route: 'AnimatedCountText',
    backIconDark: false,
    iconName: 'counter' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'qr-code-generator': {
    name: 'QR Code Generator',
    route: 'QRCodeGenerator',
    backIconDark: false,
    iconName: 'qrcode' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'popup-handler': {
    name: 'Popup Handler',
    route: 'PopupHandler',
    iconName: 'blur-radial' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'twitter-tab-bar': {
    name: 'Twitter Tab Bar',
    route: 'TwitterTabBar',
    backIconDark: false,
    iconName: 'twitter' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
    alert: true,
  },
  'circular-carousel': {
    name: 'Circular Carousel',
    route: 'CircularCarousel',
    iconName: 'circle' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'split-button': {
    name: 'Split Button',
    route: 'SplitButton',
    iconName: 'call-split' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'telegram-theme-switch': {
    name: 'Telegram Theme Switch',
    route: 'TelegramThemeSwitch',
    backIconDark: false,
    alert: true,
    iconName: 'telegram' as const,
    iconFamily: 'FontAwesome' as const,
    iconColor: 'yellow' as const,
  },
  'fourier-visualizer': {
    name: 'Fourier Visualizer',
    route: 'FourierVisualizer',
    iconName: 'paintbrush' as const,
    iconFamily: 'Octicons' as const,
  },
  'github-onboarding': {
    name: 'GitHub Onboarding',
    route: 'GitHubOnboarding',
    backIconDark: false,
    iconName: 'mark-github' as const,
    iconFamily: 'Octicons' as const,
  },
  'loading-button': {
    name: 'Loading Button',
    route: 'LoadingButton',
    iconName: 'loading' as const,
    iconFamily: 'AntDesign' as const,
  },
  'scrollable-bottom-sheet': {
    name: 'Scrollable Bottom Sheet',
    route: 'ScrollableBottomSheet',
    backIconDark: false,
    iconName: 'arrow-up' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'skia-color-picker': {
    name: 'Skia Color Picker',
    route: 'SkiaColorPicker',
    backIconDark: false,
    iconName: 'palette' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'blurred-scroll': {
    name: 'Blurred Scroll',
    route: 'BlurredScroll',
    backIconDark: false,
    iconName: 'blur' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'airbnb-slider': {
    name: 'AirBnb Slider',
    route: 'AirBnbSlider',
    iconName: 'counter' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'steddy-graph-interaction': {
    name: 'Steddy Graph Interaction',
    route: 'SteddyGraphInteraction',
    iconName: 'chart-line' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'action-tray': {
    name: 'Action Tray',
    route: 'ActionTray',
    iconName: 'card' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
    alert: true,
  },
  toast: {
    name: 'Toast',
    route: 'Toast',
    iconName: 'message' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'slide-to-reveal': {
    name: 'Slide to Reveal',
    route: 'SlideToReveal',
    backIconDark: false,
    iconName: 'number' as const,
    iconFamily: 'Octicons' as const,
  },
  'blurred-bottom-bar': {
    name: 'Blurred Bottom Bar',
    route: 'BlurredBottomBar',
    backIconDark: false,
    iconName: 'blur-linear' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'fractal-glass': {
    name: 'Fractal Glass',
    route: 'FractalGlass',
    iconName: 'mirror' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'drag-to-sort': {
    name: 'Drag to Sort',
    route: 'DragToSort',
    iconName: 'sort' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'fibonacci-shader': {
    name: 'Fibonacci Shader',
    route: 'FibonacciShader',
    backIconDark: false,
    iconName: 'sphere' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'family-number-input': {
    name: 'Family Number Input',
    route: 'FamilyNumberInput',
    backIconDark: false,
    iconName: 'dots-grid' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
    alert: true,
  },
  'balance-slider': {
    name: 'Balance Slider',
    route: 'BalanceSlider',
    backIconDark: false,
    iconName: 'scale-balance' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'fibonacci-shader-grid': {
    name: 'Fibonacci Shader Grid',
    route: 'FibonacciShaderGrid',
    backIconDark: false,
    iconName: 'grid-large' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'verification-code': {
    name: 'Verification Code',
    route: 'VerificationCode',
    backIconDark: false,
    iconName: 'security' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
    alert: true,
  },
  'email-demo': {
    name: 'Email Demo',
    route: 'EmailDemo',
    backIconDark: false,
    iconName: 'delete' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'scroll-transition-3d': {
    name: '3D Scroll Transition',
    route: 'ScrollTransition3D',
    backIconDark: false,
    iconName: 'rotate-3d' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'staggered-card-number': {
    name: 'Staggered Card Number',
    route: 'StaggeredCardNumber',
    iconName: 'credit-card-outline' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'stacked-bottom-sheet': {
    name: 'Stacked Bottom Sheet',
    route: 'StackedBottomSheet',
    iconName: 'card' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'gl-transitions': {
    name: 'GL Transitions',
    route: 'GLTransitions',
    iconMarginTop: 100,
    iconName: 'transition-masked' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'prequel-slider': {
    name: 'Prequel Slider',
    route: 'PrequelSlider',
    backIconDark: false,
    iconName: 'picture-in-picture-bottom-right' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'empty-qr-code': {
    name: 'Empty QR Code',
    route: 'EmptyQRCode',
    backIconDark: true,
    iconName: 'qrcode' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'infinite-carousel': {
    name: 'Infinite Carousel',
    route: 'InfiniteCarousel',
    backIconDark: true,
    iconName: 'view-carousel-outline' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'twodos-slide': {
    name: 'Twodos Slide',
    route: 'TwodosSlide',
    backIconDark: true,
    iconName: 'pan-right' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'wheel-picker': {
    name: 'Wheel Picker',
    route: 'WheelPicker',
    backIconDark: true,
    iconName: 'ship-wheel' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'stacked-list': {
    name: 'Stacked List',
    route: 'StackedList',
    backIconDark: true,
    iconName: 'notification-clear-all' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'geometry-button': {
    name: 'Geometry Button',
    route: 'GeometryButton',
    backIconDark: false,
    iconName: 'sphere' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'record-button': {
    name: 'Record Button',
    route: 'RecordButton',
    backIconDark: false,
    iconName: 'record' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'grid-visualizer': {
    name: 'Grid Visualizer',
    route: 'GridVisualizer',
    backIconDark: false,
    alert: true,
    iconName: 'grid' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
    iconColor: 'yellow' as const,
  },
  'imessage-stack': {
    name: 'iMessageStack',
    route: 'IMessageStack',
    backIconDark: false,
    iconName: 'gesture-swipe' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'atlas-button': {
    name: 'Atlas Button',
    route: 'AtlasButton',
    backIconDark: false,
    iconName: 'react' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'checkbox-interactions': {
    name: 'Checkbox Interactions',
    route: 'CheckboxInteractions',
    backIconDark: false,
    iconName: 'checkbox-outline' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'interaction-appearance': {
    name: 'Interaction Appearance',
    route: 'InteractionAppearance',
    backIconDark: false,
    iconName: 'theme-light-dark' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'dot-sheet': {
    name: 'Dot Sheet',
    route: 'DotSheet',
    backIconDark: false,
    iconName: 'paperclip' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'coverflow-carousel': {
    name: 'Coverflow Carousel',
    route: 'CoverflowCarousel',
    backIconDark: true,
    iconName: 'view-carousel' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'paper-folding': {
    name: 'Paper Folding',
    route: 'PaperFolding',
    backIconDark: true,
    iconName: 'paper-roll' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'miles-bar-chart': {
    name: 'Miles Bar Chart',
    route: 'MilesBarChart',
    backIconDark: false,
    iconName: 'chart-bar' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  steps: {
    name: 'Steps',
    route: 'Steps',
    backIconDark: true,
    iconName: 'step-forward' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'pomodoro-timer': {
    name: 'Pomodoro Timer',
    route: 'PomodoroTimer',
    backIconDark: false,
    iconName: 'timer-outline' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'exclusion-tabs': {
    name: 'Exclusion Tabs',
    route: 'ExclusionTabs',
    backIconDark: false,
    iconName: 'tab' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'clerk-toast': {
    name: 'Clerk Toast',
    route: 'ClerkToast',
    backIconDark: false,
    iconName: 'toaster' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'duration-slider': {
    name: 'Duration Slider',
    route: 'DurationSlider',
    backIconDark: true,
    iconName: 'timer' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'alert-drawer': {
    name: 'Alert Drawer',
    route: 'AlertDrawer',
    backIconDark: true,
    iconName: 'alert' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'motion-blur': {
    name: 'Motion Blur',
    route: 'MotionBlur',
    backIconDark: true,
    iconName: 'blur' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'linear-tab-interaction': {
    name: 'Linear Tab Interaction',
    route: 'LinearTabInteraction',
    backIconDark: false,
    iconName: 'tab' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'delete-button': {
    name: 'Delete Button',
    route: 'DeleteButton',
    backIconDark: true,
    iconName: 'delete' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'dynamic-blur-tabs': {
    name: 'Dynamic Blur Tabs',
    route: 'DynamicBlurTabs',
    backIconDark: true,
    iconName: 'blur' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  snake: {
    name: 'Snake',
    route: 'Snake',
    backIconDark: true,
    iconName: 'snake' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'expandable-mini-player': {
    name: 'Expandable Mini Player',
    route: 'ExpandableMiniPlayer',
    backIconDark: false,
    iconName: 'music' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'bezier-curve-outline': {
    name: 'Bezier Curve Outline',
    route: 'BezierCurveOutline',
    backIconDark: true,
    iconName: 'vector-bezier' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'tab-navigation': {
    name: 'Tab Navigation',
    route: 'TabNavigation',
    backIconDark: true,
    iconName: 'tab' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'stacked-modals': {
    name: 'Stacked Modals',
    route: 'StackedModals',
    backIconDark: true,
    iconName: 'card' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'verification-code-face': {
    name: 'Verification Code Face',
    route: 'VerificationCodeFace',
    backIconDark: true,
    iconName: 'baby-face' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
    alert: true,
  },
  'everybody-can-cook': {
    name: 'Everybody Can Cook',
    route: 'EverybodyCanCook',
    backIconDark: false,
    iconName: 'food' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'threads-holo-ticket': {
    name: 'Threads Holo Ticket',
    route: 'ThreadsHoloTicket',
    backIconDark: false,
    iconName: 'ticket' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'fluid-tab-interaction': {
    name: 'Fluid Tab Interaction',
    route: 'FluidTabInteraction',
    backIconDark: false,
    iconName: 'blur' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'shake-to-delete': {
    name: 'Shake to Delete',
    route: 'ShakeToDelete',
    backIconDark: false,
    iconName: 'shaker' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'composable-text': {
    name: 'Composable Text',
    route: 'ComposableText',
    backIconDark: false,
    iconName: 'text' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'card-shader-reflections': {
    name: 'Card Shader Reflections',
    route: 'CardShaderReflections',
    backIconDark: false,
    iconName: 'card' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'clock-time-picker': {
    name: 'Clock Time Picker',
    route: 'ClockTimePicker',
    backIconDark: false,
    iconName: 'clock' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  sudoku: {
    name: 'Sudoku',
    route: 'Sudoku',
    backIconDark: false,
    iconName: 'grid' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'particles-button': {
    name: 'Particles Button',
    route: 'ParticlesButton',
    backIconDark: false,
    iconName: 'atom' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'ios-home-grid': {
    name: 'iOS Home Grid',
    route: 'iOSHomeGrid',
    backIconDark: false,
    iconName: 'grid-large' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
    alert: true,
  },
  'time-machine': {
    name: 'Time Machine',
    route: 'TimeMachine',
    backIconDark: false,
    iconName: 'timelapse' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'ios-home-bouncy': {
    name: 'iOS Home Bouncy',
    route: 'IosHomeBouncy',
    backIconDark: false,
    iconName: 'home' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'online-offline': {
    name: 'Online Offline',
    route: 'OnlineOffline',
    backIconDark: false,
    iconName: 'network' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'draggable-panel': {
    name: 'Draggable Panel',
    route: 'DraggablePanel',
    backIconDark: false,
    iconName: 'pan-top-left' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'github-contributions': {
    name: 'GitHub Contributions',
    route: 'GitHubContributions',
    backIconDark: false,
    iconName: 'mark-github' as const,
    iconFamily: 'Octicons' as const,
  },
  'stacked-carousel': {
    name: 'Stacked Carousel',
    route: 'StackedCarousel',
    backIconDark: false,
    iconName: 'view-carousel' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
  'airbnb-flip-interaction': {
    name: 'Airbnb Flip Interaction',
    route: 'AirbnbFlipInteraction',
    backIconDark: false,
    iconName: 'account' as const,
    iconFamily: 'MaterialCommunityIcons' as const,
  },
} as const;

// Type definitions for icon families
export type IconFamily =
  | 'AntDesign'
  | 'Entypo'
  | 'Feather'
  | 'FontAwesome'
  | 'Ionicons'
  | 'MaterialCommunityIcons'
  | 'MaterialIcons'
  | 'Octicons';

export type IconMetadata = {
  iconName: string;
  iconFamily: IconFamily;
  iconColor?: string;
};

export type AnimationSlug = keyof typeof AnimationRegistry;
export type AnimationComponent = (typeof AnimationRegistry)[AnimationSlug];
export type AnimationMeta = (typeof AnimationMetadata)[AnimationSlug];

// Helper functions
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
