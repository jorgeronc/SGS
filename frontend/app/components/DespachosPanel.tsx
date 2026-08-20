"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Despacho, EstadoDespacho } from "@/lib/types";

const ESTADOS: EstadoDespacho[] = ["asignada", "enterado", "en_ruta", "en_lugar", "cerrado"];

interface UnidadServicio {
  patrulla_id: string;
  numero: string | null;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  placas: string | null;
  estatus_unidad: string | null;
  personal_id: string | null;
  oficial: string;
}

function nombreOficial(d: Despacho): string {
  const p = d.personal;
  if (!p) return "—";
  const nombre = p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
  const empleo = `${p.rango ?? ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
  return [nombre, empleo].filter(Boolean).join(" — ") || "—";
}

function unidadTexto(d: any): string {
  const p = d.patrulla;
  if (!p) return "—";
  return `${p.numero ? `#${p.numero} · ` : ""}${p.tipo ?? ""} ${p.marca ?? ""} ${p.modelo ?? ""}${p.placas ? ` · ${p.placas}` : ""}`.trim();
}

// Panel de despacho: asigna PATRULLAS en servicio (rol activo) a la llamada CAD.
// El oficial se deriva del rol de servicio; al despachar, la unidad pasa a
// "en_rutina" y al cerrarse el despacho vuelve a "disponible".
export default function DespachosPanel({ llamadaId }: { llamadaId: string }) {
  const [despachos, setDespachos] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<UnidadServicio[]>([]);
  const [patrullaId, setPatrullaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargarDespachos() {
    const { data, error } = await supabase
      .from("despachos")
      .select(
        "*, personal:personal(numero_placa, rango, persona:personas(nombre, apellido_paterno)), patrulla:patrullas(numero, tipo, marca, modelo, placas)"
      )
      .eq("llamada_id", llamadaId)
      .order("fecha_asignacion", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }
    setDespachos((data as any[]) ?? []);
  }

  async function cargarUnidades() {
    // Patrullas en servicio y disponibles (según el rol activo del momento).
    const { data, error } = await supabase
      .from("patrullas_en_servicio")
      .select("patrulla_id, numero, tipo, marca, modelo, placas, estatus_unidad, personal_id")
      .eq("estatus_unidad", "disponible")
      .order("numero");
    if (error) {
      setError(error.message);
      return;
    }
    const rows = (data as any[]) ?? [];
    // Nombres de oficiales asignados a esas patrullas.
    const ids = Array.from(new Set(rows.map((r) => r.personal_id).filter(Boolean)));
    const nombres: Record<string, string> = {};
    if (ids.length) {
      const { data: per } = await supabase
        .from("personal")
        .select("id, numero_placa, rango, persona:personas(nombre, apellido_paterno)")
        .in("id", ids);
      ((per as any[]) ?? []).forEach((p) => {
        const nom = p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
        const emp = `${p.rango ?? ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
        nombres[p.id] = [nom, emp].filter(Boolean).join(" — ") || p.id;
      });
    }
    setUnidades(
      rows.map((r) => ({
        patrulla_id: r.patrulla_id,
        numero: r.numero,
        tipo: r.tipo,
        marca: r.marca,
        modelo: r.modelo,
        placas: r.placas,
        estatus_unidad: r.estatus_unidad,
        personal_id: r.personal_id,
        oficial: r.personal_id ? nombres[r.personal_id] ?? "—" : "—",
      }))
    );
  }

  useEffect(() => {
    cargarDespachos();
    cargarUnidades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llamadaId]);

  async function asignar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patrullaId) {
      setError("Selecciona una patrulla en servicio.");
      return;
    }
    const u = unidades.find((x) => x.patrulla_id === patrullaId);
    setGuardando(true);
    const { error } = await supabase.from("despachos").insert({
      llamada_id: llamadaId,
      patrulla_id: patrullaId,
      personal_id: u?.personal_id ?? null, // oficial derivado del rol de servicio
    });
    if (!error) {
      // La unidad despachada queda en ruta (deja de estar disponible).
      await supabase
        .from("patrullas")
        .update({ estatus_unidad: "en_rutina", actualizado_en: new Date().toISOString() })
        .eq("id", patrullaId);
    }
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setPatrullaId("");
    cargarDespachos();
    cargarUnidades();
  }

  async function cambiarEstado(d: any, nuevo: EstadoDespacho) {
    setError(null);
    const { error } = await supabase
      .from("despachos")
      .update({ estado: nuevo, actualizado_en: new Date().toISOString() })
      .eq("id", d.id);
    if (error) {
      setError(error.message);
      return;
    }
    // Al cerrar el despacho, la patrulla vuelve a estar disponible para el rol.
    if (nuevo === "cerrado" && d.patrulla_id) {
      await supabase
        .from("patrullas")
        .update({ estatus_unidad: "disponible", actualizado_en: new Date().toISOString() })
        .eq("id", d.patrulla_id);
    }
    cargarDespachos();
    cargarUnidades();
  }

  // Autoriza (o revoca) que la app del oficial pueda reabrir/cambiar el estatus
  // de un despacho ya cerrado.
  async function autorizarReapertura(d: any, valor: boolean) {
    setError(null);
    const { error } = await supabase
      .from("despachos")
      .update({ reapertura_autorizada: valor, actualizado_en: new Date().toISOString() })
      .eq("id", d.id);
    if (error) { setError(error.message); return; }
    cargarDespachos();
  }

  return (
    <>
      <h3>Despacho de unidades</h3>
      <table>
        <thead>
          <tr>
            <th>Patrulla</th>
            <th>Oficial (rol)</th>
            <th>Asignada</th>
            <th>Estado</th>
            <th>Reapertura (app)</th>
          </tr>
        </thead>
        <tbody>
          {despachos.map((d) => (
            <tr key={d.id}>
              <td>{unidadTexto(d)}</td>
              <td>{nombreOficial(d)}</td>
              <td>{new Date(d.fecha_asignacion).toLocaleString()}</td>
              <td>
                <select
                  value={d.estado}
                  disabled={d.estatus !== "activo"}
                  onChange={(e) => cambiarEstado(d, e.target.value as EstadoDespacho)}
                >
                  {ESTADOS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {d.estado === "cerrado" ? (
                  d.reapertura_autorizada ? (
                    <span className="badge-activo">Autorizada ✓ <button className="qbtn2" onClick={() => autorizarReapertura(d, false)}>Revocar</button></span>
                  ) : (
                    <button className="qbtn2" onClick={() => autorizarReapertura(d, true)}>Autorizar reapertura</button>
                  )
                ) : "—"}
              </td>
            </tr>
          ))}
          {despachos.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: "#555" }}>
                Sin unidades despachadas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h4>Despachar patrulla</h4>
      <form onSubmit={asignar}>
        <div className="form-fila">
          <select value={patrullaId} onChange={(e) => setPatrullaId(e.target.value)}>
            <option value="">
              {unidades.length ? "— Patrulla en servicio (disponible) —" : "Sin patrullas disponibles en el rol actual"}
            </option>
            {unidades.map((u) => (
              <option key={u.patrulla_id} value={u.patrulla_id}>
                {`${u.numero ? `#${u.numero} · ` : ""}${u.tipo ?? ""} ${u.marca ?? ""} ${u.modelo ?? ""}`.trim()}
                {u.oficial !== "—" ? ` — ${u.oficial}` : ""}
              </option>
            ))}
          </select>
          <button type="submit" disabled={guardando || !patrullaId}>
            {guardando ? "Despachando..." : "Despachar"}
          </button>
        </div>
        <p className="dash-sub" style={{ marginTop: 6 }}>
          Solo aparecen patrullas del rol de servicio vigente cuyo estatus es <b>Disponible</b>. El oficial se toma del rol.
        </p>
      </form>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </>
  );
}
