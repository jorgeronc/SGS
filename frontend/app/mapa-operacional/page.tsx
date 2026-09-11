"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import MapaBase from "@/app/components/MapaBase";
import { ESTILOS_MAPA, estiloMapaPorId, type EstiloMapaId } from "@/lib/mapStyle";
import { temaMapa } from "@/lib/geo";
import CamarasCercanas from "@/app/components/CamarasCercanas";
import CameraDetailDrawer from "@/app/components/CameraDetailDrawer";
import ChatIncidente from "@/app/components/ChatIncidente";
import VisorTransmision from "@/app/components/VisorTransmision";
import { useGuardiasEnLinea } from "@/lib/guardiasVivo";
import { getEstadoMapa, setVistaMapa, setVentanasMapa, limpiarAlCerrarSesion } from "@/lib/mapaOperacionalEstado";

const CENTER: [number, number] = [-100.309, 25.6714];
const COL = { guardia: "#1f9d5c", pausa: "#d98a2b", incidente: "#e23b53", camara: "#0e8f86", geof: "#2f6bff", sitio: "#7c5cff", punto: "#eab308" };
const ESTILO_KEY = "sgs_mapa_estilo"; // preferencia duradera del tipo de mapa (localStorage)
const PITCH_KEY = "sgs_mapa_pitch";   // inclinación duradera del mapa (localStorage)
const PITCH_DEFAULT = 50;             // arranca en perspectiva inclinada; se guarda si el usuario la cambia
function pitchInicial(): number {
  try { const v = localStorage.getItem(PITCH_KEY); if (v != null && v !== "") return Number(v); } catch { /* */ }
  return PITCH_DEFAULT;
}
const PRIO_LBL: Record<string, string> = { alta: "Crítica", media: "Media", baja: "Baja" };

// Color del icono de cámara según su estado_operativo (activa/inactiva/mantenimiento).
const colorCamara = (e?: string) => (e === "activa" ? COL.camara : e === "mantenimiento" ? COL.pausa : COL.incidente);

// Anillo (polígono) de una geocerca en coordenadas lon/lat.
function circulo(lng: number, lat: number, radioM: number, n = 48): number[][] {
  const dLat = radioM / 111320;
  const dLng = radioM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return ring;
}

const FOCO_RADIO_M = 1500; // 1.5 km a la redonda
const NARANJA = "#f4820a";
const ALTURA_PUNTO_POC = 50; // PRUEBA: altura (m) a la que "flota" el punto de control

// Dibuja (o actualiza) la geocerca naranja de enfoque de 1.5 km alrededor de un
// incidente y devuelve su anillo (para encuadrar). Idempotente.
function dibujarFoco(map: any, lng: number, lat: number): number[][] {
  const ring = circulo(lng, lat, FOCO_RADIO_M);
  const fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
  // La capa (addSource/addLayer) espera a que el estilo esté cargado; el anillo se
  // devuelve siempre para poder encuadrar (fitBounds es seguro sin estilo cargado).
  cuandoEstiloListo(map, () => {
    if (!map.getSource("foco-radio")) {
      map.addSource("foco-radio", { type: "geojson", data: fc as any });
      map.addLayer({ id: "foco-f", type: "fill", source: "foco-radio", paint: { "fill-color": NARANJA, "fill-opacity": 0.12 } });
      map.addLayer({ id: "foco-l", type: "line", source: "foco-radio", paint: { "line-color": NARANJA, "line-width": 2.5 } });
    } else { map.getSource("foco-radio").setData(fc as any); }
  });
  return ring;
}

// Oculta la geocerca de enfoque (al cerrar la ventana del incidente).
function limpiarFoco(map: any) {
  if (map?.getSource?.("foco-radio")) map.getSource("foco-radio").setData({ type: "FeatureCollection", features: [] } as any);
}

// Ejecuta fn cuando el estilo del mapa esté completamente cargado. addSource/
// addLayer lanzan "Style is not done loading" si se llaman durante un setStyle
// (p.ej. al restaurar el tipo de mapa guardado), así que las operaciones de capa
// deben esperar a este momento.
function cuandoEstiloListo(map: any, fn: () => void) {
  if (map.isStyleLoaded()) { fn(); return; }
  const h = () => { if (map.isStyleLoaded()) { map.off("styledata", h); fn(); } };
  map.on("styledata", h);
}

// Elemento HTML de un marcador (pin o punto), estilo del diseño.
// opts.hoverOnly: la etiqueta (nombre + opts.sub) se oculta y solo aparece al
// pasar el cursor (tooltip), p.ej. cámaras -> nombre + estatus.
function pinEl(color: string, icon: string, label: string, dot: boolean, pulse: boolean, onClick?: () => void, opts?: { hoverOnly?: boolean; sub?: string }): HTMLElement {
  const el = document.createElement("div");
  if (opts?.hoverOnly) el.className = "mo-pin";
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateY(-50%)";
  const shape = dot ? "border-radius:50%;" : "border-radius:50% 50% 50% 0;transform:rotate(-45deg);";
  const iconT = dot ? "" : "transform:rotate(45deg);";
  const sub = opts?.sub ? `<div style="font-size:9px;font-weight:600;color:#9fb0c2;margin-top:1px">${opts.sub}</div>` : "";
  el.innerHTML =
    (pulse ? `<div style="position:absolute;top:-19px;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle,#e23b5355,#e23b5300 70%);animation:mo-pulse 1.8s ease-in-out infinite"></div>` : "") +
    `<div style="width:24px;height:24px;${shape}background:${color};display:grid;place-items:center;border:2px solid #ffffff55;box-shadow:0 3px 8px #0006"><span style="${iconT}font-size:12px">${icon}</span></div>` +
    `<div class="${opts?.hoverOnly ? "mo-hoverlabel" : ""}" style="margin-top:3px;font-size:10px;font-weight:700;color:#e7edf5;background:#0c131cc0;padding:1px 6px;border-radius:5px;white-space:nowrap;border:1px solid #283442;text-align:center">${label}${sub}</div>`;
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

const guardiaNombre = (g: any) => g.etiqueta ?? "Guardia";

export default function MapaOperacionalPage() {
  const guardias = useGuardiasEnLinea();
  const [incidentes, setIncidentes] = useState<any[]>([]);
  const [camaras, setCamaras] = useState<any[]>([]);
  const [sitios, setSitios] = useState<any[]>([]);
  const [puntos, setPuntos] = useState<any[]>([]);
  const [ultima, setUltima] = useState<Date | null>(null); // null hasta montar (evita mismatch de hidratación)
  // Ventanas abiertas: se restauran del estado que sobrevive la navegación.
  const est0 = getEstadoMapa();
  const [selInc, setSelInc] = useState<any | null>(est0.selInc);
  const [selCam, setSelCam] = useState<any | null>(est0.selCam);
  const [selChat, setSelChat] = useState<{ canalId: string; folio: string } | null>(est0.selChat);
  const [sitioFoco, setSitioFoco] = useState<string>(""); // selector "Ir a sitio"

  // Abre (asegurando membresía) el chat del incidente en el panel izquierdo.
  async function abrirChatIncidente(inc: any) {
    const { data } = await supabase.rpc("rpc_incidente_unir_chat", { p_llamada: inc.id });
    if (data) setSelChat({ canalId: data as string, folio: inc.folio ?? "incidente" });
  }
  const [capas, setCapas] = useState({ guardias: true, incidentes: true, camaras: true, sitios: true, puntos: true, geofences: true });
  const [estiloId, setEstiloId] = useState<EstiloMapaId>("liberty");
  const [pitchIni] = useState<number>(pitchInicial); // inclinación inicial (guardada o por defecto)

  const mlRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const marks = useRef<any[]>([]);
  // Filtro por URL (desde CAD): ?incidente=<id> (uno solo) o filtros
  // (estatus/prioridad/despacho/desde/hasta/q). Se lee una vez al montar.
  const filtro = useRef<{ incidente?: string; tx?: string; fit?: string; estatus?: string; prioridad?: string; despacho?: string; desde?: string; hasta?: string; q?: string }>({});
  const focoHecho = useRef(false);
  // Transmisión en vivo enviada al mapa (?tx=<id>): recuadro anclado al puntero
  // del incidente, solo mientras la transmisión está activa.
  const [txId, setTxId] = useState<string | null>(null);
  const [txViva, setTxViva] = useState(false);
  const [txPos, setTxPos] = useState<{ x: number; y: number } | null>(null);
  const [mapListo, setMapListo] = useState(false);
  const [mlListo, setMlListo] = useState(false);
  const incLoc = useRef<{ lng: number; lat: number } | null>(null);
  const datos = useRef({ guardias, incidentes, camaras, sitios, puntos, capas });
  datos.current = { guardias, incidentes, camaras, sitios, puntos, capas };
  const estiloAplicado = useRef<string | null>(null); // último estiloId aplicado al mapa
  const vistaRestaurada = useRef(false);              // centro/zoom restaurados una sola vez
  const guardarVistaAttach = useRef(false);           // suscripción a moveend/zoomend (una vez)

  useEffect(() => { import("maplibre-gl" as any).then((m) => { mlRef.current = (m as any).default ?? m; setMlListo(true); }); }, []);

  // Preferencia duradera del tipo de mapa + limpieza del estado al cerrar sesión.
  useEffect(() => {
    limpiarAlCerrarSesion();
    try { const s = localStorage.getItem(ESTILO_KEY) as EstiloMapaId | null; if (s) setEstiloId(s); } catch { /* */ }
  }, []);

  // Persiste las ventanas abiertas para restaurarlas al regresar al mapa.
  useEffect(() => { setVentanasMapa({ selInc, selCam, selChat }); }, [selInc, selCam, selChat]);

  // Aplica el estilo elegido (o restaurado) al mapa. Un solo camino para cambio
  // manual y restauración; styledata re-agrega capas/marcadores (idempotente).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapListo) return;
    if (estiloAplicado.current === estiloId) return;
    const primera = estiloAplicado.current === null;
    estiloAplicado.current = estiloId;
    if (primera && estiloId === "liberty") return; // el mapa ya se creó con Liberty
    map.setStyle(estiloMapaPorId(estiloId, temaMapa() === "dark"), { diff: false });
  }, [estiloId, mapListo]);

  // Lee el filtro de la URL una vez (evita useSearchParams para no requerir Suspense).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      filtro.current = {
        incidente: p.get("incidente") || undefined, tx: p.get("tx") || undefined, fit: p.get("fit") || undefined, estatus: p.get("estatus") || undefined,
        prioridad: p.get("prioridad") || undefined, despacho: p.get("despacho") || undefined,
        desde: p.get("desde") || undefined, hasta: p.get("hasta") || undefined, q: p.get("q") || undefined,
      };
      setTxId(filtro.current.tx ?? null);
    } catch { /* */ }
  }, []);

  // ¿La transmisión enviada al mapa sigue activa? (para ocultar el recuadro al terminar)
  useEffect(() => {
    if (!txId) { setTxViva(false); return; }
    let cancel = false;
    const check = async () => {
      const { data } = await supabase.from("transmisiones").select("estado, estatus").eq("id", txId).maybeSingle();
      if (!cancel) setTxViva((data as any)?.estado === "en_vivo" && (data as any)?.estatus === "activo");
    };
    check();
    const canal = supabase.channel(`mo-tx:${txId}`).on("postgres_changes", { event: "*", schema: "public", table: "transmisiones", filter: `id=eq.${txId}` }, check).subscribe();
    return () => { cancel = true; supabase.removeChannel(canal); };
  }, [txId]);

  // Ubicación del incidente al que pertenece la transmisión (para anclar el recuadro).
  useEffect(() => {
    const f = filtro.current;
    if (!f.incidente) return;
    const it = incidentes.find((i: any) => i.id === f.incidente);
    if (it && it.latitud != null) incLoc.current = { lng: Number(it.longitud), lat: Number(it.latitud) };
  }, [incidentes]);

  // Sigue el puntero del incidente en pantalla para colocar el recuadro sobre él.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapListo || !txId) return;
    const actualizar = () => {
      const loc = incLoc.current;
      if (!loc) { setTxPos(null); return; }
      const p = map.project([loc.lng, loc.lat]);
      setTxPos({ x: p.x, y: p.y });
    };
    actualizar();
    map.on("move", actualizar);
    map.on("zoom", actualizar);
    map.on("resize", actualizar);
    return () => { map.off("move", actualizar); map.off("zoom", actualizar); map.off("resize", actualizar); };
  }, [mapListo, txId, incidentes]);

  const cargar = useCallback(async () => {
    const f = filtro.current;
    // Incidentes: por defecto los abiertos; con ?incidente=<id> solo ese (aunque
    // esté cerrado); con filtros de la lista de CAD, esos.
    let incQ = supabase.from("llamadas_cad").select("id, folio, tipo, prioridad, direccion, estado_despacho, latitud, longitud, sitio_id, datos_adicionales").not("latitud", "is", null);
    if (f.incidente) {
      incQ = incQ.eq("id", f.incidente);
    } else if (f.estatus || f.prioridad || f.despacho || f.desde || f.hasta) {
      if (f.estatus) incQ = incQ.eq("estatus", f.estatus); else incQ = incQ.eq("estatus", "activo");
      if (f.despacho) incQ = incQ.eq("estado_despacho", f.despacho);
      if (f.prioridad) incQ = incQ.eq("prioridad", f.prioridad);
      if (f.desde) incQ = incQ.gte("fecha_recepcion", f.desde + "T00:00:00");
      if (f.hasta) incQ = incQ.lte("fecha_recepcion", f.hasta + "T23:59:59");
    } else {
      incQ = incQ.eq("estatus", "activo").in("estado_despacho", ["recibida", "despachada", "en_atencion"]);
    }
    const [{ data: inc }, { data: cam }, { data: sit }, { data: pts }] = await Promise.all([
      incQ,
      supabase.from("camaras").select("id, nombre, estado_operativo, latitud, longitud").eq("estatus", "activo").not("latitud", "is", null),
      supabase.from("sitios").select("id, nombre, latitud, longitud, radio_geofence_m").eq("estatus", "activo").not("latitud", "is", null),
      supabase.from("puntos_control").select("id, nombre, codigo, tipo_punto, latitud, longitud, sitio:sitios(nombre)").eq("estatus", "activo").not("latitud", "is", null),
    ]);
    let incArr = (inc as any[]) ?? [];
    if (f.q) { const qq = f.q.toLowerCase(); incArr = incArr.filter((i) => `${i.folio ?? ""} ${i.tipo ?? ""} ${i.direccion ?? ""}`.toLowerCase().includes(qq)); }
    setIncidentes(incArr);
    setCamaras((cam as any[]) ?? []);
    setSitios((sit as any[]) ?? []);
    setPuntos((pts as any[]) ?? []);
    setUltima(new Date());
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000);
    // Recargar también al volver a la pestaña/ventana (el intervalo no basta si
    // el navegador lo estranguló en segundo plano). Patrón del proyecto.
    const onVis = () => { if (!document.hidden) cargar(); };
    window.addEventListener("focus", cargar);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", cargar);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cargar]);

  // Geocercas como polígonos (capa de estilo; se re-crea tras cambios de tema).
  function ensureGeocercas(map: any) {
    // Si el estilo está recargándose (setStyle), addSource/addLayer lanzarían;
    // onReady (styledata) vuelve a llamar a esta función cuando el estilo cargue.
    if (!map.isStyleLoaded()) return;
    const fc = { type: "FeatureCollection", features: sitios.map((s) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circulo(Number(s.longitud), Number(s.latitud), Number(s.radio_geofence_m) || 150)] } })) };
    if (!map.getSource("geocercas")) {
      map.addSource("geocercas", { type: "geojson", data: fc as any });
      map.addLayer({ id: "geoc-f", type: "fill", source: "geocercas", paint: { "fill-color": COL.geof, "fill-opacity": 0.07 } });
      map.addLayer({ id: "geoc-l", type: "line", source: "geocercas", paint: { "line-color": COL.geof, "line-width": 1.4, "line-dasharray": [2, 2], "line-opacity": 0.75 } });
    } else { map.getSource("geocercas").setData(fc as any); }
    const v = datos.current.capas.geofences ? "visible" : "none";
    ["geoc-f", "geoc-l"].forEach((l) => map.getLayer(l) && map.setLayoutProperty(l, "visibility", v));
  }

  // PRUEBA 3D: activa los edificios en 3D (fill-extrusion) si el estilo no los trae
  // ya. Liberty suele incluirlos; en ese caso no se duplica. Idempotente.
  function ensureEdificios3D(map: any) {
    if (!map.isStyleLoaded()) return;
    const style = map.getStyle();
    const capasEstilo: any[] = style?.layers ?? [];
    const yaHay = capasEstilo.some((l) => l.type === "fill-extrusion" && ((l as any)["source-layer"] === "building" || /build/i.test(l.id)));
    if (yaHay || map.getLayer("edificios-3d")) return;
    const sources = style?.sources ?? {};
    const srcId = sources["openmaptiles"] ? "openmaptiles" : Object.keys(sources).find((k) => (sources as any)[k].type === "vector");
    if (!srcId) return;
    const primerSimbolo = capasEstilo.find((l) => l.type === "symbol")?.id;
    map.addLayer({
      id: "edificios-3d", type: "fill-extrusion", source: srcId, "source-layer": "building", minzoom: 14,
      paint: {
        "fill-extrusion-color": "#c9d2dc",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
        "fill-extrusion-opacity": 0.85,
      },
    }, primerSimbolo);
  }

  // PRUEBA 3D: dibuja cada punto de control como un disco amarillo FLOTANDO a
  // ALTURA_PUNTO_POC metros (fill-extrusion con base+altura). Sobre el pin de suelo
  // existente, así se ve el punto "en el piso 5". Idempotente; respeta la capa Puntos.
  function ensurePuntos3D(map: any) {
    if (!map.isStyleLoaded()) return;
    const { puntos, capas } = datos.current;
    const fc = {
      type: "FeatureCollection",
      features: puntos.filter((p: any) => p.latitud != null).map((p: any) => ({
        type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circulo(Number(p.longitud), Number(p.latitud), 7)] },
      })),
    };
    if (!map.getSource("puntos-3d")) {
      map.addSource("puntos-3d", { type: "geojson", data: fc as any });
      map.addLayer({
        id: "puntos-3d-l", type: "fill-extrusion", source: "puntos-3d",
        paint: {
          "fill-extrusion-color": COL.punto,
          "fill-extrusion-base": ALTURA_PUNTO_POC,
          "fill-extrusion-height": ALTURA_PUNTO_POC + 2.5,
          "fill-extrusion-opacity": 0.92,
        },
      });
    } else { map.getSource("puntos-3d").setData(fc as any); }
    const v = capas.puntos ? "visible" : "none";
    if (map.getLayer("puntos-3d-l")) map.setLayoutProperty("puntos-3d-l", "visibility", v);
  }

  // Al hacer clic en un incidente: lo selecciona, dibuja la geocerca naranja de
  // 1.5 km y encuadra el mapa para que se vea centrado con ese radio a la redonda.
  const enfocarIncidente = useCallback((it: any) => {
    setSelInc(it);
    const map = mapRef.current, ml = mlRef.current;
    if (!map || !ml || it.latitud == null) return;
    const lng = Number(it.longitud), lat = Number(it.latitud);
    const ring = dibujarFoco(map, lng, lat);
    const b = ring.reduce((bb: any, c: number[]) => bb.extend(c as [number, number]), new ml.LngLatBounds(ring[0] as [number, number], ring[0] as [number, number]));
    map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 800 });
  }, []);

  // Centra el mapa en un sitio SIN cerrar las ventanas abiertas (chat/cámara/incidente).
  const irASitio = useCallback((s: any) => {
    const map = mapRef.current;
    if (!map || s?.latitud == null) return;
    map.flyTo({ center: [Number(s.longitud), Number(s.latitud)], zoom: 15.5, duration: 800 });
  }, []);

  // Redibuja los marcadores (guardias, incidentes, cámaras, sitios) según datos + capas.
  const pintar = useCallback(() => {
    const map = mapRef.current, maplibre = mlRef.current; if (!map || !maplibre) return;
    marks.current.forEach((m) => m.remove()); marks.current = [];
    const { guardias, incidentes, camaras, sitios, puntos, capas } = datos.current;
    const add = (lng: number, lat: number, el: HTMLElement) => marks.current.push(new maplibre.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map));
    if (capas.sitios) sitios.forEach((s: any) => { if (s.latitud != null) add(Number(s.longitud), Number(s.latitud), pinEl(COL.sitio, "🛡", s.nombre ?? "Sitio", false, false, () => irASitio(s))); });
    if (capas.puntos) puntos.forEach((p: any) => { if (p.latitud != null) add(Number(p.longitud), Number(p.latitud), pinEl(COL.punto, "🚩", p.nombre ?? "Punto", true, false, undefined, { hoverOnly: true, sub: p.sitio?.nombre ?? p.codigo ?? "" })); });
    if (capas.guardias) guardias.forEach((g: any) => { if (g.latitud != null) add(Number(g.longitud), Number(g.latitud), pinEl(g.estatus_servicio === "en_pausa" ? COL.pausa : COL.guardia, "👮", guardiaNombre(g), false, false)); });
    if (capas.camaras) camaras.forEach((c: any) => add(Number(c.longitud), Number(c.latitud), pinEl(colorCamara(c.estado_operativo), "📷", c.nombre ?? "Cámara", true, false, () => setSelCam(c), { hoverOnly: true, sub: c.estado_operativo ?? "" })));
    if (capas.incidentes) incidentes.forEach((it: any) => add(Number(it.longitud), Number(it.latitud), pinEl(COL.incidente, "⚠", it.folio ?? it.tipo ?? "Incidente", false, it.prioridad === "alta", () => enfocarIncidente(it))));
  }, [enfocarIncidente, irASitio]);

  // Desde CAD: con ?incidente=<id> centra y abre ese incidente; con ?fit=1
  // (ver en mapa según filtros) encuadra todos los incidentes visibles. Una sola vez.
  const centrarFoco = useCallback(() => {
    const f = filtro.current; if (focoHecho.current) return;
    const map = mapRef.current, ml = mlRef.current;
    if (f.incidente) {
      const it = datos.current.incidentes.find((i: any) => i.id === f.incidente);
      if (!it || it.latitud == null || !map) return;
      focoHecho.current = true; enfocarIncidente(it);
      return;
    }
    if (f.fit) {
      const coords = datos.current.incidentes.filter((i: any) => i.latitud != null).map((i: any) => [Number(i.longitud), Number(i.latitud)] as [number, number]);
      if (!coords.length || !map || !ml) return;
      focoHecho.current = true;
      const b = coords.reduce((bb: any, c: [number, number]) => bb.extend(c), new ml.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(b, { padding: 80, maxZoom: 15, duration: 800 });
    }
  }, [enfocarIncidente]);

  // Restaura centro/zoom + foco del incidente guardado (una vez) y mantiene el
  // estado al día en cada movimiento. El foco por URL (?incidente/?fit) gana.
  function restaurarEstado(map: any) {
    if (!guardarVistaAttach.current) {
      guardarVistaAttach.current = true;
      const save = () => { try { const c = map.getCenter(); setVistaMapa([c.lng, c.lat], map.getZoom()); } catch { /* */ } };
      map.on("moveend", save); map.on("zoomend", save);
      // La inclinación es preferencia DURADERA (localStorage): sobrevive al refresh
      // y solo cambia cuando el usuario la modifica. Arranca en perspectiva (PITCH_DEFAULT).
      map.on("pitchend", () => { try { localStorage.setItem(PITCH_KEY, String(Math.round(map.getPitch()))); } catch { /* */ } });
    }
    if (vistaRestaurada.current) return;
    vistaRestaurada.current = true;
    const f = filtro.current;
    if (f.incidente || f.fit) return; // el foco desde CAD manda
    const e = getEstadoMapa();
    if (e.view) map.jumpTo({ center: e.view.center, zoom: e.view.zoom });
    if (e.selInc && e.selInc.latitud != null) dibujarFoco(map, Number(e.selInc.longitud), Number(e.selInc.latitud));
  }

  function onReady(map: any) { mapRef.current = map; setMapListo(true); ensureEdificios3D(map); ensureGeocercas(map); ensurePuntos3D(map); pintar(); centrarFoco(); restaurarEstado(map); }

  // Redibuja al cambiar datos/capas (sin reencuadrar).
  useEffect(() => { if (mapRef.current) { pintar(); ensureGeocercas(mapRef.current); ensurePuntos3D(mapRef.current); } }, [guardias, incidentes, camaras, sitios, puntos, capas, mlListo, pintar]);
  useEffect(() => { centrarFoco(); }, [incidentes, centrarFoco]);

  const panel = "background:var(--sc-content);border:1px solid var(--sc-card-line);border-radius:12px;color:var(--sc-text)";
  const toggle = (k: keyof typeof capas) => setCapas((p) => ({ ...p, [k]: !p[k] }));
  // Cambia el tipo de mapa base y lo GUARDA como preferencia del usuario. El efecto
  // de estilo aplica el setStyle; onReady (styledata) re-agrega capas/marcadores.
  const cambiarEstilo = (id: EstiloMapaId) => {
    setEstiloId(id);
    try { localStorage.setItem(ESTILO_KEY, id); } catch { /* */ }
  };

  return (
    <div style={{ position: "relative", height: "calc(100vh - 56px)", margin: -22, overflow: "hidden" }}>
      <MapaBase center={CENTER} zoom={12.5} pitch={pitchIni} className="mo-map" onReady={onReady} />
      <style>{`.mo-map{position:absolute;inset:0}.mo-hoverlabel{display:none}.mo-pin:hover .mo-hoverlabel{display:block}`}</style>

      {/* Barra superior: selección del mapa e "Ir a sitio" */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", maxWidth: "calc(100vw - 28px)", padding: "6px 12px", zIndex: 5, ...cssObj(panel) }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
          <span style={{ color: "var(--sc-text-faint)" }}>🗺 Mapa</span>
          <select value={estiloId} onChange={(e) => cambiarEstilo(e.target.value as EstiloMapaId)} style={{ background: "var(--sc-content)", color: "var(--sc-text)", border: "1px solid var(--sc-card-line)", borderRadius: 6, padding: "3px 6px", fontSize: 12.5, cursor: "pointer" }}>
            {ESTILOS_MAPA.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
          <span style={{ color: COL.sitio }}>🛡 Sitio</span>
          <select value={sitioFoco} onChange={(e) => { const id = e.target.value; setSitioFoco(id); const s = sitios.find((x) => x.id === id); if (s) irASitio(s); }} style={{ background: "var(--sc-content)", color: "var(--sc-text)", border: "1px solid var(--sc-card-line)", borderRadius: 6, padding: "3px 6px", fontSize: 12.5, cursor: "pointer", maxWidth: 200 }}>
            <option value="">— Ir a sitio —</option>
            {[...sitios].sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es")).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
      </div>

      {/* Ventana de incidente: lado derecho */}
      {selInc && (
        <aside style={{ position: "absolute", top: 14, right: 14, width: 340, maxHeight: "calc(100vh - 90px)", overflow: "auto", zIndex: 6, ...cssObj(panel) }}>
          <div style={{ padding: "13px 15px", borderBottom: "1px solid var(--sc-card-line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ color: COL.incidente }}>🚨 {selInc.folio ?? "Incidente"}</b>
              <span onClick={() => { setSelInc(null); limpiarFoco(mapRef.current); }} style={{ cursor: "pointer", color: "var(--sc-text-faint)" }}>✕</span>
            </div>
            <h3 style={{ margin: "8px 0 2px" }}>{selInc.tipo ?? "Incidencia"}</h3>
            <div style={{ color: "var(--sc-text-soft)", fontSize: 12.5 }}>{selInc.direccion ?? "—"} · prioridad {PRIO_LBL[selInc.prioridad] ?? selInc.prioridad}</div>
            <Link href={`/cad/${selInc.id}`} style={{ display: "block", textAlign: "center", background: "#2f6bff", color: "#fff", borderRadius: 9, padding: 9, fontWeight: 700, marginTop: 10, textDecoration: "none" }}>Abrir en Central / Despacho</Link>
            <button onClick={() => abrirChatIncidente(selInc)} style={{ display: "block", width: "100%", textAlign: "center", background: "#2563eb", color: "#fff", border: "none", borderRadius: 9, padding: 9, fontWeight: 700, marginTop: 8, cursor: "pointer" }}>💬 Chat del incidente</button>
          </div>
          <div style={{ padding: "6px 15px 14px" }}>
            <CamarasCercanas latitud={selInc.latitud ?? null} longitud={selInc.longitud ?? null} radioM={600} />
          </div>
        </aside>
      )}

      {/* Transmisión en vivo anclada al puntero del incidente (?tx=). Solo mientras esté activa. */}
      {txId && txViva && txPos && (
        <div style={{ position: "absolute", left: txPos.x, top: txPos.y, transform: "translate(-50%, calc(-100% - 34px))", width: 300, maxWidth: "calc(100vw - 28px)", zIndex: 7, background: "var(--sc-content)", border: "1px solid var(--sc-card-line)", borderRadius: 12, color: "var(--sc-text)", boxShadow: "0 8px 24px #0007" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px" }}>
            <b style={{ color: "#e11d48", fontSize: 12 }}>🔴 Transmisión en vivo</b>
            <span onClick={() => setTxId(null)} style={{ cursor: "pointer", color: "var(--sc-text-faint)" }}>✕</span>
          </div>
          <div style={{ padding: "0 8px 8px" }}><VisorTransmision transmisionId={txId} /></div>
        </div>
      )}

      {/* Dock IZQUIERDO: ventana de cámara (arriba) y chat del incidente (abajo),
          alineado en top con la barra de Capas (centrada) y la ventana derecha.
          Se apilan sin empalmarse y sobre la barra de KPIs. */}
      {(selCam || selChat) && (
        <div style={{ position: "absolute", top: 14, left: 14, width: 340, maxHeight: "calc(100vh - 90px)", overflow: "auto", zIndex: 6, display: "flex", flexDirection: "column", gap: 12 }}>
          {selCam && <CameraDetailDrawer camaraId={selCam.id} onClose={() => setSelCam(null)} accionesColapsables />}
          {selChat && (
            <div style={cssObj(panel)}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--sc-card-line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ color: "#2563eb" }}>💬 Chat · {selChat.folio}</b>
                <span onClick={() => setSelChat(null)} style={{ cursor: "pointer", color: "var(--sc-text-faint)" }}>✕</span>
              </div>
              <div style={{ padding: "8px 12px 12px" }}>
                <ChatIncidente canalId={selChat.canalId} alto={300} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Barra inferior: capas del mapa */}
      <div style={{ position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "center", maxWidth: "calc(100vw - 28px)", padding: "5px 10px", zIndex: 5, ...cssObj(panel) }}>
        <span style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--sc-text-faint)", textTransform: "uppercase", marginRight: 2 }}>Capas</span>
        {([["guardias", COL.guardia, "Guardias"], ["incidentes", COL.incidente, "Incidentes"], ["camaras", COL.camara, "Cámaras"], ["sitios", COL.sitio, "Sitios"], ["puntos", COL.punto, "Puntos de control"], ["geofences", COL.geof, "Geocercas"]] as const).map(([k, c, l]) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "4px 8px", cursor: "pointer" }}>
            <input type="checkbox" checked={capas[k]} onChange={() => toggle(k)} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} /> {l}
          </label>
        ))}
        <span style={{ width: 1, alignSelf: "stretch", background: "var(--sc-card-line)", margin: "0 4px" }} />
        <span style={{ fontSize: 10, color: "var(--sc-text-faint)", whiteSpace: "nowrap" }}>Actualizado {ultima ? ultima.toLocaleTimeString() : "—"}</span>
        <button onClick={() => cargar()} title="Actualizar ahora" style={{ background: "transparent", border: "1px solid var(--sc-card-line)", color: "var(--sc-text-soft)", borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>⟳</button>
      </div>
    </div>
  );
}

// Convierte "a:b;c:d" (CSS) en objeto de estilo React camelCase.
function cssObj(s: string): Record<string, string> {
  return Object.fromEntries(s.split(";").filter(Boolean).map((r) => { const [k, v] = r.split(":"); return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v.trim()]; }));
}
