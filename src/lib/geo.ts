// 2地点間の距離（メートル）。打刻のジオフェンス判定に使う。
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // 地球半径(m)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 店舗の位置・ジオフェンス設定（環境変数）。未設定なら位置チェックは無効。
export function storeGeofence(): { lat: number; lng: number; radius: number } | null {
  const lat = Number(process.env.STORE_LAT);
  const lng = Number(process.env.STORE_LNG);
  const radius = Number(process.env.STORE_GEOFENCE_M || "200");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, radius: Number.isFinite(radius) ? radius : 200 };
}

// 位置チェックを必須にするか（STORE_LAT/LNG が設定され、かつ TIMECARD_REQUIRE_LOCATION=1）。
export function locationRequired(): boolean {
  return process.env.TIMECARD_REQUIRE_LOCATION === "1" && storeGeofence() !== null;
}
