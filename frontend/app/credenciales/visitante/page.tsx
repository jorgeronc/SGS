"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import CamaraFoto from "@/app/components/CamaraFoto";

// Recepción: genera la credencial de VISITANTE con los datos tomados en control de
// acceso, tomando una FOTO REAL con la cámara (aunque ya se haya fotografiado la
// identificación en la caseta). La persona queda en Personas y se crea la credencial.
const localDT = (d: Date) => { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
function partirNombre(full: string) {
  const p = full.trim().split(/\s+/);
  if (p.length <= 1) return { nombre: p[0] ?? full.trim(), ap: null as string | null, am: null as string | null };
  if (p.length === 2) return { nombre: p[0], ap: p[1], am: null as string | null };
  return { nombre: p.slice(0, -2).join(" "), ap: p[p.length - 2], am: p[p.length - 1] };
}
// Fin de día de hoy, como vencimiento por defecto del pase.
function finDeHoy() { const d = new Date(); d.setHours(18, 0, 0, 0); return localDT(d); }

export default function CredencialVisitantePage() {
  const router = useRouter();
  const [accesoId, setAccesoId] = useState<string | null>(null);
  const [acceso, setAcceso] = useState<any>(null);
  const [f, setF] = useState({ nombre: "", empresa: "", motivo: "", anfitrion: "", vence: finDeHoy() });
  const [foto, setFoto] = useState<Blob | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Lee ?acceso=<id> del URL (sin useSearchParams para no requerir Suspense).
  useEffect(() => {
    try { setAccesoId(new URLSearchParams(window.location.search).get("acceso")); } catch { /* */ }
  }, []);

  useEffect(() => {
    if (!accesoId) return;
    supabase.from("accesos")
      .select("id, persona_id, visitante_nombre, tipo_persona, motivo, credencial_id, datos_adicionales, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("id", accesoId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setAcceso(data);
        const nom = (data as any).persona
          ? `${(data as any).persona.nombre ?? ""} ${(data as any).persona.apellido_paterno ?? ""} ${(data as any).persona.apellido_materno ?? ""}`.trim()
          : ((data as any).visitante_nombre ?? "");
        const dd = (data as any).datos_adicionales ?? {};
        setF((p) => ({ ...p, nombre: nom, empresa: dd.empresa ?? "", motivo: (data as any).motivo ?? "" }));
      });
  }, [accesoId]);

  async function generar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.nombre.trim()) { setError("Escribe el nombre del visitante."); return; }
    if (!foto) { setError("Toma la foto del visitante."); return; }
    setGuardando(true);
    try {
      // 1) Persona (registro maestro): la del acceso, o se crea.
      let personaId: string | null = acceso?.persona_id ?? null;
      if (!personaId) {
        const { nombre, ap, am } = partirNombre(f.nombre);
        const { data, error } = await supabase.from("personas")
          .insert({ nombre, apellido_paterno: ap, apellido_materno: am, datos_adicionales: { origen: "credencial_visitante", empresa: f.empresa.trim() || null } })
          .select("id").single();
        if (error) throw error;
        personaId = (data as any).id;
      }
      // 2) Sube la foto real y la deja como foto de la persona.
      const path = `personas/${personaId}/${Date.now()}.jpg`;
      const up = await supabase.storage.from("fotos").upload(path, foto, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw up.error;
      const { data: cur } = await supabase.from("personas").select("fotografias").eq("id", personaId).maybeSingle();
      const previas = Array.isArray((cur as any)?.fotografias) ? (cur as any).fotografias : [];
      await supabase.from("personas").update({ fotografias: [path, ...previas], actualizado_en: new Date().toISOString() }).eq("id", personaId);

      // 3) Credencial de visitante.
      const codigo = `VIS-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
      const { data: cred, error: eCred } = await supabase.from("credenciales").insert({
        categoria: "Visitante",
        persona_id: personaId,
        descripcion: f.empresa.trim() ? `Visitante · ${f.empresa.trim()}` : "Visitante",
        tipo: "qr",
        codigo,
        fecha_emision: new Date().toISOString(),
        vigencia_inicio: new Date().toISOString(),
        vigencia_fin: f.vence ? new Date(f.vence).toISOString() : null,
        datos_adicionales: { empresa: f.empresa.trim() || null, motivo: f.motivo.trim() || null, anfitrion: f.anfitrion.trim() || null, origen: "recepcion", acceso_id: accesoId },
      }).select("id").single();
      if (eCred) throw eCred;

      // 4) Liga la credencial al acceso (si vino de uno).
      if (accesoId) await supabase.from("accesos").update({ credencial_id: (cred as any).id, actualizado_en: new Date().toISOString() }).eq("id", accesoId);

      // 5) A imprimir.
      router.push(`/credenciales/${(cred as any).id}/imprimir`);
    } catch (e: any) {
      setGuardando(false);
      setError(e?.message ?? "No se pudo generar la credencial.");
    }
  }

  return (
    <main className="contenedor">
      <h2>🪪 Generar credencial de visitante</h2>
      <p style={{ fontSize: 13, color: "#555" }}>
        Recepción. Toma la <strong>foto real</strong> del visitante (con la cámara del equipo o una cámara conectada) y genera su credencial. La persona queda en <strong>Personas</strong>.
        {acceso && <> Datos precargados del acceso registrado en caseta.</>}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 360px) 1fr", gap: 22, alignItems: "start", marginTop: 12 }}>
        <div>
          <div className="dash-eyebrow">Foto del visitante <span style={{ color: "#e11d48" }}>*</span></div>
          <CamaraFoto onCapture={(b) => setFoto(b)} />
          {foto && <p style={{ color: "#0a7c2f", fontSize: 13, marginTop: 6 }}>✓ Foto lista</p>}
        </div>

        <form onSubmit={generar}>
          <div className="form-grid">
            <label>Nombre del visitante <span style={{ color: "#e11d48" }}>*</span>
              <input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre completo" />
            </label>
            <label>Empresa
              <input value={f.empresa} onChange={(e) => set("empresa", e.target.value)} placeholder="Empresa / procedencia" />
            </label>
            <label>Motivo
              <input value={f.motivo} onChange={(e) => set("motivo", e.target.value)} placeholder="Motivo de la visita" />
            </label>
            <label>Anfitrión
              <input value={f.anfitrion} onChange={(e) => set("anfitrion", e.target.value)} placeholder="A quién visita" />
            </label>
            <label>Vence
              <input type="datetime-local" value={f.vence} onChange={(e) => set("vence", e.target.value)} />
            </label>
          </div>
          <div className="form-fila" style={{ marginTop: 14 }}>
            <button type="submit" disabled={guardando} style={{ background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}>
              {guardando ? "Generando…" : "Generar e imprimir credencial ➤"}
            </button>
          </div>
          {error && <p style={{ color: "#b00020", marginTop: 10 }}>{error}</p>}
        </form>
      </div>
    </main>
  );
}
