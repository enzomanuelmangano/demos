// Skia 3 is published as `react-native-skia`. react-native-chessboard,
// react-native-fast-confetti, react-native-qrcode-skia and
// react-native-skia-gesture still import `@shopify/react-native-skia`; this
// package stands in for it so they run on Skia 3, and so the package manager
// does not install Skia 2 to satisfy their peer dependency.
module.exports = require('react-native-skia');
