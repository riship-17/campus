import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import {
  authenticate,
  authorize,
  optionalAuth,
  requireVerifiedEmail,
} from '../../middleware/auth.js';
import { ROLES } from '../user/user.constants.js';
import * as controller from './event.controller.js';
import {
  approveEventSchema,
  cancelEventSchema,
  createEventSchema,
  eventIdParams,
  eventSlugParams,
  listEventsSchema,
  updateEventSchema,
} from './event.schema.js';
import { eventRegistrationsSchema } from '../registration/registration.schema.js';

export const eventRouter = Router();

/* ----------------------------------------------------------------- discovery */

eventRouter.get('/', optionalAuth, validate({ query: listEventsSchema }), controller.list);

eventRouter.get(
  '/:slug',
  optionalAuth,
  validate({ params: eventSlugParams }),
  controller.getBySlug
);

/* -------------------------------------------------------------- registration */

/**
 * Registering requires a confirmed college address. The rule lives here rather than in the
 * service so it reads as policy, and so a future admin-side "register on behalf of" endpoint
 * can opt out of it deliberately rather than by accident.
 */
eventRouter.post(
  '/:id/register',
  authenticate,
  requireVerifiedEmail,
  validate({ params: eventIdParams }),
  controller.register
);

eventRouter.delete(
  '/:id/register',
  authenticate,
  validate({ params: eventIdParams }),
  controller.cancelRegistration
);

/* ------------------------------------------------------------- club managemen */

eventRouter.post(
  '/',
  authenticate,
  authorize(ROLES.CLUB_REP, ROLES.ADMIN),
  validate({ body: createEventSchema }),
  controller.create
);

eventRouter.patch(
  '/:id',
  authenticate,
  authorize(ROLES.CLUB_REP, ROLES.ADMIN),
  validate({ params: eventIdParams, body: updateEventSchema }),
  controller.update
);

eventRouter.post(
  '/:id/publish',
  authenticate,
  authorize(ROLES.CLUB_REP, ROLES.ADMIN),
  validate({ params: eventIdParams }),
  controller.publish
);

eventRouter.post(
  '/:id/cancel',
  authenticate,
  authorize(ROLES.CLUB_REP, ROLES.ADMIN),
  validate({ params: eventIdParams, body: cancelEventSchema }),
  controller.cancel
);

eventRouter.patch(
  '/:id/approve',
  authenticate,
  authorize(ROLES.ADMIN),
  validate({ params: eventIdParams, body: approveEventSchema }),
  controller.approve
);

eventRouter.get(
  '/:id/registrations',
  authenticate,
  authorize(ROLES.CLUB_REP, ROLES.ADMIN),
  validate({ params: eventIdParams, query: eventRegistrationsSchema }),
  controller.listRegistrations
);

eventRouter.get(
  '/:id/registrations.csv',
  authenticate,
  authorize(ROLES.CLUB_REP, ROLES.ADMIN),
  validate({ params: eventIdParams }),
  controller.exportRegistrations
);
