// Tài khoản doanh nghiệp: quyền lợi theo gói, chặn hạ gói khi đang vượt mức, kiểm tra dữ liệu đăng ký. Chạy: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.JWT_SECRET ??= 'test-only-secret';
const { BUSINESS_TIER_PERKS } = await import('../src/constants/business.js');
const { downgradeProblem, listTiers, promoFor } = await import('../src/services/business.service.js');
const { businessRegisterSchema, placeUpdateSchema } = await import('../src/middlewares/validators/business.validator.js');
const { toPlaceView } = await import('../src/services/place.service.js');

const MB = 1024 * 1024;
const PLACE = { name: 'Cà phê Mây', category: 'cafe', coordinates: { lat: 10.7769, lng: 106.7009 }, address: '12 Lê Lợi, Quận 1' };
const usage = (overrides = {}) => ({ places: 1, storageUsed: 0, galleries: [], ...overrides });

describe('quyền lợi theo gói', () => {
  it('gói cao hơn có nhiều cửa hàng, dung lượng, bán kính ưu tiên hơn', () => {
    const [basic, growth, premium] = listTiers().tiers;
    assert.deepEqual([basic.value, growth.value, premium.value], ['basic', 'growth', 'premium']);
    for (const key of ['max_places', 'storage_bytes', 'gallery_items', 'reach_km', 'stats_days']) {
      assert.ok(basic[key] <= growth[key] && growth[key] <= premium[key], key);
    }
    assert.equal(premium.featured, true);
    assert.equal(basic.featured, false);
  });

  it('promo chép đúng quyền lợi, bán kính đổi sang mét', () => {
    assert.deepEqual(promoFor('growth'), { tier: 'growth', boost: 0.5, reach_m: 3000, featured: false, highlight: true });
    assert.equal(promoFor('basic').boost, 0); // gói miễn phí không được đẩy thứ hạng
  });
});

describe('hạ gói', () => {
  it('cho hạ khi đang trong mức của gói mới', () => {
    assert.equal(downgradeProblem('basic', usage({ storageUsed: 100 * MB })), null);
  });

  it('chặn khi có nhiều cửa hàng hơn gói mới', () => {
    assert.match(downgradeProblem('basic', usage({ places: 3 })), /chỉ có 1 cửa hàng — bạn đang có 3/);
  });

  it('chặn khi đang dùng nhiều dung lượng hơn gói mới', () => {
    assert.match(downgradeProblem('basic', usage({ storageUsed: BUSINESS_TIER_PERKS.basic.storage_bytes + MB })), /xoá bớt ảnh/);
  });

  it('chặn khi 1 cửa hàng có nhiều video hơn gói mới', () => {
    const galleries = [{ name: 'Quán A', items: 3, videos: 2 }];
    assert.match(downgradeProblem('basic', usage({ galleries })), /Quán A/);
  });
});

describe('dữ liệu đăng ký doanh nghiệp', () => {
  it('chuẩn hoá SĐT, website, mặc định gói Cơ bản', () => {
    const parsed = businessRegisterSchema.parse({ name: 'Mây Coffee', phone: '090 123 4567', website: 'maycoffee.vn', place: PLACE });
    assert.equal(parsed.phone, '+84901234567'); // chuẩn quốc tế E.164
    assert.equal(parsed.website, 'https://maycoffee.vn');
    assert.equal(parsed.tier, 'basic');
  });

  it('từ chối SĐT sai, giờ mở = giờ đóng, giá ngược', () => {
    assert.equal(businessRegisterSchema.safeParse({ name: 'Mây', phone: '12345', place: PLACE }).success, false);
    assert.equal(businessRegisterSchema.safeParse({ name: 'Mây', place: { ...PLACE, opening_hours: { open: '08:00', close: '08:00' } } }).success, false);
    assert.equal(businessRegisterSchema.safeParse({ name: 'Mây', place: { ...PLACE, price_range: { min: 50000, max: 20000 } } }).success, false);
  });

  it('không cho tự đăng loại hình "transport"', () => {
    assert.equal(businessRegisterSchema.safeParse({ name: 'Mây', place: { ...PLACE, category: 'transport' } }).success, false);
  });

  it('dời vị trí phải gửi kèm địa chỉ mới', () => {
    assert.equal(placeUpdateSchema.safeParse({ coordinates: PLACE.coordinates }).success, false);
    assert.equal(placeUpdateSchema.safeParse({ coordinates: PLACE.coordinates, address: '1 Nguyễn Huệ, Quận 1' }).success, true);
  });
});

describe('thẻ địa điểm', () => {
  const base = { _id: 'p1', name: 'Mây', location: { coordinates: [106.7, 10.77] } };

  it('cửa hàng doanh nghiệp có nhãn gói + "Tài trợ" chỉ khi thực sự được ưu tiên', () => {
    const place = { ...base, business_id: 'b1', promo: promoFor('premium') };
    assert.deepEqual(toPlaceView(place).business, { tier: 'premium', highlight: true, promoted: false });
    assert.equal(toPlaceView({ ...place, _promoted: true }).business.promoted, true);
  });

  it('địa điểm thường không có thông tin doanh nghiệp', () => {
    assert.equal(toPlaceView(base).business, null);
    assert.deepEqual(toPlaceView(base).gallery, []);
  });
});

describe('khuyến mãi + thông báo nhanh trên thẻ địa điểm', async () => {
  const { promotionStatus } = await import('../src/services/businessTools.service.js');
  const { promotionCreateSchema } = await import('../src/middlewares/validators/business.validator.js');
  const HOUR = 60 * 60 * 1000;
  const at = (hours) => new Date(Date.now() + hours * HOUR);
  const base = { _id: 'p1', name: 'Mây', location: { coordinates: [106.7, 10.77] } };

  it('trạng thái theo thời gian', () => {
    assert.equal(promotionStatus({ starts_at: at(1), ends_at: at(5) }), 'scheduled');
    assert.equal(promotionStatus({ starts_at: at(-1), ends_at: at(5) }), 'active');
    assert.equal(promotionStatus({ starts_at: at(-5), ends_at: at(-1) }), 'ended');
  });

  it('thẻ chỉ hiện khuyến mãi ĐANG chạy và thông báo còn hạn', () => {
    const place = {
      ...base,
      owner_notice: { text: 'Hôm nay nghỉ', until: at(-1) },
      promotions: [
        { id: 'a', title: 'Hết hạn', label: '-10%', starts_at: at(-10), ends_at: at(-2) },
        { id: 'b', title: 'Đang chạy', label: '-20%', starts_at: at(-1), ends_at: at(24) },
        { id: 'c', title: 'Sắp tới', label: '1+1', starts_at: at(48), ends_at: at(72) },
      ],
    };
    const view = toPlaceView(place);
    assert.equal(view.promotion.title, 'Đang chạy');
    assert.equal(view.notice, null);
    assert.equal(toPlaceView({ ...place, owner_notice: { text: 'Đóng cửa sớm', until: at(3) } }).notice.text, 'Đóng cửa sớm');
  });

  it('mã khuyến mãi viết hoa, ngày kết thúc phải sau ngày bắt đầu', () => {
    const input = { place_ids: ['6a0000000000000000000001'], title: 'Giảm giá cuối tuần', label: '-20%', code: 'cuoituan', starts_at: at(1), ends_at: at(48) };
    assert.equal(promotionCreateSchema.parse(input).code, 'CUOITUAN');
    assert.equal(promotionCreateSchema.safeParse({ ...input, ends_at: at(0.5) }).success, false);
  });
});

describe('săn voucher', async () => {
  const { drawPrize, generateVoucherCode } = await import('../src/services/voucher.service.js');
  const prizes = [
    { _id: 'a', label: 'Trà sữa', quantity: 10, claimed: 0, weight: 30 },
    { _id: 'b', label: 'Giảm 50%', quantity: 1, claimed: 1, weight: 10 }, // đã hết
  ];

  it('bốc giải theo tỉ trọng, bỏ qua giải đã hết, còn lại là trượt', () => {
    // tổng = 30 (Trà sữa) + 70 (trượt); giải đã hết không được tính
    assert.equal(drawPrize(prizes, 70, 0.1).label, 'Trà sữa');
    assert.equal(drawPrize(prizes, 70, 0.29).label, 'Trà sữa');
    assert.equal(drawPrize(prizes, 70, 0.31), null);
    assert.equal(drawPrize([{ ...prizes[0], claimed: 10 }], 0, 0.5), null); // hết sạch giải
  });

  it('mã 8 ký tự, không có ký tự dễ nhầm 0/O/1/I', () => {
    const code = generateVoucherCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  });
});

describe('số điện thoại + giờ mở cửa theo ngày', async () => {
  const { normalizePhone } = await import('../src/middlewares/validators/business.validator.js');
  const { isOpenOnDay, summarizeWeek, describeToday } = await import('../src/utils/weeklyHours.js');

  it('chuẩn hoá số Việt Nam / quốc tế về E.164', () => {
    for (const raw of ['0901 234 567', '090.123.4567', '84901234567', '+84 (0) 90 123 4567', '0084901234567']) assert.equal(normalizePhone(raw), '+84901234567', raw);
    assert.equal(normalizePhone('028 3822 1234'), '+842838221234');
    assert.equal(businessRegisterSchema.safeParse({ name: 'Mây', phone: '+84 12 345', place: PLACE }).success, false);
    assert.equal(businessRegisterSchema.parse({ name: 'Mây', phone: '+65 6123 4567', place: PLACE }).phone, '+6561234567');
  });

  const week = {
    mon: [], // nghỉ thứ 2
    tue: [{ open: '07:00', close: '11:00' }, { open: '17:00', close: '22:00' }], // nghỉ trưa
    wed: [{ open: '07:00', close: '22:00' }], thu: [{ open: '07:00', close: '22:00' }],
    fri: [{ open: '18:00', close: '02:00' }], // qua đêm
    sat: [{ open: '00:00', close: '24:00' }], sun: [{ open: '07:00', close: '22:00' }],
  };
  const place = { weekly_hours: week, opening_hours: { open: '07:00', close: '22:00' } };

  it('đúng ngày, nghỉ trưa, qua đêm sang hôm sau, mở 24 giờ', () => {
    assert.equal(isOpenOnDay(place, 'mon', '10:00'), false);
    assert.equal(isOpenOnDay(place, 'tue', '10:00'), true);
    assert.equal(isOpenOnDay(place, 'tue', '14:00'), false);
    assert.equal(isOpenOnDay(place, 'fri', '23:30'), true);
    assert.equal(isOpenOnDay(place, 'sat', '01:30'), true); // phần sau nửa đêm của thứ 6
    assert.equal(isOpenOnDay(place, 'sat', '13:00'), true);
    assert.equal(isOpenOnDay({ opening_hours: { open: '08:00', close: '17:00' } }, 'mon', '18:00'), false); // không có lịch => như cũ
  });

  it('khung đại diện = khung gặp nhiều nhất; mô tả hôm nay', () => {
    assert.deepEqual(summarizeWeek(week), { open: '07:00', close: '22:00' });
    assert.equal(describeToday(place, new Date('2026-10-12T03:00:00Z')), 'nghỉ hôm nay'); // thứ 2 giờ VN
  });

  it('chặn khung giờ chồng nhau', () => {
    const bad = { ...PLACE, weekly_hours: { mon: [{ open: '07:00', close: '12:00' }, { open: '11:00', close: '20:00' }] } };
    assert.equal(businessRegisterSchema.safeParse({ name: 'Mây', place: bad }).success, false);
    const ok = { ...PLACE, weekly_hours: { mon: [{ open: '17:00', close: '22:00' }, { open: '07:00', close: '11:00' }] } };
    assert.deepEqual(businessRegisterSchema.parse({ name: 'Mây', place: ok }).place.weekly_hours.mon[0], { open: '07:00', close: '11:00' });
  });
});
