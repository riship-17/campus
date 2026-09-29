export const ROLES = Object.freeze({
  STUDENT: 'STUDENT',
  CLUB_REP: 'CLUB_REP',
  ADMIN: 'ADMIN',
});

export const ROLE_VALUES = Object.values(ROLES);

export const USER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
});

export const USER_STATUS_VALUES = Object.values(USER_STATUS);

/** Departments offered on campus — used for event eligibility filters from Phase 2 onward. */
export const DEPARTMENTS = Object.freeze([
  'Computer Science & Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Aerospace Engineering',
  'Metallurgical Engineering & Materials Science',
  'Engineering Physics',
  'Mathematics & Computing',
  'Energy Science & Engineering',
  'Biosciences & Bioengineering',
  'Industrial Design Centre',
  'Humanities & Social Sciences',
]);

export const MAX_ACADEMIC_YEAR = 5;

/** Five failures buys a 15 minute cool-down. Long enough to stop a script, short enough to forgive a typo. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;
