import { addDays, format } from 'date-fns';

import {
  ContributionData,
  ContributionLevel,
} from './contribution-calendar/types';
import { getDateRange } from './contribution-calendar/utils/date-utils';

export const generateContributionData = ({
  days,
  endDate = new Date(),
}: {
  days: number;
  endDate?: Date;
}): ContributionData => {
  const { startDate } = getDateRange(endDate, days);
  const data: ContributionData = {};

  for (let i = 0; i < days; i++) {
    const currentDate = addDays(startDate, i);
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const contributionLevel = Math.floor(
      Math.random() * 5,
    ) as ContributionLevel;
    data[dateStr] = contributionLevel;
  }

  return data;
};
