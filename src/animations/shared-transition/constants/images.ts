// Derived from the masters in ../assets/images by
// scripts/shared-transition-images.py, each just large enough to cover the
// view it is drawn in at 3x. expo-image shrinks a larger image with a CPU redraw
// on the main thread (the full 1920x2880 masters stalled the grid and the push).
const dataSources = [
  {
    thumbnail: require('../assets/images/thumbnails/00.jpg'),
    source: require('../assets/images/detail/00.jpg'),
  },
  {
    thumbnail: require('../assets/images/thumbnails/01.jpg'),
    source: require('../assets/images/detail/01.jpg'),
  },
  {
    thumbnail: require('../assets/images/thumbnails/02.jpg'),
    source: require('../assets/images/detail/02.jpg'),
  },
  {
    thumbnail: require('../assets/images/thumbnails/03.jpg'),
    source: require('../assets/images/detail/03.jpg'),
  },
  {
    thumbnail: require('../assets/images/thumbnails/04.jpg'),
    source: require('../assets/images/detail/04.jpg'),
  },
  {
    thumbnail: require('../assets/images/thumbnails/05.jpg'),
    source: require('../assets/images/detail/05.jpg'),
  },
  {
    thumbnail: require('../assets/images/thumbnails/06.jpg'),
    source: require('../assets/images/detail/06.jpg'),
  },
  {
    thumbnail: require('../assets/images/thumbnails/07.jpg'),
    source: require('../assets/images/detail/07.jpg'),
  },
  {
    thumbnail: require('../assets/images/thumbnails/08.jpg'),
    source: require('../assets/images/detail/08.jpg'),
  },
  {
    thumbnail: require('../assets/images/thumbnails/09.jpg'),
    source: require('../assets/images/detail/09.jpg'),
  },
];

export { dataSources };
