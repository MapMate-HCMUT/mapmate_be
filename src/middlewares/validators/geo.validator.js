import { z } from 'zod';

// Chỉ phục vụ khu vực TP.HCM và lân cận (Goong là hạn mức của dự án, không làm proxy bản đồ cho cả nước)
const lat = z.coerce.number('Vĩ độ không hợp lệ').min(9.5, 'Ngoài khu vực hỗ trợ').max(12, 'Ngoài khu vực hỗ trợ');
const lng = z.coerce.number('Kinh độ không hợp lệ').min(105.5, 'Ngoài khu vực hỗ trợ').max(108, 'Ngoài khu vực hỗ trợ');
const GOONG_VEHICLES = ['bike', 'car', 'taxi', 'truck', 'hd'];

export const geocodeQuerySchema = z.object({ address: z.string('Bạn nhập địa chỉ cần tìm').trim().min(2, 'Địa chỉ quá ngắn').max(200, 'Địa chỉ quá dài') });
export const reverseGeocodeQuerySchema = z.object({ lat, lng });
export const directionQuerySchema = z.object({
  origin_lat: lat,
  origin_lng: lng,
  dest_lat: lat,
  dest_lng: lng,
  vehicle: z.enum(GOONG_VEHICLES, 'Phương tiện không hợp lệ').default('bike'),
});
