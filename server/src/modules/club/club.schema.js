import { z } from 'zod';
import { CLUB_CATEGORIES, CLUB_STATUS_VALUES } from './club.constants.js';
import { paginationFields } from '../../utils/pagination.js';

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, 'That identifier is not valid.');

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{2,80}$/, 'That address is not valid.');

export const listClubsSchema = z
  .object({
    ...paginationFields,
    category: z.enum(CLUB_CATEGORIES).optional(),
    q: z.string().trim().min(1).max(80).optional(),
    status: z.enum(CLUB_STATUS_VALUES).optional(),
    followedByMe: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

export const clubSlugParams = z.object({ slug }).strict();
export const clubIdParams = z.object({ id: objectId }).strict();

export const createClubSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the club a name.').max(90),
    description: z.string().trim().min(20, 'Write at least a couple of sentences.').max(1200),
    shortDescription: z.string().trim().max(200).optional(),
    category: z.enum(CLUB_CATEGORIES),
    logoUrl: z.string().trim().url('Enter a valid URL.').max(500).optional(),
    room: z.string().trim().max(120).optional(),
    contactEmail: z.string().trim().toLowerCase().email().max(160).optional(),
    foundedYear: z.coerce.number().int().min(1958).max(new Date().getFullYear()).optional(),
    repIds: z.array(objectId).max(10).optional(),
  })
  .strict();

/**
 * Note what is absent: `status`, `followersCount`, `reps`. Status moves through the admin
 * approval endpoints and reps through PUT /clubs/:id/reps, so a club rep editing their own
 * page cannot approve themselves or add a friend.
 */
export const updateClubSchema = z
  .object({
    name: z.string().trim().min(2).max(90).optional(),
    description: z.string().trim().min(20).max(1200).optional(),
    shortDescription: z.string().trim().max(200).optional(),
    category: z.enum(CLUB_CATEGORIES).optional(),
    logoUrl: z.string().trim().url().max(500).optional(),
    room: z.string().trim().max(120).optional(),
    contactEmail: z.string().trim().toLowerCase().email().max(160).optional(),
    foundedYear: z.coerce.number().int().min(1958).max(new Date().getFullYear()).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

export const setRepsSchema = z.object({ repIds: z.array(objectId).max(10) }).strict();

export const setClubStatusSchema = z.object({ status: z.enum(CLUB_STATUS_VALUES) }).strict();
