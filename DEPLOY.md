# Despliegue en internet

La app tiene dos partes:

- **Backend** (base de datos, autenticación, storage): **Supabase**, ya está en la nube.
- **Frontend** (Next.js): se aloja en **Vercel** (plan gratuito), conectado a este
  repositorio de GitHub. Cada `git push` a `main` vuelve a desplegar solo.

---

## Desplegar el frontend en Vercel

1. Entra a [vercel.com](https://vercel.com) y regístrate con tu cuenta de **GitHub**.
2. **Add New → Project** → importa el repositorio **`jorgeronc/SCP`**.
3. **Root Directory:** selecciona **`frontend`** (la app Next vive en esa subcarpeta,
   no en la raíz del repo). Vercel detectará Next.js automáticamente
   (Framework Preset: Next.js).
4. **Environment Variables** — agrega las mismas dos de `frontend/.env.local`:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://rdyjjfbehjfggpldmmur.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (tu anon/publishable key de Supabase) |

   > La anon/publishable key es pública por diseño (viaja al navegador), así que no
   > es un secreto. La `service_role` **nunca** se pone aquí.
5. **Deploy.** En 1–2 minutos obtienes una URL pública, p. ej. `https://scp-xxxx.vercel.app`.

Build settings (Vercel los pone solos al detectar Next.js; solo verifica):
- Install Command: `npm install`
- Build Command: `next build`
- Output: gestionado por el preset de Next.js

---

## Ajuste en Supabase tras el primer deploy

En el dashboard de Supabase → **Authentication → URL Configuration**:
- **Site URL:** tu URL de Vercel (`https://scp-xxxx.vercel.app`).
- Agrégala también en **Redirect URLs**.

Con login por contraseña no es imprescindible, pero es buena práctica y evita
problemas si más adelante activas confirmación por correo o magic links.

---

## Notas

- El puerto fijo `3100` (`next dev/start -p 3100`) solo aplica en local; Vercel usa su
  propio build/serving, no se ve afectado.
- **Supabase (plan gratuito) se pausa** tras ~7 días sin uso. Reactívalo desde el
  dashboard antes de una demo.
- **Dominio propio:** opcional, gratis en Vercel → Settings → Domains.
- **Pendientes de hardening para producción** (no bloquean la demo): bucket de fotos
  privado + URLs firmadas, firma electrónica en órdenes, cifrado por registro en
  Asuntos Internos, catálogo de dispositivos para `computadora_id`, migración a Next 16.

---

## Alternativa on-premise

Para instalar en el servidor de una agencia (sin nube): Supabase **auto-hospedado**
(Docker Compose) + el mismo frontend Next. El esquema SQL y el código no cambian;
solo cambia dónde vive la infraestructura. Ver la sección 2 del documento de
arquitectura.
