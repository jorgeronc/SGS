"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { historialCad, type HistItem } from "@/lib/despachos";
import { getConfig } from "@/lib/config";
import { mapaOsmDataURL } from "@/lib/mapaEstaticoImg";

// Genera el PDF del incidente (con pdfmake: encabezado y pie repetidos + número de
// página nativos en todos los navegadores) y ofrece Descargar o Imprimir. AppShell
// muestra esta ruta a pantalla completa (termina en /imprimir).
const DESP_REPORTE: Record<string, string> = { recibida: "Recibida", despachada: "Despachado", en_atencion: "En atención", resuelta: "Resuelta" };
const AZUL = "#1F3A5F";
const nomPersona = (p: any) => [p?.nombre, p?.apellido_paterno, p?.apellido_materno].filter(Boolean).join(" ") || "—";
const TIPO_VINC: Record<string, string> = { persona: "Persona", vehiculo: "Vehículo", evidencia: "Evidencia", tarea: "Tarea", cad: "Incidente" };
const fFecha = (s: any) => (s ? new Date(s).toLocaleString() : "—");
const blobToDataURL = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(b); });
async function urlToDataURL(url: string): Promise<string | null> { try { const r = await fetch(url); if (!r.ok) return null; return await blobToDataURL(await r.blob()); } catch { return null; } }

export default function IncidenteImprimirPage() {
  const params = useParams<{ id: string }>();
  const [inc, setInc] = useState<any>(null);
  const [corporacion, setCorporacion] = useState<string>("");
  const [sitio, setSitio] = useState<string>("");
  const [cliente, setCliente] = useState<string>("");
  const [despachos, setDespachos] = useState<any[]>([]);
  const [historial, setHistorial] = useState<HistItem[]>([]);
  const [personas, setPersonas] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [evidencias, setEvidencias] = useState<any[]>([]);
  const [tareas, setTareas] = useState<any[]>([]);
  const [vinculos, setVinculos] = useState<any[]>([]);
  const [listo, setListo] = useState(false);
  // Recursos gráficos (dataURL). undefined = cargando, null = no disponible.
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [mapa, setMapa] = useState<string | null | undefined>(undefined);
  const [fotosData, setFotosData] = useState<string[] | undefined>(undefined);
  const [generando, setGenerando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    getConfig().then((c) => setCorporacion(c?.corporacion ?? ""));
    urlToDataURL("/escudo.png").then(setLogo);
    (async () => {
      const { data: l } = await supabase.from("llamadas_cad").select("*").eq("id", params.id).maybeSingle();
      setInc(l);
      if ((l as any)?.sitio_id) {
        const { data: s } = await supabase.from("sitios").select("nombre, direccion, cliente:clientes(razon_social)").eq("id", (l as any).sitio_id).maybeSingle();
        setSitio([(s as any)?.nombre, (s as any)?.direccion].filter(Boolean).join(" · "));
        setCliente((s as any)?.cliente?.razon_social ?? "");
      }

      const { data: d } = await supabase.from("despachos")
        .select("recurso_tipo, recurso_nombre, es_contacto, estado, fecha_asignacion")
        .eq("llamada_id", params.id).eq("estatus", "activo").order("fecha_asignacion", { ascending: true });
      setDespachos((d as any[]) ?? []);

      historialCad(params.id).then(setHistorial);

      const { data: v } = await supabase.from("vinculos")
        .select("tipo_relacion, entidad_destino_tipo, entidad_destino_id")
        .eq("entidad_origen_tipo", "cad").eq("entidad_origen_id", params.id).eq("estatus", "activo");
      const vs = (v as any[]) ?? [];
      setVinculos(vs);
      const idsPor = (t: string) => vs.filter((x) => x.entidad_destino_tipo === t).map((x) => x.entidad_destino_id);
      const idsP = idsPor("persona"), idsV = idsPor("vehiculo"), idsE = idsPor("evidencia"), idsT = idsPor("tarea");
      if (idsP.length) { const { data } = await supabase.from("personas").select("id, nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, originario_de, ocupacion, estado_civil, escolaridad").in("id", idsP); setPersonas((data as any[]) ?? []); }
      if (idsV.length) { const { data } = await supabase.from("vehiculos").select("id, placas, marca, color, vin, tarjeta_circulacion, descripcion").in("id", idsV); setVehiculos((data as any[]) ?? []); }
      if (idsE.length) { const { data } = await supabase.from("evidencias").select("id, folio, tipo, descripcion, fecha_recoleccion").in("id", idsE); setEvidencias((data as any[]) ?? []); }
      if (idsT.length) { const { data } = await supabase.from("tareas").select("*").in("id", idsT); setTareas((data as any[]) ?? []); }

      setListo(true);
    })();
  }, [params.id]);

  const hayMapa = inc?.latitud != null && inc?.longitud != null;

  const fotos = useMemo(() => {
    const dd = inc?.datos_adicionales ?? {};
    return (Array.isArray(dd.fotografias) ? dd.fotografias : []) as string[];
  }, [inc]);

  // Mapa estático del incidente (dataURL) para el PDF.
  useEffect(() => {
    if (!listo) return;
    if (!hayMapa) { setMapa(null); return; }
    mapaOsmDataURL(Number(inc.latitud), Number(inc.longitud)).then(setMapa).catch(() => setMapa(null));
  }, [listo, hayMapa, inc]);

  // Fotografías del reporte a dataURL.
  useEffect(() => {
    if (!listo) return;
    if (fotos.length === 0) { setFotosData([]); return; }
    (async () => {
      const urls = await Promise.all(fotos.map((p) => urlToDataURL(supabase.storage.from("fotos").getPublicUrl(p).data.publicUrl)));
      setFotosData(urls.filter((u): u is string => !!u));
    })();
  }, [listo, fotos]);

  const tiempoRespuesta = useMemo(() => {
    const recep = inc?.fecha_recepcion || inc?.creado_en;
    const at = historial.find((h) => h.campo === "estado_despacho" && h.estado === "en_atencion")?.cambiado_en;
    if (!recep || !at) return null;
    const min = Math.max(0, Math.round((new Date(at).getTime() - new Date(recep).getTime()) / 60000));
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
  }, [inc, historial]);

  const preparando = !listo || logo === undefined || mapa === undefined || fotosData === undefined;

  function nombreArchivo(): string {
    const ubic = inc?.direccion || sitio || "";
    const base = [inc?.folio, `${inc?.tipo ?? "Incidente"}${ubic ? ` ${ubic}` : ""}`.trim()].filter(Boolean).join(" - ");
    return (base.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()) || "Incidente";
  }

  function construirDoc(): any {
    const anchoLinea = 595.28 - 36 * 2; // ancho de contenido (A4 menos márgenes)
    const campos: [string, any][] = [
      ["Folio", inc.folio ?? "—"],
      ["Tipo de incidencia", inc.tipo ?? "—"],
      ["Prioridad", inc.prioridad ?? "—"],
      ["Estado del despacho", DESP_REPORTE[inc.estado_despacho] ?? inc.estado_despacho ?? "—"],
      ["Reportante", inc.reportante ?? "—"],
      ["Teléfono", inc.telefono ?? "—"],
      ["Recepción", fFecha(inc.fecha_recepcion || inc.creado_en)],
      ["Cierre", inc.fecha_cierre ? fFecha(inc.fecha_cierre) : "—"],
      ["Tiempo de respuesta", tiempoRespuesta ?? "—"],
    ];
    if (inc.conclusion) campos.push(["Conclusión", `${inc.conclusion}${inc.motivo_cierre ? ` · ${inc.motivo_cierre}` : ""}`]);
    const mitad = Math.ceil(campos.length / 2);
    const colDatos = (arr: [string, any][]) => ({
      table: { widths: ["auto", "*"], body: arr.map(([k, v]) => [{ text: k, bold: true, color: "#333" }, { text: String(v) }]) },
      layout: "lightHorizontalLines",
    });

    const tabla = (titulo: string, headers: string[], filas: any[][], vacio: string): any[] => {
      const body: any[] = [headers.map((h) => ({ text: h, style: "th" }))];
      if (filas.length) filas.forEach((f) => body.push(f.map((c) => ({ text: c == null || c === "" ? "—" : String(c) }))));
      else body.push([{ text: vacio, colSpan: headers.length, alignment: "center", color: "#888", margin: [0, 4, 0, 4] }, ...Array(headers.length - 1).fill({})]);
      return [
        { text: titulo, style: "sec" },
        { table: { headerRows: 1, widths: headers.map(() => "*"), body }, fontSize: 8, layout: { fillColor: (ri: number) => (ri === 0 ? AZUL : ri % 2 ? null : "#f5f8fb"), hLineColor: () => "#e2e6ea", vLineColor: () => "#e2e6ea", hLineWidth: () => 0.5, vLineWidth: () => 0.5 } },
      ];
    };

    const content: any[] = [];

    // Datos principales (2 columnas)
    content.push({ text: "Datos principales", style: "sec" });
    content.push({ columns: [colDatos(campos.slice(0, mitad)), colDatos(campos.slice(mitad))], columnGap: 16 });

    // Ubicación + mapa
    content.push({ text: "Ubicación", style: "sec" });
    content.push({
      text: [
        ...(cliente ? [{ text: "Cliente: ", bold: true }, { text: cliente + "   " }] : []),
        { text: "Dirección: ", bold: true }, { text: inc.direccion ?? "—" },
        ...(hayMapa ? [{ text: "   Coordenadas: ", bold: true }, { text: `${Number(inc.latitud).toFixed(6)}, ${Number(inc.longitud).toFixed(6)}` }] : []),
      ], fontSize: 9,
    });
    if (mapa) content.push({ image: mapa, width: anchoLinea, margin: [0, 6, 0, 0] });

    // Descripción
    content.push({ text: "Descripción y narrativas", style: "sec" });
    content.push({ table: { widths: ["*"], body: [[{ text: inc.descripcion || "—", margin: [3, 3, 3, 3], fontSize: 9 }]] }, layout: { hLineColor: () => "#ddd", vLineColor: () => "#ddd", hLineWidth: () => 0.5, vLineWidth: () => 0.5 } });

    // Tablas de contenido de pestañas
    content.push(...tabla("Recursos despachados / contactados", ["Recurso", "Tipo", "Estado", "Fecha / hora"],
      despachos.map((d) => [d.recurso_nombre ?? "Recurso", d.es_contacto ? "Autoridad" : d.recurso_tipo, d.es_contacto ? "Enterada" : d.estado, fFecha(d.fecha_asignacion)]), "Sin recursos despachados."));

    content.push(...tabla("Historial de cambios de estatus", ["Cambio", "Fecha / hora", "Usuario"],
      historial.map((h) => [h.etiqueta, fFecha(h.cambiado_en), h.usuario]), "Sin cambios registrados."));

    content.push(...tabla("Personas involucradas", ["Nombre", "Sexo", "Nacimiento", "Originario de", "Ocupación", "Edo. civil", "Escolaridad"],
      personas.map((p) => [nomPersona(p), p.sexo, p.fecha_nacimiento, p.originario_de, p.ocupacion, p.estado_civil, p.escolaridad]), "Sin personas registradas."));

    content.push(...tabla("Vehículos involucrados", ["Placas", "Marca", "Color", "VIN (Serie)", "T. circulación", "Descripción"],
      vehiculos.map((v) => [v.placas, v.marca, v.color, v.vin, v.tarjeta_circulacion, v.descripcion]), "Sin vehículos registrados."));

    content.push(...tabla("Evidencias", ["Folio", "Tipo", "Descripción", "Recolección"],
      evidencias.map((e) => [e.folio, e.tipo, e.descripcion, e.fecha_recoleccion ? fFecha(e.fecha_recoleccion) : "—"]), "Sin evidencias registradas."));

    // Archivos adjuntos (fotografías)
    content.push({ text: "Archivos adjuntos", style: "sec" });
    if (fotosData && fotosData.length) {
      for (let i = 0; i < fotosData.length; i += 4) {
        content.push({ columns: fotosData.slice(i, i + 4).map((d) => ({ image: d, width: 118, height: 118 })), columnGap: 6, margin: [0, 4, 0, 0] });
      }
    } else {
      content.push({ text: "Sin archivos adjuntos.", color: "#888", fontSize: 9 });
    }

    content.push(...tabla("Vínculos", ["Relación", "Tipo", "Registro"],
      vinculos.map((v) => [v.tipo_relacion, TIPO_VINC[v.entidad_destino_tipo] ?? v.entidad_destino_tipo, etiquetaDestino(v.entidad_destino_tipo, v.entidad_destino_id)]), "Sin vínculos."));

    content.push(...tabla("Tareas", ["Folio", "Título", "Estado", "Prioridad"],
      tareas.map((t) => [t.folio, t.titulo ?? t.descripcion, t.estado, t.prioridad]), "Sin tareas ligadas."));

    return {
      pageSize: "A4",
      pageMargins: [36, 92, 36, 42],
      defaultStyle: { fontSize: 9, color: "#111" },
      info: { title: nombreArchivo() },
      header: () => ({
        margin: [36, 14, 36, 0],
        stack: [
          {
            columns: [
              logo ? { image: logo, width: 46, height: 46 } : { text: "", width: 46 },
              {
                width: "*", margin: [8, 0, 0, 0],
                stack: [
                  ...(corporacion ? [{ text: corporacion.toUpperCase(), color: AZUL, bold: true, fontSize: 9 }] : []),
                  { text: `Reporte de Incidente${inc.folio ? " · " + inc.folio : ""}`, color: AZUL, bold: true, fontSize: 13 },
                  { text: [{ text: inc.tipo ?? "Incidencia", bold: true }, ...(sitio ? [{ text: " · " + sitio, bold: true }] : [])], fontSize: 9, color: "#555" },
                ],
              },
              {
                width: "auto",
                stack: [
                  { text: String(inc.estatus).toUpperCase(), bold: true, alignment: "right", fontSize: 9, color: inc.estatus === "cerrado" ? "#0a7c2f" : inc.estatus === "cancelado" ? "#b00020" : AZUL },
                  { text: `Prioridad: ${inc.prioridad ?? "—"}`, alignment: "right", fontSize: 9, color: "#666" },
                ],
              },
            ],
          },
          { canvas: [{ type: "line", x1: 0, y1: 6, x2: anchoLinea, y2: 6, lineWidth: 1.4, lineColor: AZUL }] },
        ],
      }),
      footer: (currentPage: number, pageCount: number) => ({
        margin: [36, 6, 36, 0],
        columns: [
          { width: "*", text: `Impresión: ${new Date().toLocaleString()}${corporacion ? " · " + corporacion : " · SGS — Sistema de Gestión de Seguridad"}`, fontSize: 8, color: "#888" },
          { width: "auto", text: `Página ${currentPage} de ${pageCount}`, fontSize: 8, color: "#888", alignment: "right", margin: [10, 0, 0, 0] },
        ],
      }),
      content,
      styles: { sec: { fontSize: 11, bold: true, color: AZUL, margin: [0, 12, 0, 4] }, th: { bold: true, color: "#fff", fontSize: 8 } },
    };
  }

  function etiquetaDestino(t: string, id: string): string {
    if (t === "persona") return nomPersona(personas.find((p) => p.id === id));
    if (t === "vehiculo") { const x = vehiculos.find((v) => v.id === id); return x ? (x.placas || x.marca || "Vehículo") : "Vehículo"; }
    if (t === "evidencia") { const x = evidencias.find((e) => e.id === id); return x ? (x.folio || x.descripcion || "Evidencia") : "Evidencia"; }
    if (t === "tarea") { const x = tareas.find((k) => k.id === id); return x ? (x.folio || x.titulo || x.descripcion || "Tarea") : "Tarea"; }
    return id.slice(0, 8);
  }

  async function crearPdf(): Promise<any> {
    const pmMod: any = await import("pdfmake/build/pdfmake");
    const vfsMod: any = await import("pdfmake/build/vfs_fonts");
    const pdfMake: any = pmMod.default ?? pmMod;
    const vfs: any = vfsMod.default ?? vfsMod;
    if (typeof pdfMake.addVirtualFileSystem === "function") pdfMake.addVirtualFileSystem(vfs?.pdfMake?.vfs ?? vfs);
    else pdfMake.vfs = vfs?.pdfMake?.vfs ?? vfs;
    return pdfMake.createPdf(construirDoc());
  }

  async function accion(tipo: "descargar" | "imprimir") {
    setErr(null); setGenerando(true);
    try {
      const pdf = await crearPdf();
      if (tipo === "descargar") pdf.download(`${nombreArchivo()}.pdf`);
      else pdf.print();
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo generar el PDF.");
    } finally {
      setGenerando(false);
    }
  }

  const btnP: React.CSSProperties = { background: AZUL, color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" };
  const btnS: React.CSSProperties = { background: "transparent", color: AZUL, border: `1px solid ${AZUL}`, borderRadius: 10, padding: "11px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" };

  if (!inc) return <div style={{ padding: 28, fontFamily: "Arial, sans-serif" }}>Cargando incidente…</div>;

  return (
    <div style={{ minHeight: "78vh", display: "grid", placeItems: "center", fontFamily: "Arial, sans-serif", padding: 24 }}>
      <div style={{ border: "1px solid #e2e6ea", borderRadius: 16, padding: "30px 36px", maxWidth: 480, width: "100%", textAlign: "center", boxShadow: "0 8px 30px rgba(0,0,0,.07)" }}>
        <div style={{ fontSize: 44 }}>📄</div>
        <h2 style={{ margin: "8px 0 4px", color: AZUL }}>PDF del incidente</h2>
        <div style={{ color: "#666", fontSize: 13, marginBottom: 22 }}>{inc.folio ? `${inc.folio} · ` : ""}{inc.tipo ?? "Incidencia"}{sitio ? ` · ${sitio}` : ""}</div>
        {preparando ? (
          <div style={{ color: "#888", fontSize: 14, padding: "8px 0" }}>Preparando el PDF…</div>
        ) : (
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={btnP} disabled={generando} onClick={() => accion("descargar")}>⬇️ {generando ? "Generando…" : "Descargar"}</button>
            <button style={btnS} disabled={generando} onClick={() => accion("imprimir")}>🖨️ Imprimir</button>
          </div>
        )}
        {mapa === null && hayMapa && <div style={{ color: "#a06", fontSize: 11.5, marginTop: 12 }}>El mapa no pudo cargarse; el PDF se genera con las coordenadas.</div>}
        {err && <div style={{ color: "#b00020", fontSize: 12, marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  );
}
