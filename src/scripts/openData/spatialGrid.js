// Lưới ô vuông trong bộ nhớ để tìm nhanh "các điểm gần" mà không phải so với toàn bộ (O(n²)).
// Mỗi ô rộng ~cellMeters; tìm quanh 1 điểm = xét ô của nó + 8 ô bên cạnh.
const METERS_PER_DEGREE_LAT = 111320;

export class SpatialGrid {
  constructor(cellMeters) {
    this.cellDegrees = cellMeters / METERS_PER_DEGREE_LAT;
    this.cells = new Map();
  }

  keyOf([lng, lat]) {
    return [Math.floor(lng / this.cellDegrees), Math.floor(lat / this.cellDegrees)];
  }

  add(coordinates, value) {
    const [x, y] = this.keyOf(coordinates);
    const key = `${x}:${y}`;
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push({ coordinates, value });
  }

  nearby(coordinates) {
    const [x, y] = this.keyOf(coordinates);
    const found = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) found.push(...(this.cells.get(`${x + dx}:${y + dy}`) ?? []));
    }
    return found;
  }
}
