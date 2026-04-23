import type { ImageSourcePropType } from 'react-native';

export interface Painting {
  id: string;
  name: string;
  asset: ImageSourcePropType;
  year?: number;
}

export interface Painter {
  id: string;
  name: string;
  nationality: string;
  paintings: Painting[];
}

export interface ArtMovement {
  id: string;
  name: string;
  painters: Painter[];
}

/**
 * Art organized by movement, painter, and painting
 * This structure allows for rich categorization in the UI
 */
export const ART_MOVEMENTS: ArtMovement[] = [
  {
    id: 'renaissance',
    name: 'Renaissance',
    painters: [
      {
        id: 'da-vinci',
        name: 'Leonardo da Vinci',
        nationality: 'Italian',
        paintings: [
          {
            id: 'mona-lisa',
            name: 'Mona Lisa',
            asset: require('./paintings/mona-lisa.jpg'),
            year: 1506,
          },
          {
            id: 'last-supper',
            name: 'The Last Supper',
            asset: require('./paintings/last-supper.jpg'),
            year: 1498,
          },
        ],
      },
      {
        id: 'michelangelo',
        name: 'Michelangelo',
        nationality: 'Italian',
        paintings: [
          {
            id: 'creation-of-adam',
            name: 'The Creation of Adam',
            asset: require('./paintings/creation-of-adam.jpg'),
            year: 1512,
          },
        ],
      },
      {
        id: 'raphael',
        name: 'Raphael',
        nationality: 'Italian',
        paintings: [
          {
            id: 'school-of-athens',
            name: 'The School of Athens',
            asset: require('./paintings/school-of-athens.jpg'),
            year: 1511,
          },
        ],
      },
      {
        id: 'botticelli',
        name: 'Sandro Botticelli',
        nationality: 'Italian',
        paintings: [
          {
            id: 'birth-of-venus',
            name: 'The Birth of Venus',
            asset: require('./paintings/birth-of-venus.jpg'),
            year: 1485,
          },
          {
            id: 'primavera',
            name: 'Primavera',
            asset: require('./paintings/primavera.jpg'),
            year: 1482,
          },
        ],
      },
    ],
  },
  {
    id: 'dutch-golden-age',
    name: 'Dutch Golden Age',
    painters: [
      {
        id: 'vermeer',
        name: 'Johannes Vermeer',
        nationality: 'Dutch',
        paintings: [
          {
            id: 'girl-with-pearl-earring',
            name: 'Girl with a Pearl Earring',
            asset: require('./paintings/girl-with-pearl-earring.jpg'),
            year: 1665,
          },
          {
            id: 'the-milkmaid',
            name: 'The Milkmaid',
            asset: require('./paintings/the-milkmaid.jpg'),
            year: 1660,
          },
        ],
      },
      {
        id: 'rembrandt',
        name: 'Rembrandt',
        nationality: 'Dutch',
        paintings: [
          {
            id: 'the-night-watch',
            name: 'The Night Watch',
            asset: require('./paintings/the-night-watch.jpg'),
            year: 1642,
          },
          {
            id: 'self-portrait-rembrandt',
            name: 'Self Portrait',
            asset: require('./paintings/self-portrait-rembrandt.jpg'),
            year: 1659,
          },
        ],
      },
    ],
  },
  {
    id: 'romanticism',
    name: 'Romanticism',
    painters: [
      {
        id: 'friedrich',
        name: 'Caspar David Friedrich',
        nationality: 'German',
        paintings: [
          {
            id: 'wanderer-above-sea-of-fog',
            name: 'Wanderer Above the Sea of Fog',
            asset: require('./paintings/wanderer-above-sea-of-fog.jpg'),
            year: 1818,
          },
        ],
      },
      {
        id: 'delacroix',
        name: 'Eugène Delacroix',
        nationality: 'French',
        paintings: [
          {
            id: 'liberty-leading-the-people',
            name: 'Liberty Leading the People',
            asset: require('./paintings/liberty-leading-the-people.jpg'),
            year: 1830,
          },
        ],
      },
    ],
  },
  {
    id: 'impressionism',
    name: 'Impressionism',
    painters: [
      {
        id: 'monet',
        name: 'Claude Monet',
        nationality: 'French',
        paintings: [
          {
            id: 'water-lilies',
            name: 'Water Lilies',
            asset: require('./paintings/water-lilies.jpg'),
            year: 1906,
          },
          {
            id: 'impression-sunrise',
            name: 'Impression, Sunrise',
            asset: require('./paintings/impression-sunrise.jpg'),
            year: 1872,
          },
        ],
      },
    ],
  },
  {
    id: 'post-impressionism',
    name: 'Post-Impressionism',
    painters: [
      {
        id: 'van-gogh',
        name: 'Vincent van Gogh',
        nationality: 'Dutch',
        paintings: [
          {
            id: 'starry-night',
            name: 'The Starry Night',
            asset: require('./paintings/starry-night.jpg'),
            year: 1889,
          },
          {
            id: 'sunflowers',
            name: 'Sunflowers',
            asset: require('./paintings/sunflowers.jpg'),
            year: 1888,
          },
          {
            id: 'cafe-terrace',
            name: 'Café Terrace at Night',
            asset: require('./paintings/cafe-terrace.jpg'),
            year: 1888,
          },
        ],
      },
    ],
  },
  {
    id: 'art-nouveau',
    name: 'Art Nouveau',
    painters: [
      {
        id: 'klimt',
        name: 'Gustav Klimt',
        nationality: 'Austrian',
        paintings: [
          {
            id: 'the-kiss',
            name: 'The Kiss',
            asset: require('./paintings/the-kiss.jpg'),
            year: 1908,
          },
        ],
      },
    ],
  },
  {
    id: 'fauvism',
    name: 'Fauvism',
    painters: [
      {
        id: 'matisse',
        name: 'Henri Matisse',
        nationality: 'French',
        paintings: [
          {
            id: 'the-dance',
            name: 'The Dance',
            asset: require('./paintings/the-dance.jpg'),
            year: 1910,
          },
          {
            id: 'the-music',
            name: 'The Music',
            asset: require('./paintings/the-music.jpg'),
            year: 1910,
          },
        ],
      },
    ],
  },
  {
    id: 'expressionism',
    name: 'Expressionism',
    painters: [
      {
        id: 'munch',
        name: 'Edvard Munch',
        nationality: 'Norwegian',
        paintings: [
          {
            id: 'the-scream',
            name: 'The Scream',
            asset: require('./paintings/the-scream.jpg'),
            year: 1893,
          },
        ],
      },
    ],
  },
  {
    id: 'surrealism',
    name: 'Surrealism',
    painters: [
      {
        id: 'magritte',
        name: 'René Magritte',
        nationality: 'Belgian',
        paintings: [
          {
            id: 'the-lovers',
            name: 'The Lovers',
            asset: require('./paintings/the-lovers.jpg'),
            year: 1928,
          },
        ],
      },
      {
        id: 'dali',
        name: 'Salvador Dalí',
        nationality: 'Spanish',
        paintings: [
          {
            id: 'persistence-of-memory',
            name: 'The Persistence of Memory',
            asset: require('./paintings/persistence-of-memory.jpg'),
            year: 1931,
          },
        ],
      },
    ],
  },
  {
    id: 'american-realism',
    name: 'American Realism',
    painters: [
      {
        id: 'hopper',
        name: 'Edward Hopper',
        nationality: 'American',
        paintings: [
          {
            id: 'nighthawks',
            name: 'Nighthawks',
            asset: require('./paintings/nighthawks.jpg'),
            year: 1942,
          },
          {
            id: 'morning-sun',
            name: 'Morning Sun',
            asset: require('./paintings/morning-sun.jpg'),
            year: 1952,
          },
        ],
      },
    ],
  },
  {
    id: 'ukiyo-e',
    name: 'Ukiyo-e',
    painters: [
      {
        id: 'hokusai',
        name: 'Katsushika Hokusai',
        nationality: 'Japanese',
        paintings: [
          {
            id: 'the-great-wave',
            name: 'The Great Wave off Kanagawa',
            asset: require('./paintings/the-great-wave.jpg'),
            year: 1831,
          },
        ],
      },
    ],
  },
];

// Flat list of all painters
export const PAINTERS = ART_MOVEMENTS.flatMap(movement => movement.painters);

// Flat list of all paintings for easy lookup
export const PAINTINGS = PAINTERS.flatMap(painter => painter.paintings);

// Get painting by ID
export function getPaintingById(id: string): Painting | undefined {
  return PAINTINGS.find(p => p.id === id);
}

// Get painter for a painting
export function getPainterForPainting(paintingId: string): Painter | undefined {
  return PAINTERS.find(painter =>
    painter.paintings.some(p => p.id === paintingId),
  );
}

// Get movement for a painting
export function getMovementForPainting(
  paintingId: string,
): ArtMovement | undefined {
  return ART_MOVEMENTS.find(movement =>
    movement.painters.some(painter =>
      painter.paintings.some(p => p.id === paintingId),
    ),
  );
}
