"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { SelectPatrulla, SelectPersonal } from "@/app/components/Pickers";

interface Asignacion {
  id: string;
  rol_en_unidad: string | null;
  estatus: string;
  patrulla: { numero: string | null; tipo: string | null; placas: string | null } | null;
  personal: { numero_placa: string | null; rango: string | null; persona: { nombre: string | null; apellido_paterno: string | null } | null } | null;
}

function nombrePersonal(p: Asignacion["personal"]): string {
  if (!p) return "—";
  const nom = p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
  const emp = `${p.rango ?? ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
  return [nom, emp].filter(Boolean).join(" · ") || "—";
}
function etiquetaPatrulla(p: Asignacion["patrulla"]): string {
  if (!p) return "—";
  return `${p.numero ? `#${p.numero} · ` : ""}${p.tipo ?? ""}${p.placas ? ` · ${p.placas}` : ""}`.trim();
}

export default function RolDetallePage() {
  const params = useParams<{ id: string }>();
  const [rol, setRol] = useState<any>(null);
  const [asigs, setAsigs] = useState<Asignacion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [patrullaId, setPatrullaId] = useState("");
  const [personalId, setPersonalId] = useState("");
  const [rolUnidad, setRolUnidad] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const { data: r, error: e1 } = await supabase.from("rol_servicio").select("*").eq("id", params.id).maybeSingle();
    if (e1) { setError(e1.message); return; }
    setRol(r);
    const { data: a } = await supabase
      .from("rol_servicio_asignaciones")
      .select("id, rol_en_unidad, estatus, patrulla:patrullas(numero, tipo, placas), personal:personal(numero_placa, rango, persona:personas(nombre, apellido_paterno))")
      .eq("rol_id", params.id)
      .order("creado_en", { ascending: true });
    setAsigs((a as any[]) ?? []);
    supabase.rpc("rpc_registrar_bitacora", { p_tipo_accion: "CONSULTAR", p_entidad_tipo: "rol_servicio", p_entidad_id: params.id, p_modulo: "rol_servicio" });
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [params.id]);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patrullaId || !personalId) { setError("Selecciona patrulla y oficial."); return; }
    setGuardando(true);
    const { error } = await supabase.from("rol_servicio_asignaciones").insert({
      rol_id: params.id, patrulla_id: patrullaId, personal_id: personalId, rol_en_unidad: rolUnidad || null,
    });
    if (!error) {
      // Al entrar al rol, la unidad queda disponible para el despacho.
      await supabase.from("patrullas").update({ estatus_unidad: "disponible", actualizado_en: new Date().toISOString() }).eq("id", patrullaId);
    }
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setPatrullaId(""); setPersonalId(""); setRolUnidad("");
    cargar();
  }

  async function quitar(id: string) {
    if (!window.confirm("¿Quitar esta asignación del rol?")) return;
    const { error } = await supabase.rpc("rpc_cancelar_registro", { p_tabla: "rol_servicio_asignaciones", p_id: id, p_motivo: "Retirada del rol de servicio" });
    if (error) { setError(error.message); return; }
    cargar();
  }

  if (!rol) return <main className="contenedor">{error ? <p style={{ color: "#b00020" }}>{error}</p> : <p>Cargando...</p>}</main>;
  const editable = rol.estatus === "activo";
  const activas = asigs.filter((a) => a.estatus === "activo");

  return (
    <div className="contenedor">
      <div className="sc-exp-head">
        <div className="f">{rol.folio ?? "s/folio"}</div>
        <h2>Rol de Servicio — {new Date(rol.fecha + "T00:00:00").toLocaleDateString()} · {rol.turno}</h2>
        <div className="sc-exp-meta">
          <div className="m"><div className="l">Inicio</div><div className="v">{new Date(rol.inicio).toLocaleString()}</div></div>
          <div className="m"><div className="l">Fin</div><div className="v">{new Date(rol.fin).toLocaleString()}</div></div>
          <div className="m"><div className="l">CRP</div><div className="v">{activas.length}</div></div>
          <div className="m"><div className="l">Estatus</div><div className="v"><span className={rol.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{rol.estatus}</span></div></div>
        </div>
      </div>

      <h3>Asignaciones (oficial ↔ CRP)</h3>
      {editable && (
        <form onSubmit={agregar} className="sc-nuevo">
          <div className="form-fila">
            <SelectPatrulla value={patrullaId} onChange={setPatrullaId} />
            <SelectPersonal value={personalId} onChange={setPersonalId} placeholder="— Oficial —" />
            <input placeholder="Rol en la unidad (conductor…)" value={rolUnidad} onChange={(e) => setRolUnidad(e.target.value)} />
            <button type="submit" disabled={guardando}>{guardando ? "Agregando…" : "+ Agregar al rol"}</button>
          </div>
        </form>
      )}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      {activas.length === 0 ? (
        <p className="dash-sub">Sin CRP en el rol todavía.</p>
      ) : (
        <table className="sc-table">
          <thead><tr><th>CRP</th><th>Oficial</th><th>Rol</th>{editable && <th></th>}</tr></thead>
          <tbody>
            {activas.map((a) => (
              <tr key={a.id}>
                <td>{etiquetaPatrulla(a.patrulla)}</td>
                <td>{nombrePersonal(a.personal)}</td>
                <td>{a.rol_en_unidad ?? "—"}</td>
                {editable && <td><button className="qbtn2" onClick={() => quitar(a.id)}>Quitar</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
