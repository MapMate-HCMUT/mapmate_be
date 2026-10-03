import mongoose from 'mongoose';
import { DEFAULT_VISIT_MINUTES, PLACE_CATEGORY_VALUES, PLACE_TAG_VALUES } from '../constants/places.js';
import { PLACE_SOURCES, PLACE_SOURCE_VALUES } from '../constants/openData.js';
import { normalizeSearchText } from '../utils/text.js';

const placeSchema = new mongoose.Schema(
  {
    goong_place_id: {
      type: String,
      unique: true,
      sparse: true, // Cho phép null nhưng nếu có thì phải unique
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Tên địa điểm là bắt buộc'],
      trim: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      enum: {
        values: PLACE_CATEGORY_VALUES, // + 'entertainment' cho bộ lọc Giải trí
        message: 'Danh mục {VALUE} không hợp lệ',
      },
      default: 'other',
    },
    // GeoJSON Point — Bắt buộc có index 2dsphere để truy vấn không gian
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'Tọa độ là bắt buộc'],
      },
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    price_range: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
    },
    district: {
      type: String,
      default: '',
      trim: true,
    },
    specialties: {
      type: [String],
      default: [],
    },
    cached_at: {
      type: Date,
      default: Date.now,
    },
    image_url: {
      type: String,
      default: null,
      trim: true,
    },

    // ── Bổ sung cho bộ lọc Khám phá & lên lộ trình ──
    review_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Phong cách / dịp đi chơi: 'hen-ho', 'gia-dinh', 'song-ao'... (constants/places.js)
    tags: {
      type: [{ type: String, enum: PLACE_TAG_VALUES }],
      default: [],
    },
    // Giờ mở cửa dạng "HH:mm". Để null = mở cả ngày. close < open = mở qua đêm.
    opening_hours: {
      open: { type: String, default: null },
      close: { type: String, default: null },
    },
    // Thời gian ở lại trung bình (phút) — dùng để xếp lịch trình
    avg_visit_minutes: {
      type: Number,
      default: DEFAULT_VISIT_MINUTES,
      min: 10,
    },
    is_trending: {
      type: Boolean,
      default: false,
    },
    // Tên + địa chỉ + đặc sản đã bỏ dấu, viết thường — để tìm "pho hoa" ra "Phở Hòa"
    search_text: {
      type: String,
      default: '',
      select: false,
    },

    // ── Nguồn dữ liệu (nhập từ Overture Maps / OpenStreetMap, xem src/scripts/openData) ──
    source: {
      type: String,
      enum: PLACE_SOURCE_VALUES,
      default: PLACE_SOURCES.MAPMATE,
    },
    // Mã bản ghi ở nguồn gốc: "overture:<id>" hoặc "osm:node/123" — để nhập lại không tạo trùng
    source_ref: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    osm_ref: { type: String, default: null }, // khi 1 địa điểm Overture được ghép thêm dữ liệu từ OSM
    // Độ tin cậy 0–1 (Overture chấm: còn hoạt động, đúng vị trí). Dữ liệu nhóm tự nhập = 1.
    confidence: {
      type: Number,
      default: 1,
      min: 0,
      max: 1,
    },
    // true = price_range là giá ƯỚC TÍNH theo loại hình (nguồn mở không có giá), chưa ai xác nhận
    price_estimated: {
      type: Boolean,
      default: false,
    },
    // false = chưa rõ giờ mở cửa (opening_hours để trống KHÔNG có nghĩa là mở cả ngày)
    hours_known: {
      type: Boolean,
      default: true,
    },
    // Ẩm thực / món: "Món Nhật", "Lẩu"... (để tìm kiếm + hiển thị)
    cuisines: {
      type: [String],
      default: [],
    },
    contact: {
      phone: { type: String, default: null },
      website: { type: String, default: null },
      facebook: { type: String, default: null },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

// Index 2dsphere cho truy vấn không gian ($geoNear, $geoIntersects)
placeSchema.index({ location: '2dsphere' });
// Index tìm kiếm theo danh mục + quận
placeSchema.index({ category: 1, district: 1 });

// Lọc theo phong cách
placeSchema.index({ tags: 1 });

// Lọc theo nguồn (VD chỉ lấy dữ liệu nhóm đã kiểm tra) + xếp "Phổ biến"
placeSchema.index({ source: 1 });

export const buildPlaceSearchText = ({ name = '', address = '', district = '', specialties = [], cuisines = [] }) =>
  normalizeSearchText([name, address, district, ...specialties, ...cuisines].join(' '));

placeSchema.pre('save', function fillSearchText() {
  this.search_text = buildPlaceSearchText(this);
});

const Place = mongoose.model('Place', placeSchema);
export default Place;
