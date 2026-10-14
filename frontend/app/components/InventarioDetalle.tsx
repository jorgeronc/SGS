"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import FotosPanel, { type TablaConFotos } from "@/app/components/FotosPanel";
import { SelectPersonal } from "@/app/components/Pickers";

const ESTADOS = ["operativo", "asignado", "en_reparacion", "baja"] as const;

function asignadoA(p: any): string {
  if (!p) return "—";
  const nom = p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
  const emp = `${p.rango ?? ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
  return [nom, emp].filter(Boolean).join(" — ") || "—";
}

// Detalle genérico para las tablas uniformes de inventario (armamento,
// comunicación, bodycams, otros). Muestra TODOS los campos del alta y permite
// EDITAR → GUARDAR los mismos campos que al crear (incluida la reasignación a un
// oficial), además de las fotografías.
export default function InventarioDetalle({ tabla, etiqueta }: { tabla: TablaConFotos; etiqueta: string }) {
  const params = useParams<{ id: string }>();
  const [item, setItem] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [b, setB] = useState<any>({}); // borrador de edición

  async function cargar() {
    const { data, error } = await supabase
      .from(tabla)
      .select("*, personal:personal(numero_placa, rango, persona:personas(nombre, apellido_paterno))")
      .eq("id", params.id)
      .maybeSingle();
    if (error) { setError(error.message); return; }
    setItem(data);
    supabase.rpc("rpc_registrar_bitacora", { p_tipo_accion: "CONSULTAR", p_entidad_tipo: tabla, p_entidad_id: params.id, p_modulo: tabla });
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [params.id]);

  function iniciarEdicion() {
    if (!item) return;
    setB({
      tipo: item.tipo ?? "", marca: item.marca ?? "", modelo: item.modelo ?? "",
      numero_serie: item.numero_serie ?? "", descripcion: item.descripcion ?? "",
      estado_equipo: item.estado_equipo ?? "operativo",
      asignado_personal_id: item.asignado_personal_id ?? "",
    });
    setError(null);
    setEditando(true);
  }

  // Mantiene estado_equipo en sincronía con la asignación (sin pisar en_reparacion/baja).
  function cambiarAsignado(v: string) {
    setB((p: any) => {
      const next = { ...p, asignado_personal_id: v };
      if (v && (p.estado_equipo === "operativo" || !p.estado_equipo)) next.estado_equipo = "asignado";
      else if (!v && p.estado_equipo === "asignado") next.estado_equipo = "operativo";
      return next;
    });
  }

  async function guardar() {
    if (!item) return;
    setGuardando(true); setError(null);
    const { error } = await supabase.from(tabla).update({
      tipo: b.tipo || null, marca: b.marca || null, modelo: b.modelo || null,
      numero_serie: b.numero_serie || null, descripcion: b.descripcion || null,
      estado_equipo: b.estado_equipo || "operativo",
      asignado_personal_id: b.asignado_personal_id || null,
      actualizado_en: new Date().toISOString(),
    }).eq("id", item.id);
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setEditando(false);
    cargar();
  }

  if (!item) return <main className="contenedor">{error ? <p style={{ color: "#b00020" }}>{error}</p> : <p>Cargando...</p>}</main>;

  const puedeEditar = item.estatus === "activo";

  return (
    <main className="contenedor">
      <h2>{item.folio ? `[${item.folio}] ` : ""}{etiqueta} — {item.tipo ?? ""} {item.marca ?? ""} {item.modelo ?? ""}</h2>
      <p className={item.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>
        {item.estatus}{item.estatus === "cancelado" && item.motivo_cancelacion ? ` — ${item.motivo_cancelacion}` : ""}
      </p>

      {!editando ? (
        <>
          <dl className="sc-kv" style={{ maxWidth: 560 }}>
            <dt>Tipo</dt><dd>{item.tipo ?? "—"}</dd>
            <dt>Marca / Modelo</dt><dd>{`${item.marca ?? ""} ${item.modelo ?? ""}`.trim() || "—"}</dd>
            <dt>Número de serie</dt><dd>{item.numero_serie ?? "—"}</dd>
            <dt>Descripción</dt><dd>{item.descripcion ?? "—"}</dd>
            <dt>Estado del equipo</dt><dd>{item.estado_equipo}</dd>
            <dt>Asignado a</dt><dd>{asignadoA(item.personal)}</dd>
            <dt>Alta</dt><dd>{item.fecha_alta ? new Date(item.fecha_alta).toLocaleDateString() : "—"}</dd>
          </dl>
          {puedeEditar && (
            <div className="form-fila" style={{ marginTop: 6 }}>
              <button onClick={iniciarEdicion}>✎ Editar</button>
            </div>
          )}
        </>
      ) : (
        <div style={{ maxWidth: 560 }}>
          <div className="form-fila">
            <input placeholder="Tipo" value={b.tipo} onChange={(e) => setB((p: any) => ({ ...p, tipo: e.target.value }))} />
            <input placeholder="Marca" value={b.marca} onChange={(e) => setB((p: any) => ({ ...p, marca: e.target.value }))} />
            <input placeholder="Modelo" value={b.modelo} onChange={(e) => setB((p: any) => ({ ...p, modelo: e.target.value }))} />
          </div>
          <div className="form-fila">
            <input placeholder="Número de serie" value={b.numero_serie} onChange={(e) => setB((p: any) => ({ ...p, numero_serie: e.target.value }))} />
            <select value={b.estado_equipo} onChange={(e) => setB((p: any) => ({ ...p, estado_equipo: e.target.value }))}>
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-fila">
            <input placeholder="Descripción" value={b.descripcion} onChange={(e) => setB((p: any) => ({ ...p, descripcion: e.target.value }))} style={{ flex: 1 }} />
          </div>
          <div className="form-fila">
            <SelectPersonal value={b.asignado_personal_id} onChange={cambiarAsignado} placeholder="— Asignar a (opcional) —" />
          </div>
          <div className="form-fila" style={{ marginTop: 6 }}>
            <button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
            <button type="button" className="secundario" onClick={() => setEditando(false)} disabled={guardando}>Cancelar</button>
          </div>
        </div>
      )}

      <FotosPanel tabla={tabla} id={params.id} />
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </main>
  );
}
