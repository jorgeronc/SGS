import AdminTabs from "../AdminTabs";

// Ruta heredada: abre Administración en la pestaña de Usuarios y roles.
export default function AdminUsuariosPage() {
  return <AdminTabs initial="usuarios" />;
}
