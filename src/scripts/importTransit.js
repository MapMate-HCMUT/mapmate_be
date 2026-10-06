// Nhập dữ liệu giao thông công cộng TP.HCM (xe buýt, Metro số 1, buýt đường sông) từ API công khai của buyttphcm.com.vn.
// Chạy: npm run transit:import -- [--dry-run] [--refresh]
//   --dry-run  chỉ tải + thống kê, không ghi DB
//   --refresh  bỏ qua cache data/transit/cache (mặc định dùng lại phản hồi tải trong 7 ngày)
// Lần đầu ~1.600 request (~15–20 phút, 2 request/giây). Nên chạy lại hằng tuần (tuyến / giờ chạy thay đổi).
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { isPublicRoute, modeOfRouteNo } from '../constants/transit.js';
import TransitRoute from '../models/TransitRoute.model.js';
import TransitStop from '../models/TransitStop.model.js';
import { projectStopsOnPath } from '../services/transit/transitGeometry.js';
import { createImportClient } from '../services/transit/transitSource.js';

const dryRun = process.argv.includes('--dry-run');
const client = createImportClient({ refresh: process.argv.includes('--refresh') });
const api = (path) => client.get(`/businfo/${path}`);

// "<br/>&nbsp;- Vé lượt: 6,000 VNĐ<br/>..." -> ['Vé lượt: 6,000 VNĐ', ...]
const parseTickets = (html) =>
  String(html ?? '')
    .split(/<br\s*\/?>/i)
    .map((line) => line.replace(/&nbsp;?/g, ' ').replace(/<[^>]+>/g, '').replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
const cleanText = (value) => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/¿/g, '').replace(/\s+/g, ' ').trim();
const parseDays = (value) => String(value ?? '').split(',').map((day) => day.trim()).filter(Boolean);

const stopsById = new Map();
const rememberStop = (stop, mode, routeNo) => {
  const existing = stopsById.get(stop.StopId);
  if (existing) {
    existing.modes.add(mode);
    existing.route_numbers.add(routeNo);
    return;
  }
  stopsById.set(stop.StopId, {
    stop_id: stop.StopId,
    code: stop.Code ?? null,
    name: cleanText(stop.Name),
    stop_type: stop.StopType ?? null,
    address: cleanText([stop.AddressNo, stop.Street].filter(Boolean).join(', ')),
    street: cleanText(stop.Street),
    ward: stop.Ward ?? null,
    zone: stop.Zone ?? null,
    wheelchair: stop.SupportDisability ? stop.SupportDisability === 'Có' : null,
    location: { type: 'Point', coordinates: [stop.Lng, stop.Lat] },
    route_numbers: new Set([...String(stop.Routes ?? '').split(',').map((no) => no.trim()).filter(Boolean), routeNo]),
    modes: new Set([mode]),
    active: true,
  });
};

const importVariant = async (route, variant, mode, timetables) => {
  const [stops, rawPath] = await Promise.all([api(`getstopsbyvar/${route.RouteId}/${variant.RouteVarId}`), api(`getpathsbyvar/${route.RouteId}/${variant.RouteVarId}`)]);
  const validStops = (stops ?? []).filter((stop) => Number.isFinite(stop.Lng) && Number.isFinite(stop.Lat));
  if (validStops.length < 2) return null;
  validStops.forEach((stop) => rememberStop(stop, mode, route.RouteNo));
  const stopPoints = validStops.map((stop) => [stop.Lng, stop.Lat]);
  const path = rawPath?.lat?.length ? rawPath.lat.map((lat, i) => [rawPath.lng[i], lat]) : stopPoints; // thiếu đường đi => nối các trạm
  const { offsets, indices } = projectStopsOnPath(path, stopPoints);
  return {
    var_id: variant.RouteVarId,
    name: cleanText(variant.RouteVarName),
    short_name: cleanText(variant.RouteVarShortName),
    outbound: Boolean(variant.Outbound),
    start_stop: cleanText(variant.StartStop),
    end_stop: cleanText(variant.EndStop),
    distance_m: Math.round(variant.Distance ?? offsets.at(-1) ?? 0),
    running_min: Number(variant.RunningTime) || null,
    stop_ids: validStops.map((stop) => stop.StopId),
    stop_offsets_m: offsets,
    stop_path_index: indices,
    path,
    timetables: timetables.filter((tt) => tt.var_id === variant.RouteVarId).map(({ var_id: _v, ...tt }) => tt),
  };
};

// Giờ xuất bến của các lịch đang áp dụng (mỗi lượt có thể có lịch ngày thường / cuối tuần riêng)
const importTimetables = async (route) => {
  const all = (await api(`gettimetablebyroute/${route.RouteId}`)) ?? [];
  const current = all.some((tt) => tt.IsCurrent) ? all.filter((tt) => tt.IsCurrent) : all;
  const result = [];
  for (const tt of current) {
    const trips = (await api(`gettripsbytimetable/${route.RouteId}/${tt.TimeTableId}`)) ?? [];
    result.push({
      var_id: tt.RouteVarId,
      apply_days: parseDays(tt.ApplyDates),
      departures: [...new Set(trips.map((trip) => trip.StartTime).filter((time) => /^\d{1,2}:\d{2}$/.test(time ?? '')))].sort(),
      headway_text: tt.Headway ?? null,
      operation_time: tt.OperationTime ?? null,
    });
  }
  return result;
};

const importRoute = async (summary) => {
  const route = (await api(`getroutebyid/${summary.RouteId}`)) ?? summary;
  const mode = modeOfRouteNo(route.RouteNo);
  const [variants, timetables] = await Promise.all([api(`getvarsbyroute/${route.RouteId}`), importTimetables(route)]);
  const imported = [];
  for (const variant of variants ?? []) {
    const result = await importVariant(route, variant, mode, timetables);
    if (result) imported.push(result);
  }
  return {
    route_id: route.RouteId,
    number: route.RouteNo,
    name: cleanText(route.RouteName),
    mode,
    is_public: isPublicRoute(route.RouteNo, route.Type),
    color: route.Color ?? null,
    type: route.Type ?? null,
    operator: cleanText(route.Orgs),
    distance_m: Math.round(route.Distance ?? 0),
    trip_minutes: route.TimeOfTrip ?? null,
    headway_text: route.Headway ?? null,
    operation_time: route.OperationTime ?? null,
    tickets: parseTickets(route.Tickets),
    variants: imported,
    active: imported.length > 0,
    imported_at: new Date(),
  };
};

console.log('1. Danh sách tuyến…');
const summaries = (await api('getallroute')) ?? [];
console.log(`   ${summaries.length} tuyến`);
console.log('2. Lượt, trạm, lộ trình, giờ xuất bến từng tuyến…');
const routes = [];
const failed = [];
for (const [index, summary] of summaries.entries()) {
  try {
    routes.push(await importRoute(summary));
  } catch (error) {
    failed.push(`${summary.RouteNo}: ${error.message}`);
  }
  if ((index + 1) % 10 === 0 || index === summaries.length - 1) console.log(`   ${index + 1}/${summaries.length} tuyến · ${client.stats.requests} request, ${client.stats.cached} từ cache`);
}

const stops = [...stopsById.values()].map((stop) => ({ ...stop, route_numbers: [...stop.route_numbers].sort(), modes: [...stop.modes] }));
const byMode = routes.reduce((acc, route) => ({ ...acc, [route.mode]: (acc[route.mode] ?? 0) + 1 }), {});
const withTimes = routes.filter((route) => route.variants.some((variant) => variant.timetables.some((tt) => tt.departures.length))).length;
console.log('3. Kết quả:', { routes: routes.length, by_mode: byMode, school_routes: routes.filter((r) => !r.is_public).length, with_departures: withTimes, stops: stops.length, failed: failed.length });
if (failed.length) console.log('   Lỗi:', failed.slice(0, 10).join(' · '));

if (!dryRun) {
  await connectDB();
  await Promise.all([TransitRoute.syncIndexes(), TransitStop.syncIndexes()]);
  await TransitRoute.bulkWrite(routes.map((route) => ({ updateOne: { filter: { route_id: route.route_id }, update: { $set: route }, upsert: true } })));
  await TransitStop.bulkWrite(stops.map((stop) => ({ updateOne: { filter: { stop_id: stop.stop_id }, update: { $set: stop }, upsert: true } })));
  // Tuyến / trạm không còn trong danh sách => ngừng gợi ý (không xoá)
  const retiredRoutes = await TransitRoute.updateMany({ route_id: { $nin: routes.map((route) => route.route_id) } }, { $set: { active: false } });
  const retiredStops = await TransitStop.updateMany({ stop_id: { $nin: stops.map((stop) => stop.stop_id) } }, { $set: { active: false } });
  console.log(`✅ Đã lưu ${routes.length} tuyến, ${stops.length} trạm · ngừng: ${retiredRoutes.modifiedCount} tuyến, ${retiredStops.modifiedCount} trạm`);
  await mongoose.disconnect();
} else console.log('🔍 [DRY RUN — không ghi DB]');
