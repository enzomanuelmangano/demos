const BestCuisine = 'Italian';

export const Cuisines = new Array(20).fill(BestCuisine).map((cuisine, i) => ({
  id: i,
  name: cuisine,
  selected: false,
}));
