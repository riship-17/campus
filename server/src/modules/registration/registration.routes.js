import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { myRegistrationsSchema } from './registration.schema.js';
import * as controller from './registration.controller.js';

export const meRouter = Router();

meRouter.get(
  '/registrations',
  authenticate,
  validate({ query: myRegistrationsSchema }),
  controller.listMine
);
