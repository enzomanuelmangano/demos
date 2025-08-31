export type ProfileType = {
  name: string;
  location: string;
  trips: number;
  reviews: number;
  yearsOnAirbnb: number;
  birthDecade: string;
  languages: string[];
  isIdentityVerified: boolean;
  visitedPlaces: {
    name: string;
    country: string;
    code: string;
    visitDate: string;
  }[];
};
