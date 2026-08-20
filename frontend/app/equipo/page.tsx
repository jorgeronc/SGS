"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { SelectPersonal } from "@/app/components/Pickers";
import { subirFotoArchivo } from "@/lib/fotos";
import { vehiculosSimilares, type RegistroSimilar } from "@/lib/duplicados";
import AvisoDuplicados from "@/app/components/AvisoDuplicados";

function asignadoA(p: any) {
  if (!p) return "—";
  const nom = p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
  const emp = `${p.rango ?? ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
  return [nom, emp].filter(Boolean).join(" — ") || "—";
}

// Al registrar una patrulla/motocicleta, además de crear el equipo se crea el
// registro en Vehículos (flota de la agencia) con la foto capturada aquí, y se
// avisa si ya existe un vehículo con esa placa (sin bloquear).
function NuevoEquipo({ onCreado }: { onCreado: () => void }) {
  const [tipo, setTipo] = useState("arma");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [serie, setSerie] = useState("");
  const [asignadoId, setAsignadoId] = useState("");
  const [placas, setPlacas] = useState("");
  const [anio, setAnio] = useState("");
  const [color, setColor] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [avisos, setAvisos] = useState<RegistroSimilar[] | null>(null);
  const [coincidencias, setCoincidencias] = useState<RegistroSimilar[]>([]);

  const esVehiculo = tipo === "patrulla" || tipo === "motocicleta";

  // Alerta en vivo: al capturar las placas, avisar si ese vehículo ya existe.
  useEffect(() => {
    const p = placas.trim();
    if (!esVehiculo || p.length < 3) { setCoincidencias([]); return; }
    const t = setTimeout(async () => setCoincidencias(await vehiculosSimilares({ placas: p })), 450);
    return () => clearTimeout(t);
  }, [placas, esVehiculo]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreando(true);

    let vehiculoId: string | null = null;
    let similares: RegistroSimilar[] = [];

    // Si es patrulla/moto: crear también el registro en Vehículos (con foto).
    if (esVehiculo) {
      similares = await vehiculosSimilares({ placas });
      const { data: veh, error: eV } = await supabase.from("vehiculos").insert({
        placas: placas || null,
        marca: marca || null,
        modelo: modelo || null,
        anio: anio ? Number(anio) : null,
        color: color || null,
        tipo,
        es_flota_agencia: true,
      }).select("id").single();
      if (eV || !veh) { setError(eV?.message ?? "No se pudo crear el vehículo."); setCreando(false); return; }
      vehiculoId = veh.id;
      if (foto) {
        const ruta = await subirFotoArchivo("vehiculos", veh.id, foto);
        if (ruta) await supabase.from("vehiculos").update({ fotografias: [ruta] }).eq("id", veh.id);
      }
    }

    // Crear el equipo (referencia al vehículo en datos_adicionales si aplica).
    const { data: eq, error: eE } = await supabase.from("equipo").insert({
      tipo: tipo || null,
      marca: marca || null,
      modelo: modelo || null,
      numero_serie: serie || null,
      asignado_personal_id: asignadoId || null,
      estado_equipo: asignadoId ? "asignado" : "operativo",
      fecha_alta: new Date().toISOString().slice(0, 10),
      datos_adicionales: vehiculoId ? { vehiculo_id: vehiculoId } : {},
    }).select("id").single();
    if (eE) { setError(eE.message); setCreando(false); return; }
    // Foto para equipo no-vehículo.
    if (!esVehiculo && foto && eq) {
      const ruta = await subirFotoArchivo("equipo", eq.id, foto);
      if (ruta) await supabase.from("equipo").update({ fotografias: [ruta] }).eq("id", eq.id);
    }

    setCreando(false);
    setAvisos(similares);
  }

  if (avisos !== null) {
    return (
      <div>
        <p style={{ color: "#0a7c2f", fontWeight: 700 }}>✔ Equipo registrado{esVehiculo ? " y agregado a Vehículos (flota)" : ""}.</p>
        <AvisoDuplicados titulo="Este vehículo ya estaba registrado en el sistema" registros={avisos} />
        <button onClick={onCreado} style={{ marginTop: 8 }}>Listo</button>
      </div>
    );
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="arma">Arma</option>
          <option value="radio">Radio</option>
          <option value="bodycam">Bodycam</option>
          <option value="patrulla">Patrulla</option>
          <option value="motocicleta">Motocicleta</option>
          <option value="otro">Otro</option>
        </select>
        <input placeholder="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
        <input placeholder="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        <input placeholder="Número de serie" value={serie} onChange={(e) => setSerie(e.target.value)} />
        <SelectPersonal value={asignadoId} onChange={setAsignadoId} placeholder="— Asignar a (opcional) —" />
      </div>
      {esVehiculo && (
        <>
          <p className="dash-sub">Datos del vehículo (se crea en Vehículos · flota):</p>
          <div className="form-fila">
            <input placeholder="Placas" value={placas} onChange={(e) => setPlacas(e.target.value)} />
            <input placeholder="Año" type="number" value={anio} onChange={(e) => setAnio(e.target.value)} />
            <input placeholder="Color" value={color} onChange={(e) => setColor(e.target.value)} />
            <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fotografía
              <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <AvisoDuplicados titulo="Este vehículo ya está registrado en el sistema" registros={coincidencias} />
        </>
      )}
      <div className="form-fila">
        <button type="submit" disabled={creando}>{creando ? "Registrando…" : "Registrar equipo"}</button>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function EquipoPage() {
  return (
    <ListaMaestra
      titulo="Equipo policial"
      subtitulo="Armas, radios, bodycams, patrullas y motos"
      tabla="equipo"
      modulo="equipo"
      select="id, folio, tipo, marca, modelo, numero_serie, estado_equipo, estatus, creado_en, fotografias, personal:personal(numero_placa, rango, persona:personas(nombre, apellido_paterno))"
      miniatura={(r) => r.fotografias}
      placeholderBuscar="Buscar folio, tipo, marca, serie…"
      columnas={[
        { header: "Folio", campo: "folio", celda: (r) => <span className="sc-folio">{r.folio ?? "s/folio"}</span> },
        { header: "Tipo", celda: (r) => r.tipo ?? "—" },
        { header: "Marca / Modelo", celda: (r) => `${r.marca ?? ""} ${r.modelo ?? ""}`.trim() },
        { header: "Asignado a", celda: (r) => asignadoA(r.personal) },
        { header: "Estado", celda: (r) => r.estado_equipo },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.tipo ?? ""} ${r.marca ?? ""} ${r.modelo ?? ""} ${r.numero_serie ?? ""}`}
      detalleHref={(r) => `/equipo/${r.id}`}
      filtros={[
        { k: "todos", label: "Todos" },
        { k: "operativo", label: "Operativos", test: (r) => r.estado_equipo === "operativo" },
        { k: "asignado", label: "Asignados", test: (r) => r.estado_equipo === "asignado" },
      ]}
      quickView={(r) => (
        <>
          <div className="sc-folio" style={{ fontSize: 16 }}>{r.folio ?? "s/folio"}</div>
          <h3 style={{ margin: "6px 0 8px" }}>{`${r.tipo ?? ""} ${r.marca ?? ""} ${r.modelo ?? ""}`.trim()}</h3>
          <dl className="sc-kv">
            <dt>Serie</dt><dd>{r.numero_serie ?? "—"}</dd>
            <dt>Asignado</dt><dd>{asignadoA(r.personal)}</dd>
            <dt>Estado</dt><dd>{r.estado_equipo}</dd>
          </dl>
        </>
      )}
      editar={[
        { campo: "tipo", label: "Tipo" },
        { campo: "marca", label: "Marca" },
        { campo: "modelo", label: "Modelo" },
        { campo: "numero_serie", label: "Número de serie" },
      ]}
      nuevo={(onCreado) => <NuevoEquipo onCreado={onCreado} />}
    />
  );
}
