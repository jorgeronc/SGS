"use client";

// Pestaña "Acerca de" dentro de Configuración: créditos del desarrollador.
export default function AcercaDe() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "24px 12px" }}>
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          textAlign: "center",
          border: "1px solid var(--sc-card-line)",
          borderRadius: 14,
          background: "var(--sc-content)",
          padding: "28px 24px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escudo.png" alt="SGS" style={{ height: 64, width: "auto", objectFit: "contain", marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 800 }}>Sistema de Gestión de Seguridad</div>
        <div style={{ fontSize: 13, color: "var(--sc-text-soft)", marginTop: 2, marginBottom: 18 }}>SGS</div>

        <div style={{ height: 1, background: "var(--sc-card-line)", margin: "0 auto 18px", maxWidth: 120 }} />

        <p style={{ margin: "0 0 6px", fontSize: 14 }}>
          Desarrollado por <strong>Consultech Seguridad</strong>
        </p>
        <p style={{ margin: "0 0 6px", fontSize: 14 }}>
          <a
            href="https://www.consultechseguridad.mx"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--sc-btn,#f4a03f)", fontWeight: 700, textDecoration: "none" }}
          >
            www.consultechseguridad.mx
          </a>
        </p>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--sc-text-soft)" }}>
          Consultoría y Soluciones tecnológicas para Seguridad
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--sc-text-soft)" }}>
          © 2026 Consultech. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
