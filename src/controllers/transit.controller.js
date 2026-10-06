import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { getWalkPath } from '../services/transit/walkPath.js';
import { getRouteDetail, getStopArrivals, getStopDetail, listRailLines, listRoutes, listStopsInBbox, planJourney, planTrip } from '../services/transit/transit.service.js';

export const getStops = asyncHandler(async (req, res) => sendSuccess(res, { data: await listStopsInBbox(req.validated.query) }));
export const getStop = asyncHandler(async (req, res) => sendSuccess(res, { data: await getStopDetail(req.validated.params.stopId) }));
export const getArrivals = asyncHandler(async (req, res) => sendSuccess(res, { data: await getStopArrivals(req.validated.params.stopId) }));
export const getRoutes = asyncHandler(async (_req, res) => sendSuccess(res, { data: await listRoutes() }));
export const getRoute = asyncHandler(async (req, res) => sendSuccess(res, { data: await getRouteDetail(req.validated.params.routeId) }));
export const getRailLines = asyncHandler(async (_req, res) => sendSuccess(res, { data: await listRailLines() }));
export const postPlan = asyncHandler(async (req, res) => sendSuccess(res, { data: await planJourney(req.validated.body) }));
export const postTripPlan = asyncHandler(async (req, res) => sendSuccess(res, { data: await planTrip(req.validated.body) }));
export const postWalkPath = asyncHandler(async (req, res) => sendSuccess(res, { data: await getWalkPath(req.validated.body.from, req.validated.body.to) }));
