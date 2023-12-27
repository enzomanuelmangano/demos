type ListItem = {
  title: string;
};
type HeaderListItem = {
  header: string;
};

// So yes, I like gangster movies.
export const data = [
  {
    header: 'Robert De Niro',
  },
  {
    title: 'The Godfather',
  },
  {
    title: 'The Godfather: Part II',
  },
  {
    title: 'The Godfather: Part III',
  },
  {
    title: 'Goodfellas',
  },
  {
    title: 'Casino',
  },
  {
    title: 'The Irishman',
  },
  {
    header: 'Al Pacino',
  },
  {
    title: 'The Godfather',
  },
  {
    title: 'The Godfather: Part II',
  },
  {
    title: 'The Godfather: Part III',
  },
  {
    title: 'Scarface',
  },
  {
    title: 'Heat',
  },
  {
    header: 'Joe Pesci',
  },
  {
    title: 'Goodfellas',
  },
  {
    title: 'Casino',
  },
  {
    title: 'The Irishman',
  },
  {
    title: 'Home Alone',
  },
  {
    title: 'Home Alone 2: Lost in New York',
  },
  {
    header: 'Leonardo DiCaprio',
  },
  {
    title: 'The Wolf of Wall Street',
  },
  {
    title: 'The Departed',
  },
  {
    title: 'Shutter Island',
  },
  {
    title: 'Inception',
  },
  {
    title: 'Catch Me If You Can',
  },
  {
    header: 'Brad Pitt',
  },
  {
    title: 'Fight Club',
  },
  {
    title: 'Inglourious Basterds',
  },
  {
    title: 'Se7en',
  },
  {
    title: 'Once Upon a Time... in Hollywood',
  },
  {
    title: 'The Curious Case of Benjamin Button',
  },
] as (ListItem | HeaderListItem)[];

// Simple utility function to check if an item is a header or not.
export const isHeader = (item: ListItem | HeaderListItem) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Boolean((item as any)?.header);

export type { ListItem, HeaderListItem };
