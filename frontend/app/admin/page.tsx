import AdminTabs from "./AdminTabs";

// Módulo de Administración: pantalla con pestañas (Usuarios y roles, Iniciales
// por módulo, Consecutivos por año, Catálogos).
export default function AdminPage() {
  return <AdminTabs initial="usuarios" />;
}
