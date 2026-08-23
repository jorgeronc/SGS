"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import { getConfig } from "@/lib/config";

interface Punto {
  id: string; folio: string | null; nombre: string; codigo: string; orden: number | null;
  sitio: { nombre: string | null; cliente: { razon_social: string | null } | null } | null;
}

// Hoja imprimible de etiquetas QR de puntos de control. Cada etiqueta lleva el
// QR (contenido = código que valida rpc_rondin_marcar) + sitio, punto y código.
// Filtros: ?punto=<id> (uno) o ?sitio=<id> (todos los del sitio); sin filtro, todos.
function Hoja() {
  const params = useSearchParams();
  const puntoId = params.get("punto");
  const sitioId = params.get("sitio");
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [corp, setCorp] = useState("");
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      getConfig().then((c) => setCorp(c?.corporacion ?? ""));
      let q = supabase.from("puntos_control")
        .select("id, folio, nombre, codigo, orden, sitio:sitios(nombre, cliente:clientes(razon_social))")
        .eq("estatus", "activo").order("orden", { ascending: true });
      if (puntoId) q = q.eq("id", puntoId);
      else if (sitioId) q = q.eq("sitio_id", sitioId);
      const { data } = await q;
      setPuntos((data as any[]) ?? []);
      setListo(true);
    })();
  }, [puntoId, sitioId]);

  useEffect(() => {
    if (listo && puntos.length > 0) { const t = setTimeout(() => window.print(), 700); return () => clearTimeout(t); }
  }, [listo, puntos.length]);

  return (
    <div style={{ padding: 16, fontFamily: "Arial, sans-serif", color: "#111" }}>
      <style>{`
        @media print { .no-print { display: none } @page { margin: 12mm } }
        .qr-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .qr-card { border: 1px dashed #999; border-radius: 8px; padding: 14px; text-align: center; break-inside: avoid; }
      `}</style>

      <div className="no-print" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={() => window.print()}>🖨️ Imprimir</button>
        <span style={{ color: "#666", fontSize: 13 }}>{puntos.length} etiqueta(s)</span>
      </div>

      {listo && puntos.length === 0 ? (
        <p>No hay puntos de control activos para imprimir.</p>
      ) : (
        <div className="qr-grid">
          {puntos.map((p) => (
            <div key={p.id} className="qr-card">
              <div style={{ fontSize: 12, color: "#666" }}>{corp || "SGS"}</div>
              <div style={{ fontSize: 13, color: "#0b3d66", fontWeight: 700 }}>{p.sitio?.nombre ?? "Sitio"}</div>
              <div style={{ fontSize: 17, fontWeight: 800, margin: "2px 0 8px" }}>{p.nombre}</div>
              <QRCodeSVG value={p.codigo} size={200} includeMargin level="M" />
              <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 14, fontWeight: 700 }}>{p.codigo}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                {p.folio ? `${p.folio} · ` : ""}{p.orden != null ? `Punto ${p.orden}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PuntosImprimirPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Cargando…</div>}>
      <Hoja />
    </Suspense>
  );
}
