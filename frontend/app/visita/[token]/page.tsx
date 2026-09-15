"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Formulario PÚBLICO (sin login) que abre el visitante con su link de un solo uso.
// Lee la cita por token (RPC pública) y registra sus datos en maestros; al enviar,
// el token se destruye en el servidor.
interface Cita { folio: string; sitio: string; fecha_hora_cita: string; estado: string; }

export default function VisitaPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [cargando, setCargando] = useState(true);
  const [cita, setCita] = useState<Cita | null>(null);
  const [f, setF] = useState({ nombre: "", ap_pat: "", ap_mat: "", telefono: "", motivo: "", persona_visita: "", empresa: "", marca: "", modelo: "", placas: "" });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listoFolio, setListoFolio] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("rpc_cita_visitante_por_token", { p_token: token });
      const c = ((data as any[]) ?? [])[0] ?? null;
      setCita(c);
      setCargando(false);
    })();
  }, [token]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.nombre.trim() || !f.ap_pat.trim()) { setError("Nombre y apellido paterno son obligatorios."); return; }
    if (!f.telefono.trim()) { setError("El teléfono de contacto es obligatorio."); return; }
    setEnviando(true);
    const { data, error: err } = await supabase.rpc("rpc_registrar_visitante", {
      p_token: token, p_nombre: f.nombre, p_ap_pat: f.ap_pat, p_ap_mat: f.ap_mat, p_telefono: f.telefono,
      p_motivo: f.motivo, p_persona_visita: f.persona_visita, p_empresa: f.empresa,
      p_veh_marca: f.marca, p_veh_modelo: f.modelo, p_veh_placas: f.placas,
    });
    setEnviando(false);
    if (err) { setError(err.message); return; }
    setListoFolio((data as string) ?? cita?.folio ?? "");
  }

  const wrap: React.CSSProperties = { maxWidth: 440, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" };
  const card: React.CSSProperties = { background: "#fff", border: "1px solid #e4e4e7", borderRadius: 14, overflow: "hidden" };
  const label: React.CSSProperties = { display: "block", fontSize: 13, color: "#555", marginTop: 10 };
  const input: React.CSSProperties = { width: "100%", marginTop: 4, padding: "9px 10px", border: "1px solid #cfd4da", borderRadius: 8, fontSize: 15, boxSizing: "border-box" };
  const btn: React.CSSProperties = { width: "100%", marginTop: 14, background: "#f4a03f", color: "#4a1b0c", border: "none", borderRadius: 9, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer" };

  if (cargando) return <div style={wrap}><p style={{ color: "#555" }}>Cargando…</p></div>;

  if (listoFolio) {
    return (
      <div style={wrap}>
        <div style={{ ...card, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <h2 style={{ margin: "8px 0" }}>¡Registro enviado!</h2>
          <p style={{ color: "#555" }}>Tu visita quedó registrada con el folio <b>{listoFolio}</b>. Preséntalo en la caseta el día de tu cita.</p>
          <p style={{ color: "#999", fontSize: 13, marginTop: 12 }}>Este enlace ya no es válido.</p>
        </div>
      </div>
    );
  }

  if (!cita) {
    return (
      <div style={wrap}>
        <div style={{ ...card, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h2 style={{ margin: "8px 0" }}>Enlace no válido</h2>
          <p style={{ color: "#555" }}>Este enlace no es válido o ya fue utilizado. Pide uno nuevo a tu contacto.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <form onSubmit={enviar} style={card}>
        <div style={{ background: "#0b2540", padding: "16px 18px" }}>
          <div style={{ color: "#f4a03f", fontSize: 12, letterSpacing: ".4px", textTransform: "uppercase" }}>Registro de visita</div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginTop: 2 }}>{cita.sitio}</div>
          <div style={{ color: "#cfe0ee", fontSize: 13, marginTop: 6 }}>📅 Cita: {new Date(cita.fecha_hora_cita).toLocaleString()} · Folio {cita.folio}</div>
        </div>
        <div style={{ padding: "14px 18px 18px" }}>
          <label style={label}>Nombre(s) *<input style={input} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={label}>Apellido paterno *<input style={input} value={f.ap_pat} onChange={(e) => set("ap_pat", e.target.value)} /></label>
            <label style={label}>Apellido materno<input style={input} value={f.ap_mat} onChange={(e) => set("ap_mat", e.target.value)} /></label>
          </div>
          <label style={label}>Teléfono celular *<input style={input} type="tel" value={f.telefono} onChange={(e) => set("telefono", e.target.value)} /></label>
          <label style={label}>Motivo de la visita<input style={input} value={f.motivo} onChange={(e) => set("motivo", e.target.value)} /></label>
          <label style={label}>Persona a la que visita<input style={input} value={f.persona_visita} onChange={(e) => set("persona_visita", e.target.value)} /></label>
          <label style={label}>Empresa que representa (opcional)<input style={input} value={f.empresa} onChange={(e) => set("empresa", e.target.value)} /></label>
          <div style={{ borderTop: "1px solid #e4e4e7", marginTop: 14, paddingTop: 6 }}>
            <div style={{ fontSize: 12, color: "#999", textTransform: "uppercase", letterSpacing: ".4px", marginTop: 6 }}>Vehículo (opcional)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={label}>Marca<input style={input} value={f.marca} onChange={(e) => set("marca", e.target.value)} /></label>
              <label style={label}>Modelo<input style={input} value={f.modelo} onChange={(e) => set("modelo", e.target.value)} /></label>
            </div>
            <label style={label}>Placas<input style={input} value={f.placas} onChange={(e) => set("placas", e.target.value)} /></label>
          </div>
          {error && <p style={{ color: "#b00020", marginTop: 10 }}>{error}</p>}
          <button type="submit" style={btn} disabled={enviando}>{enviando ? "Enviando…" : "Enviar registro"}</button>
        </div>
      </form>
      <p style={{ textAlign: "center", color: "#aaa", fontSize: 12, marginTop: 10 }}>SGS · Consultech Seguridad</p>
    </div>
  );
}
