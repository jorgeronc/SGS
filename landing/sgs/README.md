# Landing SGS — para consultechseguridad.mx

`index.html` es una **landing autocontenida** (un solo archivo, CSS y logo embebidos) de SGS como producto de **Consultech Seguridad**. Sin dependencias salvo Google Fonts.

## Cómo publicarla
- **Recomendado:** súbela como página `https://www.consultechseguridad.mx/sgs/` (sube `index.html` a una carpeta `/sgs/`). Enlázala desde el menú y el footer del sitio.
- Alternativa SEO: servirla en `/software-seguridad-privada/`.
- Si usas un gestor (WordPress/Wix/etc.): crea una página en blanco y pega el **contenido** de `index.html`, o súbela como página HTML personalizada.

## Antes de publicar (reemplazar)
En `index.html`:
- **Contacto** (en la sección final y el `mailto`/WhatsApp): teléfono `+52 55 0000 0000`, WhatsApp `525500000000` y correo `contacto@consultechseguridad.mx`.
- **Imagen Open Graph** (para compartir en redes/WhatsApp): sube una imagen 1200×630 a `/sgs/og-sgs.jpg` (la meta `og:image` ya la apunta). Puede ser una captura del sistema + logo.
- Revisa el `canonical` y los `og:url` si la ruta final no es `/sgs`.

## SEO ya incluido
`<title>` y `meta description` con keywords ("software de gestión para empresas de seguridad privada"), `keywords`, Open Graph, Twitter Card, `canonical`, **JSON-LD** (SoftwareApplication + Organization Consultech), H1 con keyword, FAQ y copy orientado a búsqueda. Responsiva, con tema claro/oscuro.

> Tip de posicionamiento: una vez publicada, dala de alta en **Google Search Console** y enlázala desde la home; agrega 2–3 enlaces internos desde otras páginas del sitio con el texto "software de gestión de seguridad privada".
