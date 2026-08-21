import Link from "next/link";

// Bloque de bienvenida/branding: escudo, leyenda de bienvenida y, en grande,
// el nombre de la Secretaría. Se usa en la pantalla de inicio (sin sesión) y
// en la pantalla de acceso.
export default function Bienvenida({ mostrarLogin = false }: { mostrarLogin?: boolean }) {
  return (
    <section className="bienvenida">
      <img src="/escudo.png" alt="Escudo de la policía" className="escudo-grande" />
      <h1 className="bienvenida-titulo">Bienvenido al Sistema de Gestión de Seguridad</h1>
      <p className="bienvenida-secretaria">Seguridad Privada</p>
      {mostrarLogin && (
        <Link href="/login" className="boton-login">
          Iniciar sesión
        </Link>
      )}
    </section>
  );
}
