"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { personasSimilares, type RegistroSimilar } from "@/lib/duplicados";
import AvisoDuplicados from "@/app/components/AvisoDuplicados";

function nombre(r: any) {
  return `${r.nombre ?? ""} ${r.apellido_paterno ?? ""} ${r.apellido_materno ?? ""}`.trim();
}

function NuevaPersona({ onCreado }: { onCreado: () => void }) {
  const [nom, setNom] = useState("");
  const [ap, setAp] = useState("");
  const [am, setAm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [coincidencias, setCoincidencias] = useState<RegistroSimilar[]>([]);

  useEffect(() => {
    if (nom.trim().length < 3) { setCoincidencias([]); return; }
    const t = setTimeout(async () => setCoincidencias(await personasSimilares({ nombre: nom, apellido_paterno: ap })), 450);
    return () => clearTimeout(t);
  }, [nom, ap]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from("personas").insert({
      nombre: nom,
      apellido_paterno: ap || null,
      apellido_materno: am || null,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNom("");
    setAp("");
    setAm("");
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <input placeholder="Nombre" value={nom} onChange={(e) => setNom(e.target.value)} required />
        <input placeholder="Apellido paterno" value={ap} onChange={(e) => setAp(e.target.value)} />
        <input placeholder="Apellido materno" value={am} onChange={(e) => setAm(e.target.value)} />
        <button type="submit">Agregar persona</button>
      </div>
      <AvisoDuplicados titulo="Esta persona ya está registrada en el sistema" registros={coincidencias} />
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function PersonasPage() {
  return (
    <ListaMaestra
      titulo="Personas"
      subtitulo="Índice maestro único de personas"
      tabla="personas"
      modulo="personas"
      select="id, nombre, apellido_paterno, apellido_materno, curp, sexo, fecha_nacimiento, fotografias, estatus, creado_en"
      miniatura={(r) => r.fotografias}
      placeholderBuscar="Buscar nombre o CURP…"
      columnas={[
        { header: "Nombre completo", celda: (r) => nombre(r) },
        { header: "CURP", celda: (r) => r.curp ?? "—" },
        { header: "Sexo", celda: (r) => r.sexo ?? "—" },
        { header: "Estatus", campo: "estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
        { header: "Registrado", campo: "creado_en", celda: (r) => new Date(r.creado_en).toLocaleDateString() },
      ]}
      textoBusqueda={(r) => `${nombre(r)} ${r.curp ?? ""}`}
      detalleHref={(r) => `/personas/${r.id}`}
      filtros={[
        { k: "todos", label: "Todos" },
        { k: "activos", label: "Activos", test: (r) => r.estatus === "activo" },
        { k: "cancelados", label: "Cancelados", test: (r) => r.estatus === "cancelado" },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{nombre(r)}</h3>
          <dl className="sc-kv">
            <dt>CURP</dt><dd>{r.curp ?? "—"}</dd>
            <dt>Sexo</dt><dd>{r.sexo ?? "—"}</dd>
            <dt>Nacimiento</dt><dd>{r.fecha_nacimiento ? new Date(r.fecha_nacimiento).toLocaleDateString() : "—"}</dd>
            <dt>Estatus</dt><dd>{r.estatus}</dd>
            <dt>Registrado</dt><dd>{new Date(r.creado_en).toLocaleString()}</dd>
          </dl>
        </>
      )}
      editar={[
        { campo: "nombre", label: "Nombre" },
        { campo: "apellido_paterno", label: "Apellido paterno" },
        { campo: "apellido_materno", label: "Apellido materno" },
        { campo: "curp", label: "CURP" },
        { campo: "sexo", label: "Sexo", tipo: "select", opciones: ["HOMBRE", "MUJER"] },
        { campo: "fecha_nacimiento", label: "Fecha de nacimiento", tipo: "date" },
      ]}
      nuevo={(onCreado) => <NuevaPersona onCreado={onCreado} />}
    />
  );
}
