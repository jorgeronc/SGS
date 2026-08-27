import "./globals.css";
import type { ReactNode } from "react";
import AppShell from "./components/AppShell";

export const metadata = {
  title: "Sistema de Gestión de Seguridad",
  description: "SGS — Gestión de Seguridad Privada",
};

// Fija el tema (claro/oscuro) ANTES de pintar, sin parpadeo, leyendo la
// preferencia guardada (o la del sistema si es "automático").
const TEMA_INIT = `(function(){try{var k=localStorage.getItem('sgs-theme')||'system';var d=k==='dark'||(k==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head><script dangerouslySetInnerHTML={{ __html: TEMA_INIT }} /></head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
