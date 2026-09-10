// Métricas de una sesión de rondín (cliente, sin PostGIS): paradas (LONG_STOP) y
// ruta esperada vs real (cobertura/desviación). Usadas por la vista de sesiones y
// por el reporte imprimible. Coordenadas en [lat, lng].

export interface PtoGps { lat: number; lng: number; t: string }
export interface Parada { lat: number; lng: number; durMin: number; desde: string }
export interface MetricasRuta { cobertura: number; desvMax: number; desvProm: number; distFueraM: number; tFueraMin: number }

// Distancia Haversine en metros.
export function distM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Detecta permanencias > minMin dentro de un radio radioM.
export function detectarParadas(pts: PtoGps[], radioM = 25, minMin = 5): Parada[] {
  const out: Parada[] = []; let i = 0;
  while (i < pts.length) {
    let j = i + 1;
    while (j < pts.length && distM(pts[i].lat, pts[i].lng, pts[j].lat, pts[j].lng) <= radioM) j++;
    const durMin = (new Date(pts[j - 1].t).getTime() - new Date(pts[i].t).getTime()) / 60000;
    if (durMin >= minMin) { out.push({ lat: pts[i].lat, lng: pts[i].lng, durMin: Math.round(durMin), desde: pts[i].t }); i = j; }
    else i++;
  }
  return out;
}

// Distancia (m) de un punto a la polilínea de la ruta, con proyección local plana.
export function distARutaM(pLat: number, pLng: number, ruta: [number, number][], lat0: number): number {
  if (ruta.length === 0) return Infinity;
  if (ruta.length === 1) return distM(pLat, pLng, ruta[0][0], ruta[0][1]);
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 111320;
  const px = pLng * kx, py = pLat * ky;
  let min = Infinity;
  for (let i = 1; i < ruta.length; i++) {
    const ax = ruta[i - 1][1] * kx, ay = ruta[i - 1][0] * ky, bx = ruta[i][1] * kx, by = ruta[i][0] * ky;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < min) min = d;
  }
  return min;
}

export function muestrearRuta(ruta: [number, number][], pasoM: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < ruta.length; i++) {
    const a = ruta[i - 1], b = ruta[i], seg = distM(a[0], a[1], b[0], b[1]);
    const n = Math.max(1, Math.round(seg / pasoM));
    for (let j = 0; j < n; j++) { const t = j / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  if (ruta.length) out.push(ruta[ruta.length - 1]);
  return out;
}

export function metricasRuta(recorrido: PtoGps[], ruta: [number, number][], corredorM: number): MetricasRuta | null {
  if (ruta.length < 2 || recorrido.length === 0) return null;
  const lat0 = ruta[0][0];
  let sum = 0, max = 0, distFuera = 0, tFuera = 0;
  recorrido.forEach((g, i) => {
    const d = distARutaM(g.lat, g.lng, ruta, lat0);
    sum += d; if (d > max) max = d;
    if (d > corredorM && i > 0) {
      tFuera += (new Date(g.t).getTime() - new Date(recorrido[i - 1].t).getTime()) / 60000;
      distFuera += distM(recorrido[i - 1].lat, recorrido[i - 1].lng, g.lat, g.lng);
    }
  });
  const muestras = muestrearRuta(ruta, Math.max(15, corredorM));
  let cub = 0;
  muestras.forEach((m) => { if (recorrido.some((g) => distM(g.lat, g.lng, m[0], m[1]) <= corredorM)) cub++; });
  return {
    cobertura: muestras.length ? Math.round((cub / muestras.length) * 100) : 0,
    desvMax: Math.round(max), desvProm: Math.round(sum / recorrido.length),
    distFueraM: Math.round(distFuera), tFueraMin: Math.round(tFuera),
  };
}
