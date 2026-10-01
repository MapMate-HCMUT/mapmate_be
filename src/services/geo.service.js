import { PROFILE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

// Dịch toạ độ -> khu vực. Hiện dùng Nominatim (OpenStreetMap, miễn phí); khi có Goong key có thể thay
// bằng Goong Reverse Geocoding mà không đổi interface. Toạ độ KHÔNG được lưu lại ở bất cứ đâu.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'MapMate-HCMUT/1.0 (+https://github.com/MapMate-HCMUT)'; // Nominatim bắt buộc định danh app
const REQUEST_TIMEOUT_MS = 8000;
const STREET_ZOOM = 17;

const pickFirst = (address, keys) => keys.map((key) => address[key]).find(Boolean) ?? null;

export const reverseGeocodeArea = async ({ lat, lng }) => {
  const url = new URL(NOMINATIM_URL);
  url.search = new URLSearchParams({
    format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: String(STREET_ZOOM), addressdetails: '1', 'accept-language': 'vi',
  });

  let payload;
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    payload = await response.json();
  } catch {
    throw new AppError('Không lấy được khu vực từ vị trí, vui lòng nhập tay', HTTP_STATUS.BAD_GATEWAY, PROFILE_ERROR_CODES.GEOCODER_UNAVAILABLE);
  }

  const address = payload.address ?? {};
  // Cố ý bỏ house_number, amenity, postcode... => chỉ giữ mức khu vực.
  return {
    street: pickFirst(address, ['road', 'pedestrian', 'residential']),
    district: pickFirst(address, ['city_district', 'suburb', 'quarter', 'county', 'town']),
    city: pickFirst(address, ['city', 'state', 'province']),
    country: address.country ?? null,
  };
};
