import { MovieDetail } from './screens/movie-detail';

const title = 'Past Lives';
const description = `This heart-meltingly romantic and sad movie from Korean-Canadian dramatist and film-maker Celine Song left me wrung out and empty and weirdly euphoric, as if I’d lived through an 18-month affair in the course of an hour and three-quarters. How extraordinary to think that this is Song’s feature debut.\n\nIt’s delicate, sophisticated and yet also somehow simple, direct, even verging on the cheesy. Past Lives has been compared to the movies of Richard Linklater, Noah Baumbach and Greta Gerwig; all true, but I also found myself remembering the wrenching final moments of Wong Kar-wai’s In the Mood for Love, with Tony Leung murmuring his pain into a stone hollow in Angkor Wat and - yes - the gooey genius of Dean Friedman’s plaintive 1978 chart hit Lucky Stars.`;
const image =
  'https://media.vogue.fr/photos/6578745e1ccca711fa4f94fd/2:3/w_2240,c_limit/Past%20Lives_08%C2%A9Courtesy%20of%20A24.jpg';

const App = () => {
  return <MovieDetail title={title} description={description} image={image} />;
};

export { App };
