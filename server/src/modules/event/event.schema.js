import { z } from 'zod';
import { EVENT_CATEGORIES, EVENT_STATUS_VALUES, MAX_EVENT_CAPACITY } from './event.constants.js';
import { DEPARTMENTS, MAX_ACADEMIC_YEAR } from '../user/user.constants.js';
import { paginationFields } from '../../utils/pagination.js';

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, 'That identifier is not valid.');

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{2,90}$/, 'That address is not valid.');

const isoDate = z.coerce.date({ invalid_type_error: 'Enter a valid date and time.' });

const eligibility = z
  .object({
    years: z
      .array(z.coerce.number().int().min(1).max(MAX_ACADEMIC_YEAR))
      .max(MAX_ACADEMIC_YEAR)
      .default([]),
    departments: z.array(z.enum(DEPARTMENTS)).max(DEPARTMENTS.length).default([]),
  })
  .strict();

const eventBody = {
  title: z.string().trim().min(4, 'Give the event a title people will recognise.').max(160),
  description: z.string().trim().min(20, 'Say what happens, and what to bring.').max(20_000),
  summary: z.string().trim().max(280).optional(),
  category: z.enum(EVENT_CATEGORIES),
  venue: z.string().trim().min(2, 'Where is it?').max(200),
  startAt: isoDate,
  endAt: isoDate,
  registrationDeadline: isoDate,
  reportingTime: isoDate.optional(),
  capacity: z.coerce.number().int().min(1, 'At least one seat.').max(MAX_EVENT_CAPACITY),
  waitlistEnabled: z.coerce.boolean().default(true),
  eligibility: eligibility.optional(),
  requireFeedbackForCertificate: z.coerce.boolean().default(true),
  prerequisites: z.string().trim().max(600).optional(),
  bannerUrl: z.string().trim().url('Enter a valid URL.').max(500).optional(),
};

/**
 * Dates have to agree with each other, and the messages say which field to fix.
 * The same rules run again in the service on update, because a PATCH may change only one
 * side of a comparison.
 */
function applyDateRules(schema) {
  return schema
    .refine((value) => !value.endAt || !value.startAt || value.endAt > value.startAt, {
      path: ['endAt'],
      message: 'The end time has to be after the start time.',
    })
    .refine(
      (value) =>
        !value.registrationDeadline ||
        !value.startAt ||
        value.registrationDeadline <= value.startAt,
      {
        path: ['registrationDeadline'],
        message: 'Registration has to close by the time the event starts.',
      }
    )
    .refine(
      (value) => !value.reportingTime || !value.startAt || value.reportingTime <= value.startAt,
      { path: ['reportingTime'], message: 'Reporting time cannot be after the start time.' }
    );
}

export const createEventSchema = applyDateRules(
  z.object({ ...eventBody, clubId: objectId }).strict()
).refine((value) => value.startAt.getTime() > Date.now(), {
  path: ['startAt'],
  message: 'Pick a date in the future.',
});

export const updateEventSchema = applyDateRules(
  z
    .object(
      Object.fromEntries(
        Object.entries(eventBody).map(([key, schema]) => [
          key,
          schema instanceof z.ZodDefault ? schema.removeDefault().optional() : schema.optional(),
        ])
      )
    )
    .strict()
).refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

export const listEventsSchema = z
  .object({
    ...paginationFields,
    q: z.string().trim().min(1).max(120).optional(),
    category: z.enum(EVENT_CATEGORIES).optional(),
    club: slug.optional(),
    clubId: objectId.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    when: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
    hasSeats: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    openOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    eligibleForMe: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    status: z.enum(EVENT_STATUS_VALUES).optional(),
    sort: z.enum(['soonest', 'latest', 'seats', 'newest']).default('soonest'),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.to >= value.from, {
    path: ['to'],
    message: 'The end of the range has to be after the start.',
  });

/** The club desk's own register: every status, newest first. */
export const clubEventsSchema = z
  .object({
    ...paginationFields,
    status: z.enum(EVENT_STATUS_VALUES).optional(),
  })
  .strict();

export const eventSlugParams = z.object({ slug }).strict();
export const eventIdParams = z.object({ id: objectId }).strict();

export const cancelEventSchema = z
  .object({ reason: z.string().trim().min(5, 'Tell people why.').max(400) })
  .strict();

export const approveEventSchema = z
  .object({
    approved: z.boolean(),
    note: z.string().trim().max(400).optional(),
  })
  .strict();
