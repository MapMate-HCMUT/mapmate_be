// Tải địa điểm đi chơi ở TP.HCM từ OpenStreetMap (qua Overpass API) -> data/open/osm_hcmc.json
// Chạy: npm run places:fetch-osm   (~2 MB, vài giây; không cần API key)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { OPEN_DATA_BBOX, OPEN_DATA_FILES, OVERPASS_TIMEOUT_SECONDS, OVERPASS_URL } from '../constants/openData.js';
import { OSM_TAG_FILTERS } from './openData/placeKinds.js';

const { south, west, north, east } = OPEN_DATA_BBOX;
const bbox = `${south},${west},${north},${east}`;
const query = `[out:json][timeout:${OVERPASS_TIMEOUT_SECONDS}];
(
${OSM_TAG_FILTERS.map(([key, values]) => `  nwr["${key}"~"^(${values.join('|')})$"](${bbox});`).join('\n')}
);
out center tags;`;

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 20000;
const BUSY_STATUSES = new Set([429, 502, 503, 504]); // máy chủ công cộng hay quá tải => chờ rồi thử lại

const requestOverpass = () =>
  fetch(OVERPASS_URL, {
    method: 'POST',
    // Overpass từ chối request không có User-Agent / Accept (HTTP 406)
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'MapMate/1.0 (HCMUT student project)' },
    body: new URLSearchParams({ data: query }),
  });

let response;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  response = await requestOverpass();
  if (!BUSY_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) break;
  console.warn(`⏳ Overpass bận (HTTP ${response.status}), thử lại sau ${RETRY_DELAY_MS / 1000}s (lần ${attempt}/${MAX_ATTEMPTS - 1})...`);
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
}
if (!response.ok) throw new Error(`Overpass trả về HTTP ${response.status}. Thử lại sau vài phút.`);

const body = await response.text();
await mkdir(dirname(OPEN_DATA_FILES.osm), { recursive: true });
await writeFile(OPEN_DATA_FILES.osm, body);
console.log(`✅ Đã lưu ${JSON.parse(body).elements.length} địa điểm OSM vào ${OPEN_DATA_FILES.osm}`);
