export const EVENT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
});

export const EVENT_STATUS_VALUES = Object.values(EVENT_STATUS);

/** Statuses a student may ever see in a listing. */
export const PUBLIC_EVENT_STATUSES = Object.freeze([
  EVENT_STATUS.PUBLISHED,
  EVENT_STATUS.COMPLETED,
]);

export const EVENT_CATEGORIES = Object.freeze([
  'Workshop',
  'Competition',
  'Talk',
  'Screening',
  'Performance',
  'Hackathon',
  'Sports Fixture',
  'Meetup',
]);

/**
 * Which transitions are legal. Enforced in the service so a rep cannot, for example,
 * un-cancel an event by PATCHing its status back to PUBLISHED.
 */
export const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  DRAFT: [EVENT_STATUS.PENDING_APPROVAL, EVENT_STATUS.CANCELLED],
  PENDING_APPROVAL: [EVENT_STATUS.PUBLISHED, EVENT_STATUS.DRAFT, EVENT_STATUS.CANCELLED],
  PUBLISHED: [EVENT_STATUS.CANCELLED, EVENT_STATUS.COMPLETED],
  CANCELLED: [],
  COMPLETED: [],
});

/** Only a DRAFT or PENDING_APPROVAL event can have its substance rewritten. */
export const EDITABLE_STATUSES = Object.freeze([EVENT_STATUS.DRAFT, EVENT_STATUS.PENDING_APPROVAL]);

export const MAX_EVENT_CAPACITY = 5000;
