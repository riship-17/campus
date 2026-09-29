export const CLUB_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
});

export const CLUB_STATUS_VALUES = Object.values(CLUB_STATUS);

/** The council a club reports to. Drives colour coding and the admin's approval queue. */
export const CLUB_CATEGORIES = Object.freeze([
  'Technical',
  'Cultural',
  'Literary',
  'Sports',
  'Academic',
  'Social Service',
  'Entrepreneurship',
]);
