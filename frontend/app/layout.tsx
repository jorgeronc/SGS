import "./globals.css";
import type { ReactNode } from "react";
import AppShell from "./components/AppShell";

export const metadata = {
  title: "Sistema de Gestión de Seguridad",
  description: "SGS — Gestión de Seguridad Privada",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
