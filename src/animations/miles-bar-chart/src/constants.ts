import { startOfWeek } from 'date-fns';

// Calculate the date of the Monday from three weeks ago
const mondayFromThreeWeeksAgo = startOfWeek(
  new Date().getTime() - 86400000 * 21, // Subtract 21 days (3 weeks) in milliseconds from the current date
  {
    weekStartsOn: 1, // Set the week to start on Monday (1)
  },
);

// Generate data for a 7x7 grid (7 weeks, 7 days each)
export const data = new Array(7).fill(null).map((_, weekIndex) => {
  return new Array(7).fill(null).map((__, dayIndex) => {
    // Calculate the date for each day in the grid
    const day = new Date(
      mondayFromThreeWeeksAgo.getTime() + 86400000 * (weekIndex * 7 + dayIndex), // Add the corresponding number of days in milliseconds
    );

    // Generate a random value for each day
    const value = Math.random();

    // Return an object containing the date and random value
    return {
      day: day,
      value: value,
    };
  });
});

/*
Example of a resulting object in the 'data' array:
[
  [
    { day: 2024-06-24T00:00:00.000Z, value: 0.123456789 }, // Monday of the first week
    { day: 2024-06-25T00:00:00.000Z, value: 0.987654321 }, // Tuesday of the first week
    { day: 2024-06-26T00:00:00.000Z, value: 0.456789123 }, // Wednesday of the first week
    { day: 2024-06-27T00:00:00.000Z, value: 0.654321987 }, // Thursday of the first week
    { day: 2024-06-28T00:00:00.000Z, value: 0.789123456 }, // Friday of the first week
    { day: 2024-06-29T00:00:00.000Z, value: 0.321987654 }, // Saturday of the first week
    { day: 2024-06-30T00:00:00.000Z, value: 0.987654321 }, // Sunday of the first week
  ],
  [
    { day: 2024-07-01T00:00:00.000Z, value: 0.123456789 }, // Monday of the second week
    // ... (similar objects for each day of the second week)
  ],
  // ... (similar arrays for each subsequent week)
]
*/
