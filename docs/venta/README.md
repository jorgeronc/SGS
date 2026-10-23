# Documentos de venta — SGS

Material comercial del **Sistema de Gestión de Seguridad (SGS)** para la venta del sistema.

**Fuente de verdad = los `.md`.** Los `.docx` se **regeneran desde los `.md`** con pandoc (`tools/build-docx.sh`); no se editan a mano.

| Documento | Versión | Propósito | Público |
|---|---|---|---|
| `SGS-Propuesta-Comercial.md` → `.docx` | **v1.7 · Oct 2026** | Propuesta de valor / presentación comercial: qué es, beneficios, capacidades, diferenciadores, siguientes pasos. | Cliente / decisor de compra |
| `SGS-Precios.md` → `.docx` | **v1.7 · Oct 2026** | Esquema de precios: planes SaaS, add-ons, On-Premise, descuentos por volumen. | Cliente / decisor de compra |
| `SGS-Flujo-Operativo.md` → `.docx` | **v2.5 · Oct 2026** | Flujo operativo funcional (anexo): cómo funciona paso a paso, por rol y módulo. | Cliente operativo / evaluación |
| `../SGS-vs-Clave10-Comparativa.md` → `.docx` | **Oct 2026** | Comparativa/benchmark contra Clave 10. | Ventas / posicionamiento |
| `SGS-Precios-Interno.md` → `.docx` | **v1.3 · Oct 2026** · **no compartir** | Precios + costos por servicio + márgenes + reglas de descuento. | Interno / equipo comercial |

## Regenerar los `.docx`

```bash
bash docs/venta/tools/build-docx.sh      # requiere pandoc instalado
```

Edita siempre el `.md` y vuelve a correr el script; nunca edites el `.docx` directamente (se sobrescribe).

## Estado (Oct 2026)
- **Todo al día** (MD + `.docx` sincronizados): Propuesta v1.7, Precios v1.7, Flujo v2.5, Precios-Interno v1.3 y Comparativa.
- **Última ronda de cambios:** **Gestión de contratos** (estados + vencimientos + tablero), **integración de videovigilancia con ISS SecurOS ya disponible**, **evidencia por audio**, **Seguridad Logística / Vista Operativa** (flujo + línea en precios), rondín por **geocerca + sesiones automáticas**, **relevo automático + anti-fatiga** y **citas de visitantes con autoregistro**.
- Los add-ons nuevos (Seguridad Logística, integración VMS) llevan **precio por definir** en los docs de precios.

## Notas
- En la Propuesta Comercial, completar el bloque **Contacto** (`[ nombre / correo / teléfono comercial ]`).
- **Precios:** los montos (MXN, sin IVA) son lista sugerida ajustable. En el doc interno, cargar las tarifas reales de cada servicio para calcular costo por guardia y punto de equilibrio.
- Los `.docx` llevan índice (TOC) generado por pandoc; al abrirlos en Word puede pedir **actualizar el índice** (F9).
