// Some constants used in the app
// Basically the data for the list of items
export const INITIAL_ITEMS = [
  {
    imageUrl:
      'https://play-lh.googleusercontent.com/KUvWetYPXtDaX-JLGmMf9JpRm1uGc-KPpeQjRSNqcLpArEsiIL0hosw0jLmrBoUtRZk=w480-h960-rw',
    title: 'Explore my Patreon 👀',
  },
  {
    image: require('./assets/images/verification.png'),
    imageUrl:
      'https://c10.patreonusercontent.com/4/patreon-media/p/post/97510826/ea077253c99a4769a6bb259aafbd3cce/eyJiIjo4LCJoIjozNDksInciOjYyMH0%3D/1.jpg?token-time=2145916800&token-hash=n_Tz_iaeWEweSQe7vLRV4SNfVABN9biv8A5iZoNYnMI%3D',
    title: 'Animated Verification Code with Reanimated 🔓',
    subtitle:
      "After last week's animation, this time I decided to focus on simplicity and usefulness. Honestly, the animation is a bit more comple...",
  },
  {
    image: require('./assets/images/fibonacci-shader.png'),
    imageUrl:
      'https://c10.patreonusercontent.com/4/patreon-media/p/post/97057260/3db4a9ffa6e74849bf0f82625b9f1538/eyJiIjo4LCJoIjozNDksInciOjYyMH0%3D/3.jpg?token-time=2145916800&token-hash=0DmvYVwjZwVJ8OZKgGJI8E6bKMZfZBmoyf12fsl1dj0%3D',
    title: 'Fibonacci Sphere enhanced with React Native Skia 🎈',
    subtitle:
      'This week I wanted to take a second look at this animation (I published a slightly simpler version few weeks ago here). But since I started...',
  },
  {
    image: require('./assets/images/balance.png'),
    imageUrl:
      'https://c10.patreonusercontent.com/4/patreon-media/p/post/96906156/f2f840c927e54442bc57cc248c8f70df/eyJiIjo4LCJoIjozNDksInciOjYyMH0%3D/2.jpg?token-time=2145916800&token-hash=qQPYp8wHq-Q73aY5v1Hut-JwCRxh5oEMgLfwpliSCp8%3D',
    title: 'Balance Slider with React Native Reanimated ⚖️',
    subtitle:
      "I've been wanting to do animation of a particular slider for a while, but couldn't find anything exciting online. And so yesterday scrolling...",
  },
  {
    image: require('./assets/images/family.png'),
    imageUrl:
      'https://c10.patreonusercontent.com/4/patreon-media/p/post/96481569/ff0c1689679c4825b318618fa3cb9f84/eyJiIjo4LCJoIjozNDksInciOjYyMH0%3D/3.jpg?token-time=2145916800&token-hash=XObwbWJm7I4n1KMNxO6fXaKpqdWqWrRR9yP_-yntPVY%3D',
    title: 'Family Number Input with Reanimated',
    subtitle:
      'To be honest I tried a lot of times to recreate this animation (from the Family app) but I was always stuck on how to handle the "unmount"...',
  },
  {
    image: require('./assets/images/drag.png'),
    imageUrl:
      'https://c10.patreonusercontent.com/4/patreon-media/p/post/94824742/2a50aa584f6d46fe80cc7f8e647c0cc4/eyJiIjo4LCJoIjozNDksInciOjYyMH0%3D/2.jpg?token-time=2145916800&token-hash=6pkYVp7V4G9e2HalQ2txPKjZtCcwgJFGyDOrcWH5k20%3D',
    title: 'Drag to Sort with Reanimated and Gesture Handler 🤌🏽',
    subtitle:
      'Drag to sort is a classic pattern, and I think it really can give an edge in several use cases. I have tried to make this animation as ......',
  },
  {
    image: require('./assets/images/fractal.png'),
    imageUrl:
      'https://c10.patreonusercontent.com/4/patreon-media/p/post/94006877/1ef5c9c9c44f448ca166fcd334157cdf/eyJiIjo4LCJoIjozNDksInciOjYyMH0%3D/2.jpg?token-time=2145916800&token-hash=f8PxHCK0r9fo8Czgns8dIFUsXyiyjD2u8UfiUGdjeSg%3D',
    title: 'Fractal Glass with React Native Skia 🎨',
    subtitle:
      'Today I want to share with you this mesmerizing Fractal Glass animation. The first time I saw this concept, I thought it would......',
  },
  {
    image: require('./assets/images/blurred.png'),
    imageUrl:
      'https://c10.patreonusercontent.com/4/patreon-media/p/post/93997837/29bbe31448d54886b24288a80d8f1dca/eyJiIjo4LCJoIjozNDksInciOjYyMH0%3D/3.jpg?token-time=2145916800&token-hash=NJsRYKJa44R0BJxPGnCHolhywfsCmh5m1GYNhCygto4%3D',
    title: 'Blurred TabBar with Expo Blur 🎨',
    subtitle:
      'The approach used to create the blurred bottom tab is to create a custom TabBar component and bind it to react-navigation. The trick is ....',
  },
  {
    image: require('./assets/images/slide.png'),
    imageUrl:
      'https://c10.patreonusercontent.com/4/patreon-media/p/post/93158632/6082fff94fcd4ad0b11c3fdf775a029e/eyJiIjo4LCJoIjozNDksInciOjYyMH0%3D/3.jpg?token-time=2145916800&token-hash=S544M1Xz0T4iD5G9a-vH1oqB6DfTfTSmtVaWMRrSFbM%3D',
    title: 'Slide to Reveal with React Native Skia 🪄',
    subtitle:
      "Before we talk about any technical details, isn't this animation brilliant? The first time I saw it, I immediately thought I absolutely......",
  },
  {
    image: require('./assets/images/toast.png'),
    imageUrl:
      'https://c10.patreonusercontent.com/4/patreon-media/p/post/93125543/5ccf6cf9301244c1ae4c72eaaaa16157/eyJiIjo4LCJoIjozNDksInciOjYyMH0%3D/2.jpg?token-time=2145916800&token-hash=pva0G4brnTOqhRr-suf3SuMbCDSPED_R4QuFbY8HwtI%3D',
    title: 'Toast Manager with Reanimated and Gesture Handler 🍞',
    subtitle:
      "Each toast is swipeable! You can easily dismiss a toast by swiping it to the left. It's not just functional, it's fun! Don't worry about......",
  },
  {
    imageUrl:
      'https://play-lh.googleusercontent.com/KUvWetYPXtDaX-JLGmMf9JpRm1uGc-KPpeQjRSNqcLpArEsiIL0hosw0jLmrBoUtRZk=w480-h960-rw',
    title: 'You can find a lot more 👀',
    subtitle: 'https://patreon.com/reactiive',
  },
];
