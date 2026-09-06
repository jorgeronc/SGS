"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import { urlFoto } from "@/lib/fotos";

// Formato imprimible de credencial (CR80, 85.6×54 mm), distinto por TIPO. Se
// renderiza a pantalla completa (AppShell no dibuja chrome en rutas /imprimir) y
// llama a window.print(). Si hay plantilla imagen del tipo, se usa como fondo.
type Cat = "Empleado" | "Guardia" | "Visitante" | "Servicio";
const PALETA: Record<string, { band: string; accent: string; ink: string; sub: string; bandInk: string; bw?: boolean }> = {
  Empleado: { band: "#0f5b78", accent: "#2aa7c9", ink: "#132b34", sub: "#5b7480", bandInk: "#eafcff" },
  Guardia: { band: "#0b2540", accent: "#f4a03f", ink: "#141d28", sub: "#61707f", bandInk: "#ffffff" },
  Servicio: { band: "#14663f", accent: "#37b06e", ink: "#123625", sub: "#5a7566", bandInk: "#eafff3" },
  Visitante: { band: "#ffffff", accent: "#000000", ink: "#000000", sub: "#333333", bandInk: "#000000", bw: true },
};
const SUBT: Record<string, string> = { Empleado: "Personal interno", Guardia: "Elemento de seguridad", Visitante: "Pase temporal", Servicio: "Proveedor / servicio" };
const fFecha = (s?: string | null) => (s ? new Date(s).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

export default function ImprimirCredencialPage() {
  const params = useParams<{ id: string }>();
  const [cred, setCred] = useState<any>(null);
  const [persona, setPersona] = useState<any>(null);
  const [numero, setNumero] = useState<string | null>(null);
  const [plantilla, setPlantilla] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: c, error: e } = await supabase.from("credenciales")
        .select("id, folio, categoria, tipo, codigo, descripcion, fecha_emision, vigencia_fin, persona_id, datos_adicionales, estatus, persona:personas(nombre, apellido_paterno, apellido_materno, ocupacion, fotografias)")
        .eq("id", params.id).maybeSingle();
      if (e) { setError(e.message); return; }
      if (!c) { setError("Credencial no encontrada."); return; }
      setCred(c); setPersona((c as any).persona ?? null);
      if ((c as any).persona_id) {
        supabase.from("personal").select("numero_placa").eq("persona_id", (c as any).persona_id).eq("estatus", "activo").maybeSingle()
          .then(({ data }) => setNumero((data as any)?.numero_placa ?? null));
      }
      if ((c as any).categoria) {
        supabase.from("credencial_plantillas").select("imagen_ruta").eq("categoria", (c as any).categoria).maybeSingle()
          .then(({ data }) => setPlantilla((data as any)?.imagen_ruta ?? null));
      }
    })();
  }, [params.id]);

  // Imprime automáticamente cuando ya cargó la credencial.
  useEffect(() => { if (cred) { const t = setTimeout(() => window.print(), 700); return () => clearTimeout(t); } }, [cred]);

  const cat: Cat = (cred?.categoria as Cat) ?? "Empleado";
  const p = PALETA[cat] ?? PALETA.Empleado;
  const nombre = persona ? `${persona.nombre ?? ""} ${persona.apellido_paterno ?? ""} ${persona.apellido_materno ?? ""}`.trim() : (cred?.descripcion ?? "Credencial");
  const dd = cred?.datos_adicionales ?? {};
  const empresa = dd.empresa ?? null;
  const role = cat === "Guardia" ? "Guardia de seguridad"
    : cat === "Empleado" ? (persona?.ocupacion ?? "Personal interno")
    : (empresa ? `Empresa: ${empresa}` : (cred?.descripcion ?? SUBT[cat]));
  const fotoUrl = useMemo(() => urlFoto(Array.isArray(persona?.fotografias) ? persona.fotografias[0] : null), [persona]);
  const bgUrl = plantilla ? urlFoto(plantilla) : null;
  const numeroMostrar = numero ?? cred?.codigo ?? "—";

  const css = `
    :root{color-scheme:light}
    /* La página de impresión ES del tamaño de la credencial (CR80). */
    @page{size:85.6mm 54mm;margin:0}
    *{box-sizing:border-box}
    body{background:#e9ecf0}
    .sheet{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;font-family:'Barlow',system-ui,Arial,sans-serif}
    .barra{display:flex;gap:10px}
    .barra button{background:#f4a03f;color:#fff;border:none;border-radius:9px;padding:10px 18px;font-weight:800;font-size:14px;cursor:pointer}
    .barra a{background:transparent;border:1px solid #c9d2dc;color:#333;border-radius:9px;padding:10px 18px;font-weight:700;font-size:14px;text-decoration:none}
    .card{width:85.6mm;height:54mm;border-radius:3mm;overflow:hidden;position:relative;background:#fff;color:${p.ink};
          box-shadow:0 6px 20px rgba(20,30,48,.22);display:grid;grid-template-rows:auto 1fr;border:${p.bw ? "0.4mm solid #000" : "0.2mm solid rgba(0,0,0,.15)"}}
    .card.bg{background-size:cover;background-position:center}
    .band{background:${p.band};color:${p.bandInk};display:flex;align-items:center;gap:2.2mm;padding:1.5mm 3mm;${p.bw ? "border-bottom:0.4mm solid #000" : ""}}
    .card.bg .band{background:rgba(0,0,0,0);color:transparent}
    .emblem{width:6mm;height:6.8mm;flex:0 0 auto}
    .org{display:flex;flex-direction:column;line-height:1.05}
    .org-name{font-family:'Saira Condensed',Arial;font-weight:700;font-size:3.4mm;letter-spacing:.02em;text-transform:uppercase}
    .org-sub{font-size:2.2mm;letter-spacing:.14em;text-transform:uppercase;color:${p.accent};font-weight:700}
    .type{margin-left:auto;font-family:'Saira Condensed',Arial;font-weight:800;font-size:4.2mm;letter-spacing:.08em;text-transform:uppercase;
          background:${p.bw ? "#fff" : p.accent};color:${p.bw ? "#000" : "#16202c"};border:${p.bw ? "0.35mm solid #000" : "0"};padding:.4mm 2.4mm;border-radius:1.4mm}
    /* Columna de foto de ancho FIJO (evita que la pista 'auto' se infle con el zoom
       y deje un hueco). Los datos quedan pegados a la foto. */
    .body{display:grid;grid-template-columns:31mm minmax(0,1fr);gap:2.6mm;padding:2mm 3mm 2mm;min-height:0}
    .photo{width:31mm;height:100%;border-radius:2mm;overflow:hidden;border:.45mm solid ${p.bw ? "#000" : p.accent};background:#dfe6ee;position:relative}
    .photo img{width:100%;height:100%;object-fit:cover}
    .photo .ph{position:absolute;inset:0;display:grid;place-items:end center}
    .photo .ph svg{width:78%;opacity:.5}
    .right{min-width:0;display:flex;flex-direction:column;gap:1.4mm}
    .name{font-family:'Saira Condensed',Arial;font-weight:800;font-size:5mm;line-height:1;letter-spacing:.01em;color:${p.ink}}
    .role{font-size:2.9mm;font-weight:600;color:${p.accent};text-transform:uppercase;letter-spacing:.03em}
    .fields{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm 3mm;margin-top:1mm;flex:1;align-content:start}
    .fields dt{font-size:2.1mm;letter-spacing:.08em;text-transform:uppercase;color:${p.sub};font-weight:700;margin:0}
    .fields dd{margin:.2mm 0 0;font-size:3mm;font-weight:600;color:${p.ink}}
    .bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:2mm;border-top:.25mm solid ${p.bw ? "#000" : "rgba(0,0,0,.12)"};padding-top:1.6mm}
    .meta{display:flex;flex-direction:column;gap:.4mm;min-width:0}
    .cardno{font-family:'Saira Condensed',Arial;font-weight:700;font-size:3.4mm;color:${p.bw ? "#000" : p.band}}
    .foot{font-size:2mm;color:${p.sub}}
    .qr{background:#fff;padding:.6mm;border-radius:1mm;${p.bw ? "border:.3mm solid #000" : ""}}
    .edge{position:absolute;top:0;bottom:0;left:0;width:1.6mm;background:${p.accent}}
    .card.bg .edge{display:none}
    @media print{
      html,body{background:#fff;margin:0;padding:0}
      .barra{display:none}
      .sheet{padding:0;margin:0;min-height:0;display:block}
      /* La tarjeta llena EXACTAMENTE la página (sin márgenes ni escala). El zoom
         de la vista previa NO afecta la impresión. */
      .card{box-shadow:none;margin:0;border-radius:0;width:85.6mm;height:54mm;page-break-inside:avoid;zoom:1 !important}
    }
  `;

  const emblema = (
    <svg className="emblem" viewBox="0 0 30 34" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: p.bw ? "#000" : p.bandInk }}>
      <path d="M15 1.5 L28 5.2 V16 C28 24.6 22 30.6 15 32.6 C8 30.6 2 24.6 2 16 V5.2 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15 7 L22 9.4 V16 C22 20.8 18.6 24.2 15 25.8 C11.4 24.2 8 20.8 8 16 V9.4 Z" fill="none" stroke="currentColor" strokeWidth="1.1" opacity=".75" />
      <text x="15" y="19.4" textAnchor="middle" fontFamily="Saira Condensed, sans-serif" fontWeight="800" fontSize="8.2" fill="currentColor">SGS</text>
    </svg>
  );

  if (error) return <div style={{ padding: 24 }}>{error}</div>;
  if (!cred) return <div style={{ padding: 24 }}>Cargando…</div>;

  return (
    <div className="sheet">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700;800&family=Barlow:wght@400;600;700&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="barra">
        <button onClick={() => window.print()}>🖨️ Imprimir</button>
        <a href={`/credenciales/${params.id}`}>Ver credencial</a>
        <a href="/credenciales">Volver</a>
      </div>
      <p style={{ fontSize: 12, color: "#667", margin: 0 }}>La impresión sale a 85.6 × 54 mm (CR80). Para revisar la credencial ampliada usa «Ver credencial».</p>

      <div className={`card${bgUrl ? " bg" : ""}`} style={bgUrl ? { backgroundImage: `url(${bgUrl})` } : undefined}>
        <div className="edge" />
        <div className="band">
          {emblema}
          <div className="org"><span className="org-name">Consultech Seguridad</span><span className="org-sub">{SUBT[cat]}</span></div>
          <span className="type">{cat}</span>
        </div>
        <div className="body">
          <div className="photo">
            {fotoUrl ? <img src={fotoUrl} alt="Foto" /> : <span className="ph"><svg viewBox="0 0 100 100"><circle cx="50" cy="36" r="19" fill="#8ea2b5" /><path d="M14 100 C14 72 30 60 50 60 C70 60 86 72 86 100 Z" fill="#8ea2b5" /></svg></span>}
          </div>
          <div className="right">
            <div>
              <div className="name">{nombre}</div>
              <div className="role">{role}</div>
            </div>
            <dl className="fields">
              <div><dt>{cat === "Visitante" ? "Folio" : "Número"}</dt><dd>{cat === "Visitante" ? (cred.folio ?? cred.codigo) : numeroMostrar}</dd></div>
              {empresa && <div><dt>Empresa</dt><dd>{empresa}</dd></div>}
              <div><dt>Emisión</dt><dd>{fFecha(cred.fecha_emision)}</dd></div>
              <div><dt>{cat === "Visitante" ? "Vence" : "Vigencia"}</dt><dd>{cred.vigencia_fin ? fFecha(cred.vigencia_fin) : "Sin venc."}</dd></div>
            </dl>
            <div className="bottom">
              <div className="meta"><div className="cardno">{cred.codigo}</div><div className="foot">{cat === "Visitante" ? "Devolver al salir · SGS" : "Válida con ID oficial · SGS"}</div></div>
              {cred.tipo !== "nfc" && cred.codigo && <div className="qr"><QRCodeSVG value={cred.codigo} size={46} level="M" /></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
