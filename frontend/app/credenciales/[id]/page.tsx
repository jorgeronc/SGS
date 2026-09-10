"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import { urlFoto } from "@/lib/fotos";
import CamaraFoto from "@/app/components/CamaraFoto";

// Vista "Abrir credencial": muestra los DATOS + la credencial COMPLETA (a tamaño
// cómodo, como se verá impresa) y permite descargarla como PNG. La impresión real
// (CR80) vive en /credenciales/[id]/imprimir.
type Cat = "Empleado" | "Guardia" | "Visitante" | "Servicio";
const PALETA: Record<string, { band: string; accent: string; ink: string; sub: string; bandInk: string; bw?: boolean }> = {
  Empleado: { band: "#0f5b78", accent: "#2aa7c9", ink: "#132b34", sub: "#5b7480", bandInk: "#eafcff" },
  Guardia: { band: "#0b2540", accent: "#f4a03f", ink: "#141d28", sub: "#61707f", bandInk: "#ffffff" },
  Servicio: { band: "#14663f", accent: "#37b06e", ink: "#123625", sub: "#5a7566", bandInk: "#eafff3" },
  Visitante: { band: "#ffffff", accent: "#000000", ink: "#000000", sub: "#333333", bandInk: "#000000", bw: true },
};
const SUBT: Record<string, string> = { Empleado: "Personal interno", Guardia: "Elemento de seguridad", Visitante: "Pase temporal", Servicio: "Proveedor / servicio" };
const fFecha = (s?: string | null) => (s ? new Date(s).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

export default function VerCredencialPage() {
  const params = useParams<{ id: string }>();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cred, setCred] = useState<any>(null);
  const [persona, setPersona] = useState<any>(null);
  const [numero, setNumero] = useState<string | null>(null);
  const [plantilla, setPlantilla] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);
  const [capturar, setCapturar] = useState(false);
  const [guardandoFoto, setGuardandoFoto] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: c, error: e } = await supabase.from("credenciales")
        .select("id, folio, categoria, tipo, codigo, descripcion, fecha_emision, vigencia_fin, vigencia_inicio, persona_id, datos_adicionales, estatus, persona:personas(nombre, apellido_paterno, apellido_materno, ocupacion, fotografias)")
        .eq("id", params.id).maybeSingle();
      if (e) { setError(e.message); return; }
      if (!c) { setError("Credencial no encontrada."); return; }
      setCred(c); setPersona((c as any).persona ?? null);
      if ((c as any).persona_id) supabase.from("personal").select("numero_placa").eq("persona_id", (c as any).persona_id).eq("estatus", "activo").maybeSingle().then(({ data }) => setNumero((data as any)?.numero_placa ?? null));
      if ((c as any).categoria) supabase.from("credencial_plantillas").select("imagen_ruta").eq("categoria", (c as any).categoria).maybeSingle().then(({ data }) => setPlantilla((data as any)?.imagen_ruta ?? null));
    })();
  }, [params.id]);

  const cat: Cat = (cred?.categoria as Cat) ?? "Empleado";
  const p = PALETA[cat] ?? PALETA.Empleado;
  const nombre = persona ? `${persona.nombre ?? ""} ${persona.apellido_paterno ?? ""} ${persona.apellido_materno ?? ""}`.trim() : (cred?.descripcion ?? "Credencial");
  const dd = cred?.datos_adicionales ?? {};
  const empresa = dd.empresa ?? null;
  const referencia = empresa || cred?.descripcion || null;
  const role = cat === "Guardia" ? "Guardia de seguridad" : cat === "Empleado" ? (persona?.ocupacion ?? "Personal interno") : cat === "Visitante" ? (referencia ?? "Visitante") : (empresa ? `Empresa: ${empresa}` : (cred?.descripcion ?? SUBT[cat]));
  const fotoUrl = useMemo(() => urlFoto(Array.isArray(persona?.fotografias) ? persona.fotografias[0] : null), [persona]);
  const bgUrl = plantilla ? urlFoto(plantilla) : null;
  const numeroMostrar = numero ?? cred?.codigo ?? "—";
  const acceso = cred?.datos_adicionales?.acceso ?? {};

  // Foto en la cita: toma y guarda la foto en el registro de Personas.
  async function guardarFoto(blob: Blob) {
    if (!cred?.persona_id) return;
    setGuardandoFoto(true);
    try {
      const path = `personas/${cred.persona_id}/${Date.now()}.jpg`;
      const up = await supabase.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw up.error;
      const { data: cur } = await supabase.from("personas").select("fotografias").eq("id", cred.persona_id).maybeSingle();
      const previas = Array.isArray((cur as any)?.fotografias) ? (cur as any).fotografias : [];
      await supabase.from("personas").update({ fotografias: [path, ...previas], actualizado_en: new Date().toISOString() }).eq("id", cred.persona_id);
      setPersona((pp: any) => ({ ...(pp ?? {}), fotografias: [path, ...previas] }));
      setCapturar(false);
    } catch (e: any) { alert("No se pudo guardar la foto: " + (e?.message ?? e)); }
    finally { setGuardandoFoto(false); }
  }
  const vigente = cred ? (cred.estatus === "activo" && (!cred.vigencia_fin || new Date(cred.vigencia_fin).getTime() >= Date.now())) : false;

  async function descargarPng() {
    const node = cardRef.current; if (!node) return;
    setBajando(true);
    try {
      const { toPng } = await import("html-to-image");
      let dataUrl: string;
      try { dataUrl = await toPng(node, { pixelRatio: 3, cacheBust: true }); }
      catch { dataUrl = await toPng(node, { pixelRatio: 3, cacheBust: true, skipFonts: true }); }
      const a = document.createElement("a");
      a.href = dataUrl; a.download = `credencial-${cred.folio ?? cred.codigo}.png`; a.click();
    } catch (e: any) {
      alert("No se pudo generar el PNG: " + (e?.message ?? e));
    } finally { setBajando(false); }
  }

  const css = `
    .cv-card{width:480px;height:303px;border-radius:16px;overflow:hidden;position:relative;background:#fff;color:${p.ink};
      font-family:'Barlow',system-ui,Arial,sans-serif;box-shadow:0 8px 24px rgba(20,30,48,.18);
      display:grid;grid-template-rows:auto 1fr;border:${p.bw ? "1.5px solid #000" : "1px solid rgba(0,0,0,.1)"}}
    .cv-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
    .cv-band,.cv-body{position:relative;z-index:1}
    .cv-band{background:${p.band};color:${p.bandInk};display:flex;align-items:center;gap:11px;padding:11px 15px;${p.bw ? "border-bottom:1.5px solid #000" : ""}}
    .cv-org{display:flex;flex-direction:column;line-height:1.05}
    .cv-org-name{font-family:'Saira Condensed',Arial;font-weight:700;font-size:15px;letter-spacing:.03em;text-transform:uppercase}
    .cv-org-sub{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${p.accent};font-weight:700}
    .cv-type{margin-left:auto;font-family:'Saira Condensed',Arial;font-weight:800;font-size:19px;letter-spacing:.08em;text-transform:uppercase;
      background:${p.bw ? "#fff" : p.accent};color:${p.bw ? "#000" : "#16202c"};border:${p.bw ? "1.5px solid #000" : "0"};padding:2px 12px;border-radius:6px}
    .cv-body{display:grid;grid-template-columns:150px minmax(0,1fr);gap:15px;padding:14px 15px;min-height:0;align-items:start}
    .cv-photo{width:150px;aspect-ratio:3/4;border-radius:9px;overflow:hidden;border:2px solid ${p.bw ? "#000" : p.accent};background:#dfe6ee;position:relative;align-self:start}
    .cv-photo img{width:100%;height:100%;object-fit:cover}
    .cv-photo .ph{position:absolute;inset:0;display:grid;place-items:end center}
    .cv-photo .ph svg{width:82%;opacity:.5}
    .cv-right{min-width:0;display:flex;flex-direction:column;gap:6px}
    .cv-name{font-family:'Saira Condensed',Arial;font-weight:800;font-size:23px;line-height:1;color:${p.ink}}
    .cv-role{font-size:12.5px;font-weight:600;color:${p.accent};text-transform:uppercase;letter-spacing:.03em;margin-top:2px}
    .cv-fields{display:grid;grid-template-columns:1fr 1fr;gap:7px 14px;margin-top:6px;align-content:start}
    .cv-col{display:flex;flex-direction:column;gap:7px}
    .cv-fields dt{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${p.sub};font-weight:700;margin:0}
    .cv-fields dd{margin:1px 0 0;font-size:13.5px;font-weight:600;color:${p.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cv-bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-top:1px solid ${p.bw ? "#000" : "rgba(0,0,0,.12)"};margin-top:12px;padding-top:8px}
    .cv-meta{display:flex;flex-direction:column;gap:2px;min-width:0}
    .cv-cardno{font-family:'Saira Condensed',Arial;font-weight:700;font-size:15px;color:${p.bw ? "#000" : p.band}}
    .cv-foot{font-size:9.5px;color:${p.sub}}
    .cv-qr{background:#fff;padding:4px;border-radius:5px;${p.bw ? "border:1px solid #000" : ""}}
    .cv-edge{position:absolute;top:0;bottom:0;left:0;width:7px;background:${p.accent}}
    .cv-card.bg .cv-edge{display:none}
  `;

  if (error) return <main className="contenedor"><p style={{ color: "#b00020" }}>{error}</p><Link href="/credenciales">Volver</Link></main>;
  if (!cred) return <main className="contenedor"><p>Cargando…</p></main>;

  return (
    <main className="contenedor">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700;800&family=Barlow:wght@400;600;700&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Credencial {cred.folio ?? ""}</h2>
        <span style={{ marginLeft: "auto" }} />
        <button onClick={descargarPng} disabled={bajando} style={{ background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>{bajando ? "Generando…" : "⬇️ Descargar PNG"}</button>
        <Link href={`/credenciales/${params.id}/imprimir`} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 9, padding: "9px 16px", fontWeight: 700, textDecoration: "none", color: "var(--sc-text)" }}>🖨️ Imprimir</Link>
        <Link href="/credenciales" style={{ border: "1px solid var(--sc-card-line)", borderRadius: 9, padding: "9px 16px", fontWeight: 700, textDecoration: "none", color: "var(--sc-text)" }}>Volver</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "480px 1fr", gap: 24, alignItems: "start", flexWrap: "wrap" }}>
        {/* La credencial completa (imagen) */}
        <div ref={cardRef} className={`cv-card${bgUrl ? " bg" : ""}`}>
          {bgUrl && <img className="cv-bg" src={bgUrl} crossOrigin="anonymous" alt="" />}
          {!bgUrl && <div className="cv-edge" />}
          {!bgUrl && <div className="cv-band">
            <svg width="30" height="34" viewBox="0 0 30 34" fill="none" style={{ color: p.bw ? "#000" : p.bandInk }}>
              <path d="M15 1.5 L28 5.2 V16 C28 24.6 22 30.6 15 32.6 C8 30.6 2 24.6 2 16 V5.2 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M15 7 L22 9.4 V16 C22 20.8 18.6 24.2 15 25.8 C11.4 24.2 8 20.8 8 16 V9.4 Z" fill="none" stroke="currentColor" strokeWidth="1.1" opacity=".75" />
              <text x="15" y="19.4" textAnchor="middle" fontFamily="Saira Condensed, sans-serif" fontWeight="800" fontSize="8.2" fill="currentColor">SGS</text>
            </svg>
            <div className="cv-org"><span className="cv-org-name">Consultech Seguridad</span><span className="cv-org-sub">{SUBT[cat]}</span></div>
            <span className="cv-type">{cat}</span>
          </div>}
          <div className="cv-body">
            <div className="cv-photo">
              {fotoUrl ? <img src={fotoUrl} alt="Foto" crossOrigin="anonymous" /> : <span className="ph"><svg viewBox="0 0 100 100"><circle cx="50" cy="36" r="19" fill="#8ea2b5" /><path d="M14 100 C14 72 30 60 50 60 C70 60 86 72 86 100 Z" fill="#8ea2b5" /></svg></span>}
            </div>
            <div className="cv-right">
              <div><div className="cv-name">{nombre}</div><div className="cv-role">{role}</div></div>
              <div className="cv-fields">
                <div className="cv-col">
                  {cat !== "Visitante" && <div><dt>Número</dt><dd>{numeroMostrar}</dd></div>}
                  <div><dt>{cat === "Visitante" ? "Vence" : "Vigencia"}</dt><dd>{cred.vigencia_fin ? fFecha(cred.vigencia_fin) : "Sin venc."}</dd></div>
                </div>
                <div className="cv-col">
                  <div><dt>Emisión</dt><dd>{fFecha(cred.fecha_emision)}</dd></div>
                  {empresa && cat !== "Visitante" && <div><dt>Empresa</dt><dd>{empresa}</dd></div>}
                </div>
              </div>
              <div className="cv-bottom">
                <div className="cv-meta"><div className="cv-cardno">{cred.folio ?? cred.codigo}</div><div className="cv-foot">{cat === "Visitante" ? "Devolver al salir · SGS" : "Válida con ID oficial · SGS"}</div></div>
                {cred.tipo !== "nfc" && cred.codigo && <div className="cv-qr"><QRCodeSVG value={cred.codigo} size={58} level="M" /></div>}
              </div>
            </div>
          </div>
        </div>

        {/* Datos de la credencial */}
        <div>
          <h3 style={{ marginTop: 0 }}>{nombre}</h3>
          <dl className="sc-kv">
            <dt>Tipo</dt><dd>{cred.categoria ?? "—"}</dd>
            <dt>Folio</dt><dd>{cred.folio ?? "—"}</dd>
            <dt>{cat === "Visitante" ? "Empresa" : "Puesto / rol"}</dt><dd>{empresa ?? role}</dd>
            {cat === "Visitante" && dd.motivo && (<><dt>Motivo</dt><dd>{dd.motivo}</dd></>)}
            {cat === "Visitante" && dd.anfitrion && (<><dt>Anfitrión</dt><dd>{dd.anfitrion}</dd></>)}
            <dt>{cat === "Visitante" ? "Folio / código" : "Número"}</dt><dd>{cat === "Visitante" ? cred.codigo : numeroMostrar}</dd>
            <dt>Tecnología</dt><dd>{cred.tipo === "qr" ? "QR" : cred.tipo === "nfc" ? "NFC" : "Código temporal"}</dd>
            <dt>Código</dt><dd><code>{cred.codigo}</code></dd>
            <dt>Emisión</dt><dd>{cred.fecha_emision ? new Date(cred.fecha_emision).toLocaleString() : "—"}</dd>
            <dt>Vence</dt><dd>{cred.vigencia_fin ? new Date(cred.vigencia_fin).toLocaleString() : "sin vencimiento"}</dd>
            <dt>Estado</dt><dd style={{ color: vigente ? "#0a7c2f" : "#b00020", fontWeight: 700 }}>{vigente ? "Vigente" : "No vigente"}</dd>
          </dl>

          {(acceso.sitios?.length || acceso.zonas?.length) ? (
            <div style={{ marginTop: 6, marginBottom: 4 }}>
              <div className="dash-sub" style={{ fontWeight: 700 }}>Acceso autorizado</div>
              <div style={{ fontSize: 13 }}>Sitios: {acceso.sitios?.length ? acceso.sitios.map((s: any) => s.nombre).join(", ") : "—"}</div>
              <div style={{ fontSize: 13 }}>Zonas: {acceso.zonas?.length ? acceso.zonas.map((z: any) => z.nombre).join(", ") : "—"}</div>
            </div>
          ) : null}

          {cred.persona_id && (
            <div style={{ marginTop: 10 }}>
              {!capturar ? (
                <button onClick={() => setCapturar(true)} style={{ background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>
                  📸 {fotoUrl ? "Actualizar foto" : "Tomar foto (en la cita)"}
                </button>
              ) : (
                <div style={{ border: "1px solid var(--sc-card-line)", borderRadius: 10, padding: 10 }}>
                  <div className="dash-sub" style={{ fontWeight: 700, marginBottom: 6 }}>Foto de la persona (cámara del dispositivo o conectada)</div>
                  <CamaraFoto onCapture={(b) => guardarFoto(b)} alto={220} />
                  {guardandoFoto && <p style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Guardando…</p>}
                  <button onClick={() => setCapturar(false)} style={{ marginTop: 6, border: "1px solid var(--sc-card-line)", background: "transparent", color: "var(--sc-text)", borderRadius: 9, padding: "7px 14px", cursor: "pointer" }}>Cancelar</button>
                </div>
              )}
            </div>
          )}

          {cred.persona_id && <p style={{ marginTop: 10 }}><Link href={`/personas/${cred.persona_id}`} style={{ color: "var(--sc-btn,#f4a03f)", fontWeight: 700 }}>Ver persona (registro maestro) →</Link></p>}
        </div>
      </div>
    </main>
  );
}
