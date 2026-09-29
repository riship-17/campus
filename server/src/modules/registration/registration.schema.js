import { z } from 'zod';
import { REGISTRATION_STATUS_VALUES } from './registration.constants.js';
import { paginationFields } from '../../utils/pagination.js';

export const myRegistrationsSchema = z
  .object({
    ...paginationFields,
    status: z.enum(REGISTRATION_STATUS_VALUES).optional(),
    when: z.enum(['upcoming', 'past', 'all']).default('all'),
  })
  .strict();

export const eventRegistrationsSchema = z
  .object({
    ...paginationFields,
    status: z.enum(REGISTRATION_STATUS_VALUES).optional(),
    q: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
