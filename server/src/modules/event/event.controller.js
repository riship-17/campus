import { asyncHandler } from '../../utils/asyncHandler.js';
import { created, ok } from '../../utils/respond.js';
import * as eventService from './event.service.js';
import * as registrationService from '../registration/registration.service.js';

export const list = asyncHandler(async (req, res) => {
  const { data, meta } = await eventService.listEvents(req.query, req.user);
  return ok(res, data, meta);
});

export const getBySlug = asyncHandler(async (req, res) =>
  ok(res, await eventService.getEventBySlug(req.params.slug, req.user))
);

export const create = asyncHandler(async (req, res) =>
  created(res, await eventService.createEvent(req.body, req.user, req))
);

export const update = asyncHandler(async (req, res) => {
  const event = await eventService.updateEvent(req.params.id, req.body, req.user, req);

  // Raising capacity should let the queue in, not leave seats empty next to a waitlist.
  if (req.body.capacity !== undefined) {
    const filled = await registrationService.fillSeatsFromWaitlist(req.params.id);
    if (filled) return ok(res, { ...event, promotedFromWaitlist: filled });
  }

  return ok(res, event);
});

export const publish = asyncHandler(async (req, res) =>
  ok(res, await eventService.publishEvent(req.params.id, req.user, req))
);

export const approve = asyncHandler(async (req, res) =>
  ok(res, await eventService.approveEvent(req.params.id, req.body, req.user, req))
);

export const cancel = asyncHandler(async (req, res) =>
  ok(res, await eventService.cancelEvent(req.params.id, req.body.reason, req.user, req))
);

export const register = asyncHandler(async (req, res) =>
  created(res, await registrationService.registerForEvent(req.params.id, req.user, req))
);

export const cancelRegistration = asyncHandler(async (req, res) =>
  ok(res, await registrationService.cancelRegistration(req.params.id, req.user, req))
);

export const listRegistrations = asyncHandler(async (req, res) => {
  const { data, meta } = await registrationService.listEventRegistrations(
    req.params.id,
    req.query,
    req.user
  );
  return ok(res, data, meta);
});

export const exportRegistrations = asyncHandler(async (req, res) => {
  const { filename, body } = await registrationService.exportEventRegistrationsCsv(
    req.params.id,
    req.user,
    req
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  // `filename` is derived from our own slug, so it cannot carry a header-splitting payload.
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(body);
});
