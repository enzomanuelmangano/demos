# Demos ✨

An ongoing collection of React Native animations crafted with Reanimated, Gesture Handler, and Skia.

Browse all demos at [reactiive.io/demos](https://reactiive.io/demos).

## Highlights

Demos 2024 - Rewind 👇

https://github.com/user-attachments/assets/47c8fb6d-6810-444f-a92e-589ffae84778

Demos 2023 - Rewind: [Twitter Post](https://x.com/reactiive_/status/1740314524501078359)

## Roadmap

This project is a work in progress (almost by definition). Here are the current priorities:

- [ ] Remove deprecated APIs: runOnJS and runOnUI should now be imported from react-native-worklets
- [ ] Fix navigation setup: the project started with React Navigation, but we’re migrating to Expo Router. The repo currently feels like a mix of both.
- [ ] Drawer Navigation: currently the navigation is quite unintuitive and needs to be improved.
- [ ] Ensure consistent haptics support (use [pressto](https://github.com/enzomanuelmangano/pressto) whenever possible)
- [ ] Optimize performance in Shaders demos
- [ ] Feedback screen on Shake Detection
- [ ] TestFlight Release
- [ ] Android Release (starting with App Tester / Firebase Distribution)

## Quick Start

This is an Expo Go project. To get started:

```bash
bun install
bun ios     # for iOS
# or
bun android # for Android
```

## Project Layout

```
src/
├── animations/   # Where the magic happens
├── navigation/   # Getting around the app
├── components/   # Building blocks
└── utils/        # Helper functions
```

## License

You can find the full license [here](https://reactiive.io/docs/license).
