import { z } from 'zod';
import { DEPARTMENTS } from '../auth/auth.schemas.js';

export const EVENT_CATEGORIES = [
  'Workshop',
  'Competition',
  'Talk',
  'Screening',
  'Performance',
  'Hackathon',
  'Sports Fixture',
  'Meetup',
];

/**
 * Mirrors the server's create/update schema. Datetime inputs give us
 * "2026-11-14T16:00" with no zone, which the browser reads as local time — and local time
 * on a campus machine is IST, which is what the convener means.
 */
const localDateTime = z
  .string()
  .min(1, 'Pick a date and time.')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'That is not a valid date and time.');

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(4, 'Give it a title people will recognise.').max(160),
    summary: z.string().trim().max(280).optional().or(z.literal('')),
    description: z.string().trim().min(20, 'Say what happens, and what to bring.').max(20_000),
    category: z.enum(EVENT_CATEGORIES, { errorMap: () => ({ message: 'Pick a category.' }) }),
    venue: z.string().trim().min(2, 'Where is it?').max(200),
    startAt: localDateTime,
    endAt: localDateTime,
    registrationDeadline: localDateTime,
    reportingTime: z.string().optional().or(z.literal('')),
    capacity: z.coerce.number().int().min(1, 'At least one seat.').max(5000),
    waitlistEnabled: z.boolean(),
    requireFeedbackForCertificate: z.boolean(),
    prerequisites: z.string().trim().max(600).optional().or(z.literal('')),
    eligibilityYears: z.array(z.number().int().min(1).max(5)),
    eligibilityDepartments: z.array(z.enum(DEPARTMENTS)),
  })
  .refine((value) => new Date(value.endAt) > new Date(value.startAt), {
    path: ['endAt'],
    message: 'The end time has to be after the start time.',
  })
  .refine((value) => new Date(value.registrationDeadline) <= new Date(value.startAt), {
    path: ['registrationDeadline'],
    message: 'Registration has to close by the time the event starts.',
  })
  .refine(
    (value) => !value.reportingTime || new Date(value.reportingTime) <= new Date(value.startAt),
    { path: ['reportingTime'], message: 'Reporting time cannot be after the start.' }
  );

/** Form shape → API shape. Empty strings become omitted fields, not empty values. */
export function toApiPayload(values) {
  const optional = (value) => (value && String(value).trim() ? String(value).trim() : undefined);

  return {
    title: values.title.trim(),
    summary: optional(values.summary),
    description: values.description.trim(),
    category: values.category,
    venue: values.venue.trim(),
    startAt: new Date(values.startAt).toISOString(),
    endAt: new Date(values.endAt).toISOString(),
    registrationDeadline: new Date(values.registrationDeadline).toISOString(),
    reportingTime: values.reportingTime ? new Date(values.reportingTime).toISOString() : undefined,
    capacity: values.capacity,
    waitlistEnabled: values.waitlistEnabled,
    requireFeedbackForCertificate: values.requireFeedbackForCertificate,
    prerequisites: optional(values.prerequisites),
    eligibility: {
      years: values.eligibilityYears,
      departments: values.eligibilityDepartments,
    },
  };
}

/** ISO string → the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in local time. */
export function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
