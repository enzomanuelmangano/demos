export type IconFamily = 'Ionicons';

export interface AnimationMetadataType extends Record<string, unknown> {
  name: string;
  route: string;
  iconName: string;
  alert?: boolean;
  iconColor?: string;
  hideDrawerIcon?: boolean;
}

export interface IconMetadata {
  iconName: string;
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
import { AtlasSphere } from './atlas-sphere';
import { AudioPlayer } from './audio-player';
import { BalanceSlider } from './balance-slider';
import { BezierCurveOutline } from './bezier-curve-outline';
import { BlurCards } from './blur-cards';
import { BlurCircles } from './blur-circles';
import { CalendarDays } from './calendar-days';
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
import { LinearSensors } from './linear-sensors';
import { Playground } from './liquid-glass-playground';
import { LoadingButton } from './loading-button';
import { MagnetSpring } from './magnet-spring';
import { Metaball } from './metaball';
import { MilesBarChart } from './miles-bar-chart';
import { Mnist } from './mnist';
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
  'atlas-sphere': AtlasSphere,
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
  'delete-button': DeleteButton,
  'dynamic-blur-tabs': DynamicBlurTabs,
  snake: Snake,
  'expandable-mini-player': ExpandableMiniPlayer,
  'bezier-curve-outline': BezierCurveOutline,
  'tab-navigation': TabNavigation,
  mnist: Mnist,
  'stacked-modals': StackedModals,
  'linear-sensors': LinearSensors,
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
  'magnet-spring': MagnetSpring,
  'ios-home-grid': iOSHomeGrid,
  'time-machine': TimeMachine,
  'ios-home-bouncy': IosHomeBouncy,
  'online-offline': OnlineOffline,
  'draggable-panel': DraggablePanel,
  'github-contributions': GitHubContributions,
  'stacked-carousel': StackedCarousel,
  'airbnb-flip-interaction': AirbnbFlipInteraction,
  'liquid-glass-playground': Playground,
  'blur-cards': BlurCards,
  'calendar-days': CalendarDays,
} as const;

export const AnimationMetadata: Record<string, AnimationMetadataType> = {
  'mobile-input': {
    name: 'Mobile Input',
    route: 'MobileInput',
    iconName: 'happy-outline',
  },
  'swipe-cards': {
    name: 'Swipe Cards',
    route: 'SwipeCards',
    iconName: 'card-outline',
  },
  spiral: {
    name: 'Spiral',
    route: 'Spiral',
    iconName: 'compass-outline',
  },
  'scroll-progress': {
    name: 'Scroll Progress',
    route: 'ScrollProgress',
    iconName: 'stats-chart-outline',
  },
  'animated-grid-list': {
    name: 'Animated Grid List',
    route: 'AnimatedGridList',
    iconName: 'grid-outline',
  },
  'floating-bottom-bar': {
    name: 'Floating Bottom Bar',
    route: 'FloatingBottomBar',
    iconName: 'star-outline',
  },
  'animated-clip-box': {
    name: 'Animated Clip Box',
    route: 'AnimatedClipBox',
    iconName: 'square-outline',
  },
  'theme-canvas-animation': {
    name: 'Theme Canvas Animation',
    route: 'ThemeCanvasAnimation',
    iconName: 'color-palette-outline',
  },
  'add-to-cart': {
    name: 'Add to Cart',
    route: 'AddToCart',
    iconName: 'cart-outline',
  },
  'bottom-bar-skia': {
    name: 'BottomBarSkia',
    route: 'BottomBarSkia',
    iconName: 'tablet-portrait-outline',
  },
  'cuberto-slider': {
    name: 'Cuberto Slider',
    route: 'CubertoSlider',
    iconName: 'balloon-outline',
  },
  metaball: {
    name: 'Metaball',
    route: 'Metaball',
    iconName: 'tennisball',
  },
  'shared-transitions': {
    name: 'Shared Transitions',
    route: 'SharedTransitions',
    alert: true,
    iconName: 'sync-outline',
    iconColor: 'yellow',
  },
  'story-list': {
    name: 'Story List',
    route: 'StoryList',
    iconName: 'book-outline',
  },
  'dynamic-tab-indicator': {
    name: 'Dynamic Tab Indicator',
    route: 'DynamicTabIndicator',
    iconName: 'browsers-outline',
  },
  'blur-circles': {
    name: 'Blur Circles',
    route: 'BlurCircles',
    iconName: 'ellipse-outline',
  },
  'smooth-dropdown': {
    name: 'Smooth Dropdown',
    route: 'SmoothDropdown',
    iconName: 'chevron-down-outline',
  },
  'skia-bottom-sheet': {
    name: 'Skia BottomSheet',
    route: 'SkiaBottomSheet',
    iconName: 'card-outline',
  },
  'floating-modal': {
    name: 'Floating Modal',
    route: 'FloatingModal',
    iconName: 'expand-outline',
  },
  'audio-player': {
    name: 'AudioPlayer',
    route: 'AudioPlayer',
    iconName: 'barcode',
  },
  'color-carousel': {
    name: 'Color Carousel',
    route: 'ColorCarousel',
    iconName: 'color-palette-outline',
  },
  'animated-3d-parallax': {
    name: 'Animated 3D Parallax',
    route: 'Animated3DParallax',
    iconName: 'logo-twitter',
  },
  'fluid-slider': {
    name: 'Fluid Slider',
    route: 'FluidSlider',
    iconName: 'water-outline',
  },
  'animated-indicator-list': {
    name: 'Animated Indicator List',
    route: 'AnimatedIndicatorList',
    iconName: 'list-outline',
  },
  'radar-chart': {
    name: 'Radar Chart',
    route: 'RadarChart',
    iconName: 'radio-outline',
  },
  'image-cropper': {
    name: 'Image Cropper',
    route: 'ImageCropper',
    iconName: 'crop-outline',
  },
  'selectable-grid-list': {
    name: 'Selectable Grid List',
    route: 'SelectableGridList',
    iconName: 'checkbox-outline',
  },
  'animated-count-text': {
    name: 'Animated Count Text',
    route: 'AnimatedCountText',
    iconName: 'calculator-outline',
  },
  'qr-code-generator': {
    name: 'QR Code Generator',
    route: 'QRCodeGenerator',
    iconName: 'qr-code-outline',
  },
  'popup-handler': {
    name: 'Popup Handler',
    route: 'PopupHandler',
    iconName: 'radio-button-on-outline',
  },
  'twitter-tab-bar': {
    name: 'Twitter Tab Bar',
    route: 'TwitterTabBar',
    iconName: 'logo-twitter',
  },
  'circular-carousel': {
    name: 'Circular Carousel',
    route: 'CircularCarousel',
    iconName: 'ellipse-outline',
  },
  'split-button': {
    name: 'Split Button',
    route: 'SplitButton',
    iconName: 'git-branch-outline',
  },
  'telegram-theme-switch': {
    name: 'Telegram Theme Switch',
    route: 'TelegramThemeSwitch',
    iconName: 'paper-plane-outline',
  },
  'fourier-visualizer': {
    name: 'Fourier Visualizer',
    route: 'FourierVisualizer',
    iconName: 'brush-outline',
  },
  'github-onboarding': {
    name: 'GitHub Onboarding',
    route: 'GitHubOnboarding',
    iconName: 'logo-github',
  },
  'loading-button': {
    name: 'Loading Button',
    route: 'LoadingButton',
    iconName: 'refresh-outline',
  },
  'scrollable-bottom-sheet': {
    name: 'Scrollable Bottom Sheet',
    route: 'ScrollableBottomSheet',
    iconName: 'arrow-up-outline',
  },
  'skia-color-picker': {
    name: 'Skia Color Picker',
    route: 'SkiaColorPicker',
    iconName: 'color-palette-outline',
  },
  'blurred-scroll': {
    name: 'Blurred Scroll',
    route: 'BlurredScroll',
    iconName: 'ellipse-outline',
  },
  'airbnb-slider': {
    name: 'AirBnb Slider',
    route: 'AirBnbSlider',
    iconName: 'calculator-outline',
  },
  'steddy-graph-interaction': {
    name: 'Steddy Graph Interaction',
    route: 'SteddyGraphInteraction',
    iconName: 'trending-up-outline',
  },
  'action-tray': {
    name: 'Action Tray',
    route: 'ActionTray',
    iconName: 'card-outline',
  },
  toast: {
    name: 'Toast',
    route: 'Toast',
    iconName: 'chatbubble-outline',
  },
  'slide-to-reveal': {
    name: 'Slide to Reveal',
    route: 'SlideToReveal',
    iconName: 'calculator-outline',
  },
  'blurred-bottom-bar': {
    name: 'Blurred Bottom Bar',
    route: 'BlurredBottomBar',
    iconName: 'remove-outline',
  },
  'fractal-glass': {
    name: 'Fractal Glass',
    route: 'FractalGlass',
    iconName: 'square-outline',
  },
  'drag-to-sort': {
    name: 'Drag to Sort',
    route: 'DragToSort',
    iconName: 'swap-vertical-outline',
  },
  'fibonacci-shader': {
    name: 'Fibonacci Shader',
    route: 'FibonacciShader',
    iconName: 'globe-outline',
  },
  'family-number-input': {
    name: 'Family Number Input',
    route: 'FamilyNumberInput',
    iconName: 'grid-outline',
  },
  'balance-slider': {
    name: 'Balance Slider',
    route: 'BalanceSlider',
    iconName: 'scale-outline',
  },
  'fibonacci-shader-grid': {
    name: 'Fibonacci Shader Grid',
    route: 'FibonacciShaderGrid',
    iconName: 'grid-outline',
  },
  'verification-code': {
    name: 'Verification Code',
    route: 'VerificationCode',
    iconName: 'shield-checkmark-outline',
  },
  'email-demo': {
    name: 'Email Demo',
    route: 'EmailDemo',
    iconName: 'trash-outline',
  },
  'scroll-transition-3d': {
    name: '3D Scroll Transition',
    route: 'ScrollTransition3D',
    iconName: 'cube-outline',
  },
  'staggered-card-number': {
    name: 'Staggered Card Number',
    route: 'StaggeredCardNumber',
    iconName: 'card-outline',
  },
  'stacked-bottom-sheet': {
    name: 'Stacked Bottom Sheet',
    route: 'StackedBottomSheet',
    iconName: 'card-outline',
  },
  'gl-transitions': {
    name: 'GL Transitions',
    route: 'GLTransitions',
    iconName: 'shuffle-outline',
  },
  'prequel-slider': {
    name: 'Prequel Slider',
    route: 'PrequelSlider',
    iconName: 'contract-outline',
  },
  'empty-qr-code': {
    name: 'Empty QR Code',
    route: 'EmptyQRCode',
    iconName: 'qr-code-outline',
  },
  'infinite-carousel': {
    name: 'Infinite Carousel',
    route: 'InfiniteCarousel',
    iconName: 'images-outline',
  },
  'twodos-slide': {
    name: 'Twodos Slide',
    route: 'TwodosSlide',
    iconName: 'arrow-forward-outline',
  },
  'wheel-picker': {
    name: 'Wheel Picker',
    route: 'WheelPicker',
    iconName: 'navigate-circle-outline',
  },
  'stacked-list': {
    name: 'Stacked List',
    route: 'StackedList',
    iconName: 'layers-outline',
  },
  'geometry-button': {
    name: 'Geometry Button',
    route: 'GeometryButton',
    iconName: 'globe-outline',
  },
  'record-button': {
    name: 'Record Button',
    route: 'RecordButton',
    iconName: 'radio-button-on',
  },
  'grid-visualizer': {
    name: 'Grid Visualizer',
    route: 'GridVisualizer',
    alert: true,
    iconName: 'grid-outline',
  },
  'imessage-stack': {
    name: 'iMessageStack',
    route: 'IMessageStack',
    iconName: 'swap-horizontal-outline',
  },
  'atlas-button': {
    name: 'Atlas Button',
    route: 'AtlasButton',
    iconName: 'logo-react',
  },
  'atlas-sphere': {
    name: 'Atlas Sphere',
    route: 'AtlasSphere',
    iconName: 'globe-outline',
  },
  'checkbox-interactions': {
    name: 'Checkbox Interactions',
    route: 'CheckboxInteractions',
    iconName: 'checkbox-outline',
  },
  'interaction-appearance': {
    name: 'Interaction Appearance',
    route: 'InteractionAppearance',
    iconName: 'contrast-outline',
  },
  'dot-sheet': {
    name: 'Dot Sheet',
    route: 'DotSheet',
    iconName: 'attach-outline',
    hideDrawerIcon: true,
  },
  'coverflow-carousel': {
    name: 'Coverflow Carousel',
    route: 'CoverflowCarousel',
    iconName: 'images-outline',
    alert: true,
  },
  'paper-folding': {
    name: 'Paper Folding',
    route: 'PaperFolding',
    iconName: 'document-outline',
  },
  'miles-bar-chart': {
    name: 'Miles Bar Chart',
    route: 'MilesBarChart',
    iconName: 'bar-chart-outline',
  },
  steps: {
    name: 'Steps',
    route: 'Steps',
    iconName: 'play-skip-forward-outline',
  },
  'pomodoro-timer': {
    name: 'Pomodoro Timer',
    route: 'PomodoroTimer',
    iconName: 'timer-outline',
  },
  'exclusion-tabs': {
    name: 'Exclusion Tabs',
    route: 'ExclusionTabs',
    iconName: 'browsers-outline',
  },
  'clerk-toast': {
    name: 'Clerk Toast',
    route: 'ClerkToast',
    iconName: 'cafe-outline',
  },
  'duration-slider': {
    name: 'Duration Slider',
    route: 'DurationSlider',
    iconName: 'timer-outline',
  },
  'alert-drawer': {
    name: 'Alert Drawer',
    route: 'AlertDrawer',
    iconName: 'alert-circle-outline',
  },
  'motion-blur': {
    name: 'Motion Blur',
    route: 'MotionBlur',
    iconName: 'ellipse-outline',
  },
  'delete-button': {
    name: 'Delete Button',
    route: 'DeleteButton',
    iconName: 'trash-outline',
  },
  'dynamic-blur-tabs': {
    name: 'Dynamic Blur Tabs',
    route: 'DynamicBlurTabs',
    iconName: 'ellipse-outline',
  },
  snake: {
    name: 'Snake',
    route: 'Snake',
    iconName: 'git-network-outline',
  },
  'expandable-mini-player': {
    name: 'Expandable Mini Player',
    route: 'ExpandableMiniPlayer',
    iconName: 'musical-notes-outline',
  },
  'bezier-curve-outline': {
    name: 'Bezier Curve Outline',
    route: 'BezierCurveOutline',
    iconName: 'analytics-outline',
  },
  'tab-navigation': {
    name: 'Tab Navigation',
    route: 'TabNavigation',
    iconName: 'browsers-outline',
  },
  mnist: {
    name: 'MNIST',
    route: 'MNIST',
    iconName: 'bulb-outline',
  },
  'stacked-modals': {
    name: 'Stacked Modals',
    route: 'StackedModals',
    iconName: 'card-outline',
  },
  'linear-sensors': {
    name: 'Linear Sensors',
    route: 'LinearSensors',
    iconName: 'logo-react',
  },
  'verification-code-face': {
    name: 'Verification Code Face',
    route: 'VerificationCodeFace',
    iconName: 'person-outline',
  },
  'everybody-can-cook': {
    name: 'Everybody Can Cook',
    route: 'EverybodyCanCook',
    iconName: 'restaurant-outline',
  },
  'threads-holo-ticket': {
    name: 'Threads Holo Ticket',
    route: 'ThreadsHoloTicket',
    iconName: 'ticket-outline',
  },
  'fluid-tab-interaction': {
    name: 'Fluid Tab Interaction',
    route: 'FluidTabInteraction',
    iconName: 'ellipse-outline',
  },
  'shake-to-delete': {
    name: 'Shake to Delete',
    route: 'ShakeToDelete',
    iconName: 'phone-portrait-outline',
  },
  'composable-text': {
    name: 'Composable Text',
    route: 'ComposableText',
    iconName: 'text-outline',
  },
  'card-shader-reflections': {
    name: 'Card Shader Reflections',
    route: 'CardShaderReflections',
    iconName: 'card-outline',
  },
  'clock-time-picker': {
    name: 'Clock Time Picker',
    route: 'ClockTimePicker',
    iconName: 'time-outline',
  },
  sudoku: {
    name: 'Sudoku',
    route: 'Sudoku',
    iconName: 'grid-outline',
  },
  'particles-button': {
    name: 'Particles Button',
    route: 'ParticlesButton',
    iconName: 'planet-outline',
  },
  'magnet-spring': {
    name: 'Magnet Spring',
    route: 'MagnetSpring',
    iconName: 'magnet-outline',
  },
  'ios-home-grid': {
    name: 'iOS Home Grid',
    route: 'iOSHomeGrid',
    iconName: 'grid-outline',
  },
  'time-machine': {
    name: 'Time Machine',
    route: 'TimeMachine',
    iconName: 'time-outline',
    alert: true,
  },
  'ios-home-bouncy': {
    name: 'iOS Home Bouncy',
    route: 'IosHomeBouncy',
    iconName: 'home-outline',
    alert: true,
  },
  'online-offline': {
    name: 'Online Offline',
    route: 'OnlineOffline',
    iconName: 'wifi-outline',
  },
  'draggable-panel': {
    name: 'Draggable Panel',
    route: 'DraggablePanel',
    iconName: 'move-outline',
  },
  'github-contributions': {
    name: 'GitHub Contributions',
    route: 'GitHubContributions',
    iconName: 'logo-github',
  },
  'stacked-carousel': {
    name: 'Stacked Carousel',
    route: 'StackedCarousel',
    iconName: 'images-outline',
  },
  'airbnb-flip-interaction': {
    name: 'Airbnb Flip Interaction',
    route: 'AirbnbFlipInteraction',
    iconName: 'person-outline',
  },
  'liquid-glass-playground': {
    name: 'Liquid Glass Playground',
    route: 'Playground',
    iconName: 'play-outline',
  },
  'blur-cards': {
    name: 'Blur Cards',
    route: 'BlurCards',
    iconName: 'layers-outline',
  },
  'calendar-days': {
    name: 'Calendar Days',
    route: 'CalendarDays',
    iconName: 'calendar-outline',
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
  return Object.keys(AnimationRegistry)
    .map(slug => ({
      slug,
      component: AnimationRegistry[slug as AnimationSlug],
      metadata: AnimationMetadata[slug as AnimationSlug],
    }))
    .filter(animation => {
      if (animation.metadata === undefined) {
        console.warn('Missing metadata for animation:', animation.slug);
      }
      return animation.metadata !== undefined;
    });
};
