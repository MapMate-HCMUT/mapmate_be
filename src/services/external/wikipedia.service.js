// Wikipedia tiếng Việt — bối cảnh / lịch sử của 1 địa danh (KHÔNG dùng cho giờ mở cửa, giá vé).
// Chống nhầm bài: chỉ nhận bài có toạ độ cách địa điểm trong DB ≤ 500 m (tìm quanh toạ độ trước, rồi mới tìm theo tên).
// Lỗi mạng / không thấy => trả null, câu trả lời vẫn dựa trên dữ liệu MapMate.
import { EXTERNAL_TIMEOUT_MS, EXTERNAL_USER_AGENT, WIKIPEDIA, WIKIPEDIA_CATEGORIES, WIKIPEDIA_KINDS } from '../../constants/externalSources.js';
import { haversineKm } from '../../utils/geo.js';
import { createMemoryCache } from '../../utils/memoryCache.js';
import { normalizeSearchText } from '../../utils/text.js';

const METERS_PER_KM = 1000;
const NAME_MATCH_RATIO = 0.6;
const cache = createMemoryCache(WIKIPEDIA.CACHE_TTL_MS);

const getJson = async (url) => {
  const response = await fetch(url, { headers: { 'User-Agent': EXTERNAL_USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
  return response.json();
};

const apiUrl = (params) => `${WIKIPEDIA.API_URL}?${new URLSearchParams({ action: 'query', format: 'json', ...params })}`;

// Tên bài khớp tên địa điểm? (so không dấu, theo tỉ lệ từ trùng)
const nameMatches = (title, name) => {
  const a = normalizeSearchText(title);
  const b = normalizeSearchText(name);
  if (a.includes(b) || b.includes(a)) return true;
  const words = b.split(' ').filter(Boolean);
  return words.filter((word) => a.split(' ').includes(word)).length / words.length >= NAME_MATCH_RATIO;
};

const trimExtract = (text) => {
  if (text.length <= WIKIPEDIA.EXTRACT_MAX_LENGTH) return text;
  const cut = text.slice(0, WIKIPEDIA.EXTRACT_MAX_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf('. ') + 1, WIKIPEDIA.EXTRACT_MAX_LENGTH / 2))}…`;
};

const IN_HCMC = /(thanh pho ho chi minh|sai gon|tp\.? ?hcm)/;

// Bài có toạ độ => phải cách ≤ 500 m. Bài không có toạ độ => chỉ nhận khi tên trùng KHỚP HOÀN TOÀN và bài nói là ở TP.HCM.
const fetchSummary = async (title, place) => {
  const page = await getJson(`${WIKIPEDIA.SUMMARY_URL}${encodeURIComponent(title.replaceAll(' ', '_'))}`);
  if (!page?.extract || page.type === 'disambiguation') return null;
  let distanceM = null;
  if (page.coordinates) {
    distanceM = Math.round(haversineKm(place.location.coordinates, [page.coordinates.lon, page.coordinates.lat]) * METERS_PER_KM);
    if (distanceM > WIKIPEDIA.MAX_DISTANCE_M) return null;
  } else if (normalizeSearchText(page.title) !== normalizeSearchText(place.name) || !IN_HCMC.test(normalizeSearchText(page.extract))) {
    return null;
  }
  return { title: page.title, extract: trimExtract(page.extract), url: page.content_urls?.desktop?.page ?? null, distance_m: distanceM, label: WIKIPEDIA.LABEL, license: WIKIPEDIA.LICENSE };
};

const findArticle = async (place) => {
  const [lng, lat] = place.location.coordinates;
  const nearby = await getJson(apiUrl({ list: 'geosearch', gscoord: `${lat}|${lng}`, gsradius: String(WIKIPEDIA.MAX_DISTANCE_M), gslimit: '10' }));
  const nearTitle = nearby?.query?.geosearch?.find((item) => nameMatches(item.title, place.name))?.title;
  if (nearTitle) return fetchSummary(nearTitle, place);
  const found = await getJson(apiUrl({ list: 'search', srsearch: place.name, srlimit: String(WIKIPEDIA.SEARCH_LIMIT) }));
  for (const { title } of found?.query?.search ?? []) {
    if (!nameMatches(title, place.name)) continue;
    const summary = await fetchSummary(title, place);
    if (summary) return summary;
  }
  return null;
};

// Chỉ địa danh (bảo tàng, di tích, chợ, công viên...) — quán ăn / cà phê không tra Wikipedia
export const isWikipediaEligible = (place) => WIKIPEDIA_KINDS.has(place.kind) || WIKIPEDIA_CATEGORIES.has(place.category);

/** @returns {Promise<{ title, extract, url, distance_m, label, license } | null>} */
export const getPlaceWikipedia = async (place) => {
  if (!isWikipediaEligible(place)) return null;
  try {
    return await cache.wrap(`wiki:${place._id}`, () => findArticle(place));
  } catch {
    return null; // lỗi mạng không bị cache => lần sau thử lại
  }
};
