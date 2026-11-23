import {
  addDays,
  eachDayOfInterval,
  format,
  startOfWeek,
  subDays,
} from 'date-fns';

export const generateDayLabels = (): string[] => {
  const today = new Date();
  const mondayOfWeek = startOfWeek(today, { weekStartsOn: 1 });

  return eachDayOfInterval({
    start: mondayOfWeek,
    end: addDays(mondayOfWeek, 6),
  }).map(date => format(date, 'EEE'));
};

export const getDateRange = (endDate: Date, days: number) => {
  const startDate = subDays(endDate, days - 1);
  return { startDate, endDate };
};

export const groupDaysIntoWeeks = (days: Date[]): Date[][] => {
  return days.reduce((acc, day, index) => {
    const weekIndex = Math.floor(index / 7);
    acc[weekIndex] = acc[weekIndex] || [];
    acc[weekIndex].push(day);
    return acc;
  }, [] as Date[][]);
};
