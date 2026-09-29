import { asyncHandler } from '../../utils/asyncHandler.js';
import { created, ok } from '../../utils/respond.js';
import * as clubService from './club.service.js';
import * as eventService from '../event/event.service.js';

export const list = asyncHandler(async (req, res) => {
  const { data, meta } = await clubService.listClubs(req.query, req.user);
  return ok(res, data, meta);
});

export const getBySlug = asyncHandler(async (req, res) =>
  ok(res, await clubService.getClubBySlug(req.params.slug, req.user))
);

export const create = asyncHandler(async (req, res) =>
  created(res, await clubService.createClub(req.body, req.user, req))
);

export const update = asyncHandler(async (req, res) =>
  ok(res, await clubService.updateClub(req.params.id, req.body, req.user, req))
);

export const setReps = asyncHandler(async (req, res) =>
  ok(res, await clubService.setClubReps(req.params.id, req.body.repIds, req.user, req))
);

export const setStatus = asyncHandler(async (req, res) =>
  ok(res, await clubService.setClubStatus(req.params.id, req.body.status, req.user, req))
);

export const follow = asyncHandler(async (req, res) =>
  ok(res, await clubService.followClub(req.params.id, req.user))
);

export const unfollow = asyncHandler(async (req, res) =>
  ok(res, await clubService.unfollowClub(req.params.id, req.user))
);

export const myClubs = asyncHandler(async (req, res) =>
  ok(res, await clubService.listClubsIManage(req.user))
);

export const listEvents = asyncHandler(async (req, res) => {
  const { data, meta } = await eventService.listClubEvents(req.params.id, req.query, req.user);
  return ok(res, data, meta);
});
