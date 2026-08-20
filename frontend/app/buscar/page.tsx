"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

interface Resultado {
  grupo: string;
  id: string;
  etiqueta: string;
  href: string;
}

// Quita caracteres que romperían el filtro `or` de PostgREST.
function limpiar(q: string): string {
  return q.replace(/[,()*%]/g, " ").trim();
}

function nombrePersonal(p: any): string {
  const nombre = p?.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
  const empleo = `${p?.rango ?? ""}${p?.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
  return [nombre, empleo].filter(Boolean).join(" — ");
}

async function buscarTodo(q: string): Promise<Resultado[]> {
  const like = `*${q}*`;
  const res: Resultado[] = [];

  const p = await supabase
    .from("personas")
    .select("id,nombre,apellido_paterno,apellido_materno,curp")
    .or(`nombre.ilike.${like},apellido_paterno.ilike.${like},apellido_materno.ilike.${like},curp.ilike.${like}`)
    .limit(10);
  (p.data ?? []).forEach((r: any) =>
    res.push({
      grupo: "Personas",
      id: r.id,
      href: `/personas/${r.id}`,
      etiqueta: `${r.nombre ?? ""} ${r.apellido_paterno ?? ""} ${r.apellido_materno ?? ""}`.trim() + (r.curp ? ` · ${r.curp}` : ""),
    })
  );

  const v = await supabase
    .from("vehiculos")
    .select("id,placas,marca,modelo,vin")
    .or(`placas.ilike.${like},marca.ilike.${like},modelo.ilike.${like},vin.ilike.${like}`)
    .limit(10);
  (v.data ?? []).forEach((r: any) =>
    res.push({
      grupo: "Vehículos",
      id: r.id,
      href: `/vehiculos/${r.id}`,
      etiqueta: `${r.marca ?? ""} ${r.modelo ?? ""} (${r.placas ?? "s/placas"})`.trim(),
    })
  );

  const c = await supabase
    .from("casos")
    .select("id,folio,titulo")
    .or(`folio.ilike.${like},titulo.ilike.${like},tipo.ilike.${like}`)
    .limit(10);
  (c.data ?? []).forEach((r: any) =>
    res.push({ grupo: "Casos", id: r.id, href: `/casos/${r.id}`, etiqueta: `${r.folio ? `[${r.folio}] ` : ""}${r.titulo ?? ""}` })
  );

  const o = await supabase
    .from("ordenes")
    .select("id,folio,asunto,tipo")
    .or(`folio.ilike.${like},asunto.ilike.${like},autoridad_emisora.ilike.${like}`)
    .limit(10);
  (o.data ?? []).forEach((r: any) =>
    res.push({ grupo: "Citatorios/Órdenes", id: r.id, href: `/ordenes/${r.id}`, etiqueta: `${r.folio ? `[${r.folio}] ` : ""}${r.tipo ?? ""} ${r.asunto ?? ""}`.trim() })
  );

  const ev = await supabase
    .from("evidencias")
    .select("id,folio,tipo,descripcion")
    .or(`folio.ilike.${like},descripcion.ilike.${like},tipo.ilike.${like}`)
    .limit(10);
  (ev.data ?? []).forEach((r: any) =>
    res.push({ grupo: "Evidencias", id: r.id, href: `/evidencias/${r.id}`, etiqueta: `${r.folio ? `[${r.folio}] ` : ""}${r.tipo ?? ""} ${r.descripcion ?? ""}`.trim() })
  );

  const eq = await supabase
    .from("equipo")
    .select("id,folio,tipo,marca,modelo,numero_serie")
    .or(`folio.ilike.${like},numero_serie.ilike.${like},marca.ilike.${like},modelo.ilike.${like}`)
    .limit(10);
  (eq.data ?? []).forEach((r: any) =>
    res.push({ grupo: "Equipo", id: r.id, href: `/equipo/${r.id}`, etiqueta: `${r.folio ? `[${r.folio}] ` : ""}${r.tipo ?? ""} ${r.marca ?? ""} ${r.modelo ?? ""}`.trim() })
  );

  const pe = await supabase
    .from("personal")
    .select("id,numero_placa,rango,persona:personas(nombre,apellido_paterno)")
    .or(`numero_placa.ilike.${like},rango.ilike.${like},adscripcion.ilike.${like}`)
    .limit(10);
  (pe.data ?? []).forEach((r: any) =>
    res.push({ grupo: "Personal", id: r.id, href: `/personal/${r.id}`, etiqueta: nombrePersonal(r) || r.numero_placa || r.id })
  );

  const cd = await supabase
    .from("llamadas_cad")
    .select("id,folio,tipo,direccion,reportante")
    .or(`folio.ilike.${like},direccion.ilike.${like},reportante.ilike.${like},tipo.ilike.${like}`)
    .limit(10);
  (cd.data ?? []).forEach((r: any) =>
    res.push({ grupo: "CAD", id: r.id, href: `/cad/${r.id}`, etiqueta: `${r.folio ? `[${r.folio}] ` : ""}${r.tipo ?? ""} ${r.direccion ?? ""}`.trim() })
  );

  const inc = await supabase
    .from("incidentes")
    .select("id,folio,tipo,delito,direccion")
    .or(`folio.ilike.${like},direccion.ilike.${like},tipo.ilike.${like},delito.ilike.${like}`)
    .limit(10);
  (inc.data ?? []).forEach((r: any) =>
    res.push({ grupo: "Incidentes", id: r.id, href: `/incidentes/${r.id}`, etiqueta: `${r.folio ? `[${r.folio}] ` : ""}${r.delito ?? r.tipo ?? ""} ${r.direccion ?? ""}`.trim() })
  );

  const ac = await supabase
    .from("accidentes")
    .select("id,folio,tipo_hecho,direccion")
    .or(`folio.ilike.${like},direccion.ilike.${like},tipo_hecho.ilike.${like}`)
    .limit(10);
  (ac.data ?? []).forEach((r: any) =>
    res.push({ grupo: "Accidentes", id: r.id, href: `/accidentes/${r.id}`, etiqueta: `${r.folio ? `[${r.folio}] ` : ""}${r.tipo_hecho ?? ""} ${r.direccion ?? ""}`.trim() })
  );

  const u = await supabase
    .from("ubicaciones")
    .select("id,calle,colonia,municipio,referencias")
    .or(`calle.ilike.${like},colonia.ilike.${like},municipio.ilike.${like},referencias.ilike.${like}`)
    .eq("estatus", "activo")
    .limit(10);
  (u.data ?? []).forEach((r: any) =>
    res.push({ grupo: "Ubicaciones", id: r.id, href: `/ubicaciones/${r.id}`, etiqueta: `${r.calle ?? ""}${r.colonia ? `, ${r.colonia}` : ""}${r.municipio ? `, ${r.municipio}` : ""}`.trim() || "(ubicación)" })
  );

  // Asuntos internos: la RLS filtra si el usuario no tiene acceso.
  const ai = await supabase
    .from("asuntos_internos")
    .select("id,folio,asunto,tipo")
    .or(`folio.ilike.${like},asunto.ilike.${like}`)
    .limit(10);
  (ai.data ?? []).forEach((r: any) =>
    res.push({ grupo: "Asuntos Internos", id: r.id, href: `/asuntos-internos/${r.id}`, etiqueta: `${r.folio ? `[${r.folio}] ` : ""}${r.asunto ?? r.tipo ?? ""}` })
  );

  return res;
}

function Resultados() {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const limpio = limpiar(q);
    if (limpio.length < 2) {
      setResultados([]);
      return;
    }
    setCargando(true);
    buscarTodo(limpio).then((r) => {
      setResultados(r);
      setCargando(false);
      supabase.rpc("rpc_registrar_bitacora", {
        p_tipo_accion: "CONSULTAR",
        p_entidad_tipo: "busqueda",
        p_entidad_id: null,
        p_modulo: "busqueda",
      });
    });
  }, [q]);

  const grupos = Array.from(new Set(resultados.map((r) => r.grupo)));

  return (
    <main className="contenedor">
      <h2>Búsqueda</h2>
      <p style={{ color: "#555" }}>
        {q ? <>Resultados para “{q}”</> : "Escribe algo en el buscador del encabezado."}
      </p>

      {cargando ? (
        <p>Buscando...</p>
      ) : q && resultados.length === 0 ? (
        <p style={{ color: "#555" }}>Sin coincidencias (o requieren permisos que tu rol no tiene).</p>
      ) : (
        grupos.map((g) => (
          <section key={g}>
            <h3>{g}</h3>
            <ul>
              {resultados
                .filter((r) => r.grupo === g)
                .map((r) => (
                  <li key={r.id}>
                    <Link href={r.href}>{r.etiqueta || r.id}</Link>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

export default function BuscarPage() {
  return (
    <Suspense fallback={<main className="contenedor"><p>Cargando...</p></main>}>
      <Resultados />
    </Suspense>
  );
}
