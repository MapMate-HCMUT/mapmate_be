// Nhập địa điểm từ dữ liệu mở (Overture Maps + OpenStreetMap) vào collection `places`.
// Cần tải dữ liệu trước:  npm run places:fetch-overture  &&  npm run places:fetch-osm
// Chạy:                   npm run places:import -- [--dry-run] [--prune] [--min-confidence=0.75]
//   --prune: nơi không còn trong nguồn => xoá; nếu đang được ghim / đăng bài / có trong lộ trình thì chuyển "đã đóng cửa" (ẩn)
// Tự động hằng tháng: .github/workflows/refresh-places.yml
// Nhập lại nhiều lần được: cập nhật theo source_ref, không tạo trùng, không ghi đè rating / giá do cộng đồng sửa.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { DEFAULT_MIN_CONFIDENCE, IMPORT_BATCH_SIZE, OPEN_DATA_FILES, OPEN_DATA_SOURCES, PLACE_SOURCES } from '../constants/openData.js';
import Place from '../models/Place.model.js';
import { createDistrictInferer } from './openData/districts.js';
import { toPlaceDocument } from './openData/placeDocument.js';
import { PlaceMerger } from './openData/placeMerger.js';
import { pruneStalePlaces, reopenReturnedPlaces } from './openData/prunePlaces.js';
import { readOsm, readOverture } from './openData/readers.js';

const REPORT_FILE = 'data/open/import-report.json';
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const prune = args.includes('--prune');
const minConfidence = Number(args.find((arg) => arg.startsWith('--min-confidence='))?.split('=')[1] ?? DEFAULT_MIN_CONFIDENCE);

const countBy = (items, pick) => Object.fromEntries([...Map.groupBy(items, pick)].map(([key, group]) => [key, group.length]).sort((a, b) => b[1] - a[1]));

for (const [name, file] of Object.entries(OPEN_DATA_FILES)) {
  if (!existsSync(file)) throw new Error(`Thiếu ${file}. Chạy "npm run places:fetch-${name}" trước.`);
}

await connectDB();
const startedAt = Date.now();
const merger = new PlaceMerger();

// 1. Địa điểm MapMate đã có (nhóm tự nhập) => chặn trùng, giữ nguyên bản của nhóm.
const curated = await Place.find({ source: { $nin: OPEN_DATA_SOURCES } }, { name: 1, location: 1, district: 1, category: 1 }).lean();
curated.forEach((place) => merger.add({ name: place.name, category: place.category, coordinates: place.location.coordinates, district: place.district }, { locked: true }));

// 2. Overture (bản có độ tin cậy cao làm gốc) -> 3. OSM bổ sung giờ mở cửa, món, và những nơi Overture không có.
const overtureStats = { read: 0, kept: 0, lowConfidence: 0, closed: 0, junk: 0 };
const overture = [];
for await (const record of readOverture(OPEN_DATA_FILES.overture, { minConfidence, stats: overtureStats })) overture.push(record);
overture.sort((a, b) => b.confidence - a.confidence).forEach((record) => merger.add(record));

const osmStats = { read: 0, kept: 0, junk: 0 };
(await readOsm(OPEN_DATA_FILES.osm, { stats: osmStats })).forEach((record) => merger.add(record));

// 4. Gán quận cho nơi thiếu địa chỉ dựa trên các địa điểm lân cận.
const knownDistricts = [...curated.map((place) => ({ coordinates: place.location.coordinates, district: place.district })), ...merger.places]
  .filter((place) => place.district);
const inferDistrict = createDistrictInferer(knownDistricts);
let inferredDistricts = 0;
merger.places.filter((place) => !place.district).forEach((place) => {
  place.district = inferDistrict(place.coordinates);
  if (place.district) inferredDistricts += 1;
});

const documents = merger.places.map(toPlaceDocument);
const sources = documents.map((doc) => doc.source);

// 5. Ghi vào DB theo lô.
let upserted = 0;
let modified = 0;
if (!dryRun) {
  await Place.createIndexes(); // chỉ TẠO index còn thiếu (source_ref unique...), không xoá index sẵn có
  for (let index = 0; index < documents.length; index += IMPORT_BATCH_SIZE) {
    const batch = documents.slice(index, index + IMPORT_BATCH_SIZE);
    const result = await Place.bulkWrite(
      batch.map(({ source, initial }) => ({
        updateOne: { filter: { source_ref: source.source_ref }, update: { $set: source, $setOnInsert: initial }, upsert: true },
      })),
      { ordered: false },
    );
    upserted += result.upsertedCount;
    modified += result.modifiedCount;
    process.stdout.write(`\r   Đã ghi ${Math.min(index + IMPORT_BATCH_SIZE, documents.length)}/${documents.length}`);
  }
  process.stdout.write('\n');
}
const keptRefs = sources.map((doc) => doc.source_ref);
const reopened = dryRun ? 0 : await reopenReturnedPlaces(keptRefs);
const pruned = !dryRun && prune ? await pruneStalePlaces(keptRefs) : null;

const report = {
  finished_at: new Date().toISOString(),
  duration_seconds: Math.round((Date.now() - startedAt) / 1000),
  database: mongoose.connection.name,
  dry_run: dryRun,
  min_confidence: minConfidence,
  input: { overture: overtureStats, osm: osmStats, curated_in_db: curated.length },
  merge: { ...merger.stats, inferred_districts: inferredDistricts },
  output: {
    total: documents.length,
    by_source: countBy(sources, (doc) => doc.source),
    merged_overture_osm: sources.filter((doc) => doc.source === PLACE_SOURCES.OVERTURE && doc.osm_ref).length,
    by_category: countBy(sources, (doc) => doc.category),
    with_opening_hours: sources.filter((doc) => doc.hours_known).length,
    with_district: sources.filter((doc) => doc.district).length,
    with_phone: sources.filter((doc) => doc.contact.phone).length,
    with_cuisine: sources.filter((doc) => doc.cuisines.length).length,
    by_district: countBy(sources, (doc) => doc.district || '(chưa rõ)'),
  },
  write: dryRun ? null : { upserted, modified, reopened, pruned },
};
await mkdir('data/open', { recursive: true });
await writeFile(REPORT_FILE, JSON.stringify(report, null, 2));

console.log(`${dryRun ? '🔍 [DRY RUN — không ghi DB]' : '✅'} ${documents.length} địa điểm (${report.duration_seconds}s) — chi tiết: ${REPORT_FILE}`);
console.log('   Theo loại:', report.output.by_category);
console.log('   Theo nguồn:', report.output.by_source, '· gộp Overture+OSM:', report.output.merged_overture_osm);
console.log(`   Có giờ mở cửa: ${report.output.with_opening_hours} · có quận: ${report.output.with_district} (đoán ${inferredDistricts}) · trùng dữ liệu nhóm: ${merger.stats.matchedCurated}`);
if (!dryRun) console.log(`   Thêm mới ${upserted}, cập nhật ${modified}${pruned ? ` · xoá ${pruned.deleted} nơi không còn trong nguồn, đánh dấu đóng cửa ${pruned.closed_in_use} nơi đang được dùng` : ''} · mở lại ${reopened}`);
await mongoose.disconnect();
