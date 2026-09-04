"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";

// Alerta general de búsqueda: pone en alerta a TODOS los oficiales en turno sobre
// una persona y/o un vehículo. Los datos van a los registros maestros (con marca
// de alerta) y se difunden por un chat nuevo (que dispara push a los oficiales).
export default function AlertaGeneralPage() {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [incPersona, setIncPersona] = useState(true);
  const [per, setPer] = useState({ nombre: "", apellido_paterno: "", apellido_materno: "", alias: "", senas: "" });

  const [incVehiculo, setIncVehiculo] = useState(false);
  const [veh, setVeh] = useState({ placas: "", marca: "", modelo: "", anio: "", color: "", tipo: "" });

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<{ folio: string; canal_id: string } | null>(null);

  function setP<K extends keyof typeof per>(k: K, v: string) { setPer((s) => ({ ...s, [k]: v })); }
  function setV<K extends keyof typeof veh>(k: K, v: string) { setVeh((s) => ({ ...s, [k]: v })); }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(null);
    if (!motivo) { setError("Selecciona el motivo de la alerta."); return; }
    const conPersona = incPersona && per.nombre.trim() !== "";
    const conVehiculo = incVehiculo && (veh.placas.trim() !== "" || veh.marca.trim() !== "");
    if (!conPersona && !conVehiculo) { setError("Captura los datos de una persona (nombre) y/o un vehículo (placas o marca)."); return; }

    setEnviando(true);
    const { data, error } = await supabase.rpc("rpc_crear_alerta_general", {
      p_motivo: motivo,
      p_descripcion: descripcion.trim() || null,
      p_persona: conPersona ? per : null,
      p_vehiculo: conVehiculo ? { ...veh } : null,
    });
    setEnviando(false);
    if (error) { setError(error.message); return; }
    const r = data as { folio: string; canal_id: string };
    setOk(r);
    // Limpia el formulario para una nueva alerta.
    setMotivo(""); setDescripcion("");
    setPer({ nombre: "", apellido_paterno: "", apellido_materno: "", alias: "", senas: "" });
    setVeh({ placas: "", marca: "", modelo: "", anio: "", color: "", tipo: "" });
  }

  return (
    <main className="contenedor">
      <h2>🚨 Alerta general de búsqueda</h2>
      <p style={{ fontSize: 13, color: "#555" }}>
        Pone en alerta a <strong>todos los oficiales en turno</strong> sobre una persona y/o un vehículo.
        Los datos se guardan en los <strong>registros maestros</strong> (con marca de alerta y folio) y se
        difunden por un <strong>chat nuevo</strong> con los oficiales del turno. Solo supervisor / administrador.
      </p>

      {ok && (
        <div style={{ margin: "12px 0", padding: "12px 14px", border: "1px solid #1f9d5c", background: "#e6f6ec", borderRadius: 10, color: "#0a5" }}>
          Alerta <strong>{ok.folio}</strong> emitida y difundida a los oficiales en turno.{" "}
          <Link href={`/chat?canal=${ok.canal_id}`} style={{ color: "#0a7c2f", fontWeight: 700 }}>Abrir el chat de la alerta →</Link>
        </div>
      )}

      <form onSubmit={enviar} style={{ maxWidth: 720 }}>
        <div className="form-grid">
          <label>Motivo <span style={{ color: "#e23b53" }}>*</span>
            <CatalogoSelect categoria="motivo_alerta_general" value={motivo} onChange={setMotivo} placeholder="— Selecciona el motivo —" />
          </label>
        </div>
        <label style={{ display: "block", marginTop: 10 }}>Descripción / instrucciones
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalles, última ubicación, indicaciones para los oficiales…" style={{ display: "block", width: "100%", height: 80, resize: "vertical" }} />
        </label>

        {/* Persona */}
        <div className="dash-eyebrow" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={incPersona} onChange={(e) => setIncPersona(e.target.checked)} style={{ width: "auto" }} /> Persona
        </div>
        {incPersona && (
          <div className="form-grid">
            <label>Nombre <span style={{ color: "#e23b53" }}>*</span>
              <input value={per.nombre} onChange={(e) => setP("nombre", e.target.value)} placeholder="Nombre(s)" />
            </label>
            <label>Apellido paterno<input value={per.apellido_paterno} onChange={(e) => setP("apellido_paterno", e.target.value)} /></label>
            <label>Apellido materno<input value={per.apellido_materno} onChange={(e) => setP("apellido_materno", e.target.value)} /></label>
            <label>Alias<input value={per.alias} onChange={(e) => setP("alias", e.target.value)} placeholder="Apodo / alias" /></label>
            <label style={{ gridColumn: "1 / -1" }}>Señas particulares
              <input value={per.senas} onChange={(e) => setP("senas", e.target.value)} placeholder="Estatura, complexión, vestimenta, señas…" />
            </label>
          </div>
        )}

        {/* Vehículo */}
        <div className="dash-eyebrow" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={incVehiculo} onChange={(e) => setIncVehiculo(e.target.checked)} style={{ width: "auto" }} /> Vehículo
        </div>
        {incVehiculo && (
          <div className="form-grid">
            <label>Placas<input value={veh.placas} onChange={(e) => setV("placas", e.target.value)} placeholder="Placas" /></label>
            <label>Marca<input value={veh.marca} onChange={(e) => setV("marca", e.target.value)} /></label>
            <label>Modelo<input value={veh.modelo} onChange={(e) => setV("modelo", e.target.value)} /></label>
            <label>Año<input value={veh.anio} onChange={(e) => setV("anio", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></label>
            <label>Color<input value={veh.color} onChange={(e) => setV("color", e.target.value)} /></label>
            <label>Tipo<input value={veh.tipo} onChange={(e) => setV("tipo", e.target.value)} placeholder="Sedán, camioneta, motocicleta…" /></label>
          </div>
        )}

        <div className="form-fila" style={{ marginTop: 16 }}>
          <button type="submit" disabled={enviando} style={{ background: "#e23b53", color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}>
            {enviando ? "Emitiendo…" : "🚨 Emitir alerta a oficiales en turno"}
          </button>
        </div>
        {error && <p style={{ color: "#b00020", marginTop: 10 }}>{error}</p>}
        <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
          Los oficiales en turno con su cuenta ligada recibirán la alerta por chat y notificación push.
        </p>
      </form>
    </main>
  );
}
