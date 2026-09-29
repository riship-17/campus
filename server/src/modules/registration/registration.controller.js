import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respond.js';
import * as registrationService from './registration.service.js';

export const listMine = asyncHandler(async (req, res) => {
  const { data, meta } = await registrationService.listMyRegistrations(req.user, req.query);
  return ok(res, data, meta);
});
