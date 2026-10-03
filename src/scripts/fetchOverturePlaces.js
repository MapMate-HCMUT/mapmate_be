// Tải địa điểm TP.HCM từ Overture Maps -> data/open/overture_hcmc.geojsonseq (~450 MB, ~30 giây, không cần API key)
// Cần cài 1 lần công cụ chính thức (Python ≥ 3.10):  pip install overturemaps
// Chạy: npm run places:fetch-overture
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { OPEN_DATA_BBOX, OPEN_DATA_FILES } from '../constants/openData.js';

const { west, south, east, north } = OPEN_DATA_BBOX;
mkdirSync(dirname(OPEN_DATA_FILES.overture), { recursive: true });

const args = ['download', `--bbox=${west},${south},${east},${north}`, '-f', 'geojsonseq', '-t', 'place', '-o', OPEN_DATA_FILES.overture];
const child = spawn('overturemaps', args, { stdio: 'inherit', shell: process.platform === 'win32' });

child.on('error', () => {
  console.error('❌ Không tìm thấy lệnh "overturemaps". Cài bằng: pip install overturemaps');
  process.exit(1);
});
child.on('exit', (code) => {
  if (code === 0) console.log(`✅ Đã lưu vào ${OPEN_DATA_FILES.overture}`);
  process.exit(code ?? 1);
});
