/* ============================================================================
   geo.js — Utilidades de geolocalización y QR
   Módulo: Control de Asistencia GPS + QR
   ============================================================================
*/

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // radio medio de la Tierra en metros
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isValidLatLng(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function parseQrPayload(text) {
  // Permite JSON o URL con parámetros ?id=...&lat=...&lng=...
  try {
    const obj = JSON.parse(text);
    return {
      pdv_id: obj.pdv_id || obj.id || "",
      nombre_pdv: obj.nombre_pdv || obj.nombre || "",
      lat: parseFloat(obj.lat),
      lng: parseFloat(obj.lng),
      horario: obj.horario || null,
    };
  } catch {
    try {
      const url = new URL(text);
      return {
        pdv_id: url.searchParams.get("pdv_id") || url.searchParams.get("id") || "",
        nombre_pdv:
          url.searchParams.get("nombre_pdv") ||
          url.searchParams.get("nombre") ||
          url.searchParams.get("pdv") ||
          "",
        lat: parseFloat(url.searchParams.get("lat")),
        lng: parseFloat(url.searchParams.get("lng")),
        horario: url.searchParams.get("horario"),
      };
    } catch {
      return { pdv_id: "", nombre_pdv: "", lat: NaN, lng: NaN, horario: null };
    }
  }
}
