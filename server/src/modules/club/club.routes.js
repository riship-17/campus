import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import {
  authenticate,
  authorize,
  optionalAuth,
  requireVerifiedEmail,
} from '../../middleware/auth.js';
import { ROLES } from '../user/user.constants.js';
import * as controller from './club.controller.js';
import {
  clubIdParams,
  clubSlugParams,
  createClubSchema,
  listClubsSchema,
  setClubStatusSchema,
  setRepsSchema,
  updateClubSchema,
} from './club.schema.js';
import { clubEventsSchema } from '../event/event.schema.js';

export const clubRouter = Router();

// Clubs I convene — declared before /:slug so it is not swallowed by the slug route.
clubRouter.get('/mine', authenticate, authorize(ROLES.CLUB_REP, ROLES.ADMIN), controller.myClubs);

clubRouter.get('/', optionalAuth, validate({ query: listClubsSchema }), controller.list);
clubRouter.get('/:slug', optionalAuth, validate({ params: clubSlugParams }), controller.getBySlug);

clubRouter.post(
  '/',
  authenticate,
  authorize(ROLES.ADMIN),
  validate({ body: createClubSchema }),
  controller.create
);

// A convener may edit their own club; the ownership check lives in the service.
clubRouter.patch(
  '/:id',
  authenticate,
  authorize(ROLES.CLUB_REP, ROLES.ADMIN),
  validate({ params: clubIdParams, body: updateClubSchema }),
  controller.update
);

clubRouter.put(
  '/:id/reps',
  authenticate,
  authorize(ROLES.ADMIN),
  validate({ params: clubIdParams, body: setRepsSchema }),
  controller.setReps
);

clubRouter.patch(
  '/:id/status',
  authenticate,
  authorize(ROLES.ADMIN),
  validate({ params: clubIdParams, body: setClubStatusSchema }),
  controller.setStatus
);

clubRouter.post(
  '/:id/follow',
  authenticate,
  requireVerifiedEmail,
  validate({ params: clubIdParams }),
  controller.follow
);

clubRouter.delete(
  '/:id/follow',
  authenticate,
  validate({ params: clubIdParams }),
  controller.unfollow
);

/**
 * A club's own register, drafts included. Separate from `GET /events?clubId=` so the
 * ownership check is unmissable rather than a branch inside a listing filter.
 */
clubRouter.get(
  '/:id/events',
  authenticate,
  authorize(ROLES.CLUB_REP, ROLES.ADMIN),
  validate({ params: clubIdParams, query: clubEventsSchema }),
  controller.listEvents
);
