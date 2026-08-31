"use client";

import ListaMaestra from "@/app/components/ListaMaestra";

const nom = (p: any) => (p?.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "—");
const fFecha = (s: any) => (s ? new Date(s).toLocaleString() : "—");

export default function InspeccionesPage() {
  return (
    <ListaMaestra
      titulo="Inspecciones"
      subtitulo="Inspecciones de seguridad (checklist). Se registran en campo desde el móvil."
      tabla="inspecciones"
      modulo="inspecciones"
      orderBy="creado_en"
      select="id, folio, tipo_inspeccion, resultado, creado_en, movimiento:movimientos(folio), realizada:personal(numero_placa, persona:personas(nombre, apellido_paterno)), sitio:sitios(nombre), estatus"
      placeholderBuscar="Folio, tipo…"
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.tipo_inspeccion ?? ""} ${r.resultado ?? ""}`}
      detalleHref={(r) => `/logistica/inspecciones/${r.id}`}
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—", campo: "folio" },
        { header: "Tipo", celda: (r) => r.tipo_inspeccion ?? "—" },
        { header: "Movimiento", celda: (r) => r.movimiento?.folio ?? "—" },
        { header: "Sitio", celda: (r) => r.sitio?.nombre ?? "—" },
        { header: "Realizó", celda: (r) => nom(r.realizada) },
        { header: "Resultado", celda: (r) => r.resultado ?? "—" },
        { header: "Fecha", celda: (r) => fFecha(r.creado_en), campo: "creado_en" },
      ]}
      quickView={(r) => (
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div><b>{r.folio ?? "Inspección"}</b> · {r.tipo_inspeccion ?? "—"}</div>
          <div>Movimiento: {r.movimiento?.folio ?? "—"}</div>
          <div>Sitio: {r.sitio?.nombre ?? "—"}</div>
          <div>Realizó: {nom(r.realizada)}</div>
          <div>Resultado: {r.resultado ?? "—"}</div>
          <div>Fecha: {fFecha(r.creado_en)}</div>
        </div>
      )}
    />
  );
}
