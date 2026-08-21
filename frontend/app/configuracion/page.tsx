"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { limpiarConfigCache, type ConfigSistema } from "@/lib/config";

const VACIA: ConfigSistema = {
  corporacion: "",
  escudo: "escudo.png",
  jurisdiccion: "",
  jurisdiccion_pais: "México",
  domicilio: null,
  telefono: null,
  correo: null,
};

// Parámetros de configuración del sistema (datos de la Corporación).
// La jurisdicción rige la búsqueda de domicilios en el CAD. Edición: admin.
export default function ConfiguracionPage() {
  const [cfg, setCfg] = useState<ConfigSistema>(VACIA);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase.from("config_sistema").select("*").eq("id", true).maybeSingle();
    if (error) setError(error.message);
    if (data) setCfg(data as ConfigSistema);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof ConfigSistema>(k: K, v: ConfigSistema[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setMensaje(null);
    const { error } = await supabase
      .from("config_sistema")
      .update({
        corporacion: cfg.corporacion.trim(),
        escudo: cfg.escudo.trim() || "escudo.png",
        jurisdiccion: cfg.jurisdiccion.trim(),
        jurisdiccion_pais: cfg.jurisdiccion_pais.trim() || "México",
        domicilio: cfg.domicilio?.trim() || null,
        telefono: cfg.telefono?.trim() || null,
        correo: cfg.correo?.trim() || null,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", true);
    setGuardando(false);
    if (error) { setError(error.message); return; }
    limpiarConfigCache();
    setMensaje("Configuración guardada.");
  }

  return (
    <main className="contenedor">
      <h2>Parámetros del sistema</h2>
      <p style={{ fontSize: 13, color: "#555" }}>
        Datos de la Corporación. La <strong>jurisdicción</strong> rige dónde se buscan los
        domicilios escritos en el campo “Lugar del incidente” del CAD. Solo administrador.
      </p>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <form onSubmit={guardar}>
          <div className="dash-eyebrow">Corporación</div>
          <div className="form-grid">
            <label>Corporación
              <input value={cfg.corporacion} onChange={(e) => set("corporacion", e.target.value)} placeholder="Nombre de la corporación" />
            </label>
            <label>Escudo (archivo)
              <input value={cfg.escudo} onChange={(e) => set("escudo", e.target.value)} placeholder="escudo.png" />
            </label>
          </div>

          <div className="dash-eyebrow">Jurisdicción (rige la búsqueda de domicilios)</div>
          <div className="form-grid">
            <label>Jurisdicción (estado/entidad)
              <input value={cfg.jurisdiccion} onChange={(e) => set("jurisdiccion", e.target.value)} placeholder="Nuevo León" />
            </label>
            <label>País
              <input value={cfg.jurisdiccion_pais} onChange={(e) => set("jurisdiccion_pais", e.target.value)} placeholder="México" />
            </label>
          </div>

          <div className="dash-eyebrow">Contacto</div>
          <div className="form-grid">
            <label>Domicilio
              <input value={cfg.domicilio ?? ""} onChange={(e) => set("domicilio", e.target.value)} placeholder="Domicilio de la corporación" />
            </label>
            <label>Teléfono
              <input value={cfg.telefono ?? ""} onChange={(e) => set("telefono", e.target.value)} placeholder="Teléfono" />
            </label>
            <label>Correo
              <input value={cfg.correo ?? ""} onChange={(e) => set("correo", e.target.value)} placeholder="Correo institucional" />
            </label>
          </div>

          <div className="form-fila" style={{ marginTop: 12 }}>
            <button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar configuración"}</button>
            {mensaje && <span style={{ color: "#0a7c2f", marginLeft: 12 }}>{mensaje}</span>}
          </div>
          <p style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
            Si no ves los campos o no puedes guardar, esta pantalla requiere rol <code>administrador</code>.
          </p>
          {error && <p style={{ color: "#b00020" }}>{error}</p>}
        </form>
      )}
    </main>
  );
}
