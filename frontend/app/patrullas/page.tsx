"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { subirFotoArchivo } from "@/lib/fotos";
import { ESTATUS_LISTA, ESTATUS_UNIDAD, PillUnidad } from "./estatus";

function NuevaPatrulla({ onCreado }: { onCreado: () => void }) {
  const [numero, setNumero] = useState("");
  const [tipo, setTipo] = useState("auto");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [placas, setPlacas] = useState("");
  const [anio, setAnio] = useState("");
  const [color, setColor] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreando(true);
    const { data, error } = await supabase.from("patrullas").insert({
      numero: numero || null,
      tipo,
      marca: marca || null,
      modelo: modelo || null,
      placas: placas || null,
      anio: anio ? Number(anio) : null,
      color: color || null,
      estatus_unidad: "fuera_servicio",
    }).select("id").single();
    if (error) { setError(error.message); setCreando(false); return; }
    if (foto && data) {
      const ruta = await subirFotoArchivo("patrullas", data.id, foto);
      if (ruta) await supabase.from("patrullas").update({ fotografias: [ruta] }).eq("id", data.id);
    }
    setCreando(false);
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <input placeholder="Número económico" value={numero} onChange={(e) => setNumero(e.target.value)} />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="auto">Auto</option>
          <option value="motocicleta">Motocicleta</option>
          <option value="bicicleta">Bicicleta</option>
        </select>
        <input placeholder="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
        <input placeholder="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} />
      </div>
      <div className="form-fila">
        <input placeholder="Placas" value={placas} onChange={(e) => setPlacas(e.target.value)} />
        <input placeholder="Año" type="number" value={anio} onChange={(e) => setAnio(e.target.value)} />
        <input placeholder="Color" value={color} onChange={(e) => setColor(e.target.value)} />
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fotografía
          <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="form-fila">
        <button type="submit" disabled={creando}>{creando ? "Registrando…" : "Registrar patrulla"}</button>
      </div>
      <p className="dash-sub">La unidad se crea <b>Fuera de servicio</b>. Pasa a Disponible al asignarla en un Rol de Servicio.</p>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function PatrullasPage() {
  // Unidades del rol de servicio vigente ahora (turno en curso) + su turno.
  const [enServicio, setEnServicio] = useState<Set<string>>(new Set());
  const [turno, setTurno] = useState<string>("");

  useEffect(() => {
    supabase.from("patrullas_en_servicio").select("patrulla_id, turno").then(({ data }) => {
      const rows = (data as any[]) ?? [];
      setEnServicio(new Set(rows.map((r) => r.patrulla_id)));
      setTurno(rows[0]?.turno ?? "");
    });
  }, []);

  const turnoLabel = turno ? `Turno en curso (${turno.charAt(0).toUpperCase() + turno.slice(1)})` : "Turno en curso";

  return (
    <ListaMaestra
      titulo="Patrullas"
      sinToggleCancelados
      subtitulo="Flota policial (autos, motos, bicicletas) con estatus operativo"
      tabla="patrullas"
      modulo="patrullas"
      orderBy="numero"
      select="id, folio, numero, tipo, marca, modelo, placas, anio, color, estatus_unidad, estatus, creado_en, fotografias"
      miniatura={(r) => r.fotografias}
      placeholderBuscar="Buscar número, placas, marca…"
      columnas={[
        { header: "Número", campo: "numero", celda: (r) => <span className="sc-folio">{r.numero ?? "—"}</span> },
        { header: "Tipo", campo: "tipo", celda: (r) => r.tipo ?? "—" },
        { header: "Marca / Modelo", campo: "marca", celda: (r) => `${r.marca ?? ""} ${r.modelo ?? ""}`.trim() || "—" },
        { header: "Placas", campo: "placas", celda: (r) => r.placas ?? "—" },
        { header: "Estatus operativo", campo: "estatus_unidad", celda: (r) => <PillUnidad v={r.estatus_unidad} /> },
        { header: "Estatus", campo: "estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.numero ?? ""} ${r.placas ?? ""} ${r.marca ?? ""} ${r.modelo ?? ""}`}
      detalleHref={(r) => `/patrullas/${r.id}`}
      filtros={[
        { k: "todos", label: "Todas" },
        { k: "turno", label: turnoLabel, test: (r) => enServicio.has(r.id) },
        { k: "disponible", label: "Disponibles", test: (r) => r.estatus_unidad === "disponible" },
        { k: "en_rutina", label: "En rutina", test: (r) => r.estatus_unidad === "en_rutina" },
        { k: "fuera", label: "Fuera de servicio", test: (r) => r.estatus_unidad === "fuera_servicio" },
      ]}
      quickView={(r) => (
        <>
          <div className="sc-folio" style={{ fontSize: 16 }}>#{r.numero ?? "—"}</div>
          <h3 style={{ margin: "6px 0 8px" }}>{`${r.tipo ?? ""} ${r.marca ?? ""} ${r.modelo ?? ""}`.trim()}</h3>
          <div style={{ marginBottom: 8 }}><PillUnidad v={r.estatus_unidad} /></div>
          <dl className="sc-kv">
            <dt>Placas</dt><dd>{r.placas ?? "—"}</dd>
            <dt>Año</dt><dd>{r.anio ?? "—"}</dd>
            <dt>Color</dt><dd>{r.color ?? "—"}</dd>
          </dl>
        </>
      )}
      editar={[
        { campo: "numero", label: "Número económico" },
        { campo: "marca", label: "Marca" },
        { campo: "modelo", label: "Modelo" },
        { campo: "placas", label: "Placas" },
        { campo: "color", label: "Color" },
      ]}
      nuevo={(onCreado) => <NuevaPatrulla onCreado={onCreado} />}
      // Selección múltiple: cambiar el estatus operativo de varias unidades a la vez.
      lote={{
        nombrePlural: "patrullas",
        acciones: ESTATUS_LISTA.map((s) => ({ k: s, label: ESTATUS_UNIDAD[s].label, color: ESTATUS_UNIDAD[s].bg })),
        onAplicar: async (ids, k) => {
          const { error } = await supabase
            .from("patrullas")
            .update({ estatus_unidad: k, actualizado_en: new Date().toISOString() })
            .in("id", ids);
          if (error) throw error;
        },
      }}
    />
  );
}
