import AdminTabs from "../AdminTabs";

// Ruta heredada: abre Administración en la pestaña de Catálogos.
export default function AdminCatalogosPage() {
  return <AdminTabs initial="catalogos" />;
}
