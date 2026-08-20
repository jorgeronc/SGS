"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { SelectPersonal } from "@/app/components/Pickers";
import { primeraFoto } from "@/lib/fotos";

function fotosDe(r: any): unknown { return r.personal?.persona?.fotografias; }

function elemento(r: any): string {
  const p = r.personal?.persona;
  const nom = p ? `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim() : "";
  return nom || "(elemento)";
}
function credencial(r: any): string {
  const pe = r.personal;
  if (!pe) return "—";
  return `${pe.rango ?? ""}${pe.numero_placa ? ` · ${pe.numero_placa}` : ""}`.trim() || "—";
}

function NuevoKardex({ onCreado }: { onCreado: () => void }) {
  const [personalId, setPersonalId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!personalId) { setError("Selecciona el elemento (Personal)."); return; }
    const { error } = await supabase.from("kardex").insert({ personal_id: personalId });
    if (error) {
      setError(error.message.includes("uq_kardex_personal_activo") ? "Ese elemento ya tiene un kardex activo." : error.message);
      return;
    }
    setPersonalId("");
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <SelectPersonal value={personalId} onChange={setPersonalId} placeholder="— Elemento de Personal —" />
        <button type="submit">Crear kardex</button>
      </div>
      <p className="dash-sub" style={{ marginTop: 6 }}>El kardex se llena en su detalle. Un elemento sólo puede tener un kardex activo.</p>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function KardexPage() {
  return (
    <ListaMaestra
      titulo="Kardex Policial"
      subtitulo="Expediente de trayectoria profesional del personal"
      tabla="kardex"
      modulo="kardex"
      select="id, folio, estatus, creado_en, personal:personal(id, numero_placa, rango, persona:personas(nombre, apellido_paterno, apellido_materno, fotografias))"
      miniatura={(r) => r.personal?.persona?.fotografias}
      placeholderBuscar="Buscar folio, elemento, grado, matrícula…"
      columnas={[
        { header: "Folio", campo: "folio", celda: (r) => <span className="sc-folio">{r.folio ?? "s/folio"}</span> },
        { header: "Elemento", celda: (r) => elemento(r) },
        { header: "Grado · matrícula", celda: (r) => credencial(r) },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${elemento(r)} ${credencial(r)}`}
      detalleHref={(r) => (r.personal?.id ? `/personal/${r.personal.id}` : `/kardex/${r.id}`)}
      filtros={[{ k: "todos", label: "Todos" }, { k: "activos", label: "Activos", test: (r) => r.estatus === "activo" }]}
      quickView={(r) => (
        <>
          {primeraFoto(fotosDe(r)) && <img src={primeraFoto(fotosDe(r))!} alt="Fotografía" className="sc-qv-foto" />}
          <div className="sc-folio" style={{ fontSize: 16 }}>{r.folio ?? "s/folio"}</div>
          <h3 style={{ margin: "6px 0 8px" }}>{elemento(r)}</h3>
          <dl className="sc-kv">
            <dt>Grado</dt><dd>{r.personal?.rango ?? "—"}</dd>
            <dt>Matrícula</dt><dd>{r.personal?.numero_placa ?? "—"}</dd>
            <dt>Registrado</dt><dd>{new Date(r.creado_en).toLocaleDateString()}</dd>
          </dl>
        </>
      )}
      nuevo={(onCreado) => <NuevoKardex onCreado={onCreado} />}
    />
  );
}
