// Generador del deck de acercamiento SGS (ejecutivo). pptxgenjs.
// Uso:  cd docs/venta/tools && npm i pptxgenjs && node gen-presentacion.js
// Salida por defecto: docs/venta/SGS-Presentacion.pptx. El logo se toma del repo.
const P = require("pptxgenjs");
const path = require("path");
const OUT = process.argv[2] || path.join(__dirname, "..", "SGS-Presentacion.pptx");
const LOGO = path.join(__dirname, "..", "..", "..", "frontend", "public", "escudo.png");

// --- Paleta SGS ---
const NAVY = "0E1B2A", SLATE = "15323D", ORANGE = "F4A03F", TEAL = "0E8F86",
      BLUE = "2F7CC4", GREEN = "2E9E6B", RED = "D1495B", MUTE = "6C8092",
      LIGHT = "F2F6F9", WHITE = "FFFFFF", LINE = "DBE3EC", INK = "0E1B2A",
      SOFT = "3F5568";
const HEAD = "Calibri", BODY = "Calibri";

const p = new P();
p.defineLayout({ name: "SGS", width: 13.333, height: 7.5 });
p.layout = "SGS";
p.author = "SGS"; p.company = "SGS";

const W = 13.333, H = 7.5;

function footer(s, n) {
  s.addText("SGS — Sistema de Gestión de Seguridad", { isTextBox: true, x: 0.6, y: H - 0.42, w: 8, h: 0.3, fontFace: BODY, fontSize: 9, color: MUTE, align: "left", margin: 0 });
  s.addText(String(n), { isTextBox: true, x: W - 1.1, y: H - 0.42, w: 0.5, h: 0.3, fontFace: BODY, fontSize: 9, color: MUTE, align: "right", margin: 0 });
}
function titulo(s, t, color) {
  s.addText(t, { isTextBox: true, x: 0.6, y: 0.45, w: W - 1.2, h: 0.9, fontFace: HEAD, fontSize: 30, bold: true, color: color || INK, align: "left", margin: 0 });
}
function kicker(s, t, x, y, w) {
  s.addText(t.toUpperCase(), { isTextBox: true, x, y, w, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: ORANGE, charSpacing: 2, align: "left", margin: 0 });
}
// Marco de captura (placeholder etiquetado)
function captura(s, x, y, w, h, label) {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: LIGHT }, line: { color: LINE, width: 1.25, dashType: "dash" } });
  s.addText("◻  CAPTURA DE PANTALLA", { isTextBox: true, x, y: y + h / 2 - 0.5, w, h: 0.35, fontFace: BODY, fontSize: 12, bold: true, color: MUTE, align: "center", margin: 0 });
  s.addText(label, { isTextBox: true, x: x + 0.2, y: y + h / 2 - 0.1, w: w - 0.4, h: 0.6, fontFace: BODY, fontSize: 13, color: SOFT, align: "center", margin: 0 });
}
// Imagen real dentro de una tarjeta (contain, centrada). portrait = columna angosta.
const ASSETS = path.join(__dirname, "..", "assets", "presentacion");
function imagen(s, x, y, w, h, file, portrait) {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: WHITE }, line: { color: LINE, width: 1.25 }, shadow: { type: "outer", color: "9DB0C4", blur: 7, offset: 2, angle: 90, opacity: 0.4 } });
  let ix = x + 0.14, iy = y + 0.14, iw = w - 0.28, ih = h - 0.28;
  if (portrait) { const cw = Math.min(iw, h * 0.52); ix = x + (w - cw) / 2; iw = cw; }
  s.addImage({ path: file, x: ix, y: iy, w: iw, h: ih, sizing: { type: "contain", w: iw, h: ih } });
}
// Lista de viñetas
function vinetas(s, items, x, y, w, h, opt = {}) {
  const runs = items.map((t, i) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: true, paraSpaceAfter: 10, fontFace: BODY, fontSize: opt.fontSize || 15.5, color: opt.color || INK } }));
  s.addText(runs, { isTextBox: true, x, y, w, h, align: "left", valign: "top", margin: 0 });
}

// ---------- S1 Portada ----------
let s = p.addSlide();
s.background = { color: NAVY };
s.addShape(p.shapes.RECTANGLE, { x: 0, y: H - 0.12, w: W, h: 0.12, fill: { color: ORANGE } });
s.addImage({ path: LOGO, x: 0.9, y: 1.5, w: 1.9, h: 1.9 });
s.addText("SGS", { isTextBox: true, x: 0.9, y: 3.6, w: 11.5, h: 1.0, fontFace: HEAD, fontSize: 56, bold: true, color: WHITE, align: "left", margin: 0 });
s.addText("Sistema de Gestión de Seguridad", { isTextBox: true, x: 0.95, y: 4.55, w: 11.5, h: 0.6, fontFace: HEAD, fontSize: 26, color: ORANGE, align: "left", margin: 0 });
s.addText("Plataforma integral para empresas de seguridad privada", { isTextBox: true, x: 0.95, y: 5.15, w: 11.5, h: 0.5, fontFace: BODY, fontSize: 16, color: "CADCFC", align: "left", margin: 0 });
s.addText("Rondines verificables · Monitoreo en vivo · Seguridad Logística · Videovigilancia · Cumplimiento y SLA", { isTextBox: true, x: 0.95, y: 5.65, w: 11.5, h: 0.5, fontFace: BODY, fontSize: 13, italic: true, color: "9DB0C4", align: "left", margin: 0 });
s.addText("Presentación de acercamiento", { isTextBox: true, x: 0.95, y: 6.5, w: 8, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: WHITE, align: "left", margin: 0 });

// ---------- S2 El reto del sector ----------
s = p.addSlide(); s.background = { color: WHITE };
titulo(s, "El reto del sector");
const retos = [
  ["Rondines no verificables", "No hay forma de comprobar que el guardia recorrió los puntos, ni la ruta que siguió."],
  ["Áreas amplias sin infraestructura", "Predios, patios y perímetros donde no es viable colocar etiquetas QR/NFC en cada punto."],
  ["Sin visibilidad en vivo", "La central no sabe dónde están sus guardias ni qué ocurre en el momento."],
  ["Custodia de carga sin control", "En CEDIS y traslados no se garantiza que cada movimiento cumplió acceso, inspección y sello."],
  ["Reportes tardíos y sin sustento", "Difícil demostrar el servicio al cliente y retener contratos."],
];
let yy = 1.7;
retos.forEach((r, i) => {
  s.addShape(p.shapes.OVAL, { x: 0.7, y: yy, w: 0.42, h: 0.42, fill: { color: ORANGE } });
  s.addText(String(i + 1), { isTextBox: true, x: 0.7, y: yy, w: 0.42, h: 0.42, fontFace: HEAD, fontSize: 15, bold: true, color: WHITE, align: "center", valign: "middle", margin: 0 });
  s.addText([{ text: r[0] + "   ", options: { bold: true, color: INK, fontSize: 15.5 } }, { text: r[1], options: { color: SOFT, fontSize: 13.5 } }], { isTextBox: true, x: 1.35, y: yy - 0.07, w: 11.2, h: 0.6, fontFace: BODY, align: "left", valign: "middle", margin: 0 });
  yy += 0.92;
});
footer(s, 2);

// ---------- S3 Qué es SGS ----------
s = p.addSlide(); s.background = { color: WHITE };
titulo(s, "Qué es SGS");
s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.55, w: 12.1, h: 0.9, rectRadius: 0.06, fill: { color: LIGHT }, line: { color: LINE, width: 1 } });
s.addText("Digitaliza y controla, de principio a fin, la operación de una empresa de seguridad privada — y le da al cliente la certeza, con evidencia, de que el servicio se cumple.", { isTextBox: true, x: 0.9, y: 1.6, w: 11.5, h: 0.8, fontFace: BODY, fontSize: 15, italic: true, color: INK, align: "left", valign: "middle", margin: 0 });
function card(s, x, y, w, h, titulo, color, items) {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: WHITE }, line: { color: LINE, width: 1.25 }, shadow: { type: "outer", color: "9DB0C4", blur: 6, offset: 2, angle: 90, opacity: 0.35 } });
  s.addShape(p.shapes.OVAL, { x: x + 0.3, y: y + 0.3, w: 0.5, h: 0.5, fill: { color } });
  s.addText(titulo, { isTextBox: true, x: x + 0.95, y: y + 0.3, w: w - 1.2, h: 0.5, fontFace: HEAD, fontSize: 17, bold: true, color: INK, align: "left", valign: "middle", margin: 0 });
  vinetas(s, items, x + 0.35, y + 1.05, w - 0.7, h - 1.3, { fontSize: 13.5, color: SOFT });
}
card(s, 0.6, 2.75, 5.95, 3.9, "Central de Operaciones (web)", TEAL, [
  "Administración de clientes, sitios y guardias",
  "Monitoreo en vivo, despacho (CAD) y videovigilancia",
  "Seguridad Logística (Vista Operativa)",
  "Supervisión, cumplimiento/SLA y reportes",
]);
card(s, 6.75, 2.75, 5.95, 3.9, "Guardia en campo (app móvil)", ORANGE, [
  "Rondines por QR, NFC o geocerca",
  "Incidentes, evidencias e inspecciones",
  "Control de acceso en caseta y tareas",
  "Alerta de emergencia con video en vivo",
]);
footer(s, 3);

// ---------- S4 Cómo funciona ----------
s = p.addSlide(); s.background = { color: WHITE };
titulo(s, "Cómo funciona");
const pasos = [
  ["1", "Configurar", "Cliente, sitios y puntos de control (QR)"],
  ["2", "Planificar", "Rol de turnos: supervisor y guardias por sitio"],
  ["3", "Operar", "Rondines, accesos, incidentes y tareas en campo"],
  ["4", "Monitorear", "GPS en vivo, despacho y videovigilancia"],
  ["5", "Reportar", "Recorridos en PDF, evidencias y SLA"],
];
const pw = 2.28, gap = 0.2, startX = (W - (pw * 5 + gap * 4)) / 2;
pasos.forEach((ps, i) => {
  const x = startX + i * (pw + gap);
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 2.4, w: pw, h: 2.9, rectRadius: 0.06, fill: { color: LIGHT }, line: { color: LINE, width: 1 } });
  s.addShape(p.shapes.OVAL, { x: x + pw / 2 - 0.4, y: 2.75, w: 0.8, h: 0.8, fill: { color: i % 2 ? TEAL : ORANGE } });
  s.addText(ps[0], { isTextBox: true, x: x + pw / 2 - 0.4, y: 2.75, w: 0.8, h: 0.8, fontFace: HEAD, fontSize: 26, bold: true, color: WHITE, align: "center", valign: "middle", margin: 0 });
  s.addText(ps[1], { isTextBox: true, x: x + 0.1, y: 3.75, w: pw - 0.2, h: 0.5, fontFace: HEAD, fontSize: 16, bold: true, color: INK, align: "center", margin: 0 });
  s.addText(ps[2], { isTextBox: true, x: x + 0.15, y: 4.25, w: pw - 0.3, h: 0.95, fontFace: BODY, fontSize: 12.5, color: SOFT, align: "center", valign: "top", margin: 0 });
});
footer(s, 4);

// ---------- Slides de capacidad (imagen + viñetas) ----------
function capacidad(n, k, tit, items, cap, imgLeft, imgFile, portrait) {
  const s = p.addSlide(); s.background = { color: WHITE };
  kicker(s, k, 0.6, 0.5, 8);
  s.addText(tit, { isTextBox: true, x: 0.6, y: 0.8, w: W - 1.2, h: 0.8, fontFace: HEAD, fontSize: 28, bold: true, color: INK, align: "left", margin: 0 });
  const imgX = imgLeft ? 0.6 : 6.95, txtX = imgLeft ? 7.0 : 0.7;
  if (imgFile) imagen(s, imgX, 1.95, 5.75, 4.55, path.join(ASSETS, imgFile), portrait);
  else captura(s, imgX, 1.95, 5.75, 4.55, cap);
  vinetas(s, items, txtX, 2.15, 5.5, 4.4, { fontSize: 15.5, color: INK });
  footer(s, n);
  return s;
}
capacidad(5, "Capacidad", "Rondines verificables con trazabilidad GPS", [
  "Lectura del punto por QR o etiqueta NFC, validada por GPS (dentro del radio).",
  "Checkpoints por geocerca en áreas amplias, sin colocar etiquetas.",
  "Sesiones automáticas con reproducción del trayecto (real vs. esperado).",
  "Intentos fuera de rango marcados: control anti-fraude con evidencia.",
], "App del guardia — Rondín QR / NFC", false, "rondin.png", true);

capacidad(6, "Capacidad", "Monitoreo y supervisión en vivo", [
  "Mapa en tiempo real: guardias (con estatus), sitios, puntos, incidencias y cámaras.",
  "Refresco automático sin perder el foco del operador.",
  "Ubicación visible solo para mandos; el supervisor también da seguimiento desde el móvil.",
], "Mapa Operacional (/mapa-operacional)", true);

capacidad(7, "Capacidad", "Videovigilancia integrada", [
  "Consola de monitoreo: doble vista, árbol por sitio, eventos y salud del sistema.",
  "Muro en vivo hasta 24 cámaras y cámaras cercanas a cada incidencia.",
  "Snapshot → evidencia y crear incidente en un clic.",
  "Integración con ISS SecurOS ya disponible (VMS).",
], "Videovigilancia — Muro en vivo", false);

capacidad(8, "Capacidad", "Seguridad Logística — custodia de carga", [
  "Traslados bajo custodia: carretero, ferroviario, intermodal e interno.",
  "Inspecciones (checklist), sellos de seguridad y nivel de riesgo.",
  "Acceso en caseta ligado al movimiento: valida al conductor contra su traslado.",
  "Vista Operativa con gate de Liberación: nada sale sin cumplir el protocolo.",
], "Seguridad Logística — Vista Operativa", true, "vista-operativa.png");

capacidad(9, "Capacidad", "Control de accesos y credenciales", [
  "Entradas/salidas de personas y vehículos; un acceso rechazado genera incidente.",
  "Credenciales QR/NFC/temporal; citas y andenes para CEDIS; zonas por horario.",
  "Citas de visitantes con autoregistro: enlace de un solo uso y credencial QR 12 h.",
], "Control de accesos / Credenciales", false, "accesos.png");

capacidad(10, "Capacidad", "Relevo automático, anti-fatiga y tareas", [
  "Relevo automático: detecta posiciones descubiertas y abre un chat con push a central, coordinador y supervisor.",
  "Anti-fatiga: impide encadenar turnos; relevo forzado con motivo, auditado.",
  "Tareas por sitio o guardia, con recurrencia y evidencia (foto, bodycam o audio).",
], "Rol de turnos / Chat de relevo", true, "turnos.png");

// ---------- S11 Cumplimiento + SLA + IA ----------
s = p.addSlide(); s.background = { color: WHITE };
kicker(s, "Valor al cliente", 0.6, 0.5, 8);
s.addText("Cumplimiento, SLA y Copiloto IA", { isTextBox: true, x: 0.6, y: 0.8, w: W - 1.2, h: 0.8, fontFace: HEAD, fontSize: 28, bold: true, color: INK, align: "left", margin: 0 });
const stats = [["0–100", "Índice de Cumplimiento", ORANGE], ["% SLA", "por cliente, por periodo", TEAL], ["Mensual", "Reporte listo para entregar", BLUE]];
stats.forEach((st, i) => {
  const x = 0.7 + i * 2.0;
  s.addText(st[0], { isTextBox: true, x, y: 2.1, w: 1.9, h: 0.9, fontFace: HEAD, fontSize: 36, bold: true, color: st[2], align: "left", margin: 0 });
  s.addText(st[1], { isTextBox: true, x, y: 3.0, w: 1.9, h: 0.9, fontFace: BODY, fontSize: 12.5, color: SOFT, align: "left", valign: "top", margin: 0 });
});
vinetas(s, [
  "Una sola cifra (0–100) que combina cobertura, rondines, tiempo de respuesta e incidentes críticos.",
  "SLA por cliente con metas definidas y reporte mensual que ayuda a retener contratos.",
  "Copiloto IA: responde en lenguaje natural sobre la operación a partir de los propios registros, citando su origen.",
], 0.7, 4.15, 5.6, 2.4, { fontSize: 14.5, color: INK });
imagen(s, 6.95, 2.0, 5.75, 4.5, path.join(ASSETS, "cumplimiento.png"), false);
footer(s, 11);

// ---------- S12 Diferenciadores ----------
s = p.addSlide(); s.background = { color: WHITE };
titulo(s, "Diferenciadores");
const difs = [
  ["Rondín en áreas amplias", "Validación por geocerca, sin QR/NFC donde no hay etiquetas."],
  ["Trayecto, no solo puntos", "Se registra y reproduce el recorrido real (playback)."],
  ["Custodia con gate", "Nada sale sin cumplir acceso, inspección, sello, GPS y riesgo."],
  ["Relevo garantizado", "Detección automática de descubiertos + anti-fatiga."],
  ["Video + rastreo en un mapa", "Cámaras del sitio y guardias en vivo, juntos."],
  ["Opera sin datos móviles", "Captura por WiFi sin SIM y envío diferido al reconectar."],
];
difs.forEach((d, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = 0.6 + col * 4.1, y = 1.75 + row * 2.45;
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w: 3.85, h: 2.2, rectRadius: 0.06, fill: { color: LIGHT }, line: { color: LINE, width: 1 } });
  s.addShape(p.shapes.OVAL, { x: x + 0.3, y: y + 0.3, w: 0.44, h: 0.44, fill: { color: GREEN } });
  s.addText("✓", { isTextBox: true, x: x + 0.3, y: y + 0.3, w: 0.44, h: 0.44, fontFace: HEAD, fontSize: 16, bold: true, color: WHITE, align: "center", valign: "middle", margin: 0 });
  s.addText(d[0], { isTextBox: true, x: x + 0.9, y: y + 0.3, w: 2.8, h: 0.75, fontFace: HEAD, fontSize: 14.5, bold: true, color: INK, align: "left", valign: "middle", margin: 0 });
  s.addText(d[1], { isTextBox: true, x: x + 0.32, y: y + 1.15, w: 3.25, h: 0.95, fontFace: BODY, fontSize: 12.5, color: SOFT, align: "left", valign: "top", margin: 0 });
});
footer(s, 12);

// ---------- S13 Seguridad y confianza ----------
s = p.addSlide(); s.background = { color: WHITE };
titulo(s, "Seguridad y confianza");
const seg = [
  ["Acceso protegido", "La web exige doble factor (2FA); en el móvil, las funciones de mando solo para supervisor o superior.", BLUE],
  ["Registros inalterables", "Nada se borra: se cancela con motivo. Evidencias y cadena de custodia protegidas (WORM).", TEAL],
  ["Trazabilidad total", "Folios automáticos y bitácora de auditoría de altas, cambios y consultas en todo el sistema.", ORANGE],
  ["Nube, sin servidores propios", "Opera en la nube (Supabase + Vercel; móvil por EAS). La empresa se concentra en su servicio.", GREEN],
];
seg.forEach((g, i) => {
  const y = 1.75 + i * 1.28;
  s.addShape(p.shapes.OVAL, { x: 0.7, y, w: 0.6, h: 0.6, fill: { color: g[2] } });
  s.addText("◆", { isTextBox: true, x: 0.7, y, w: 0.6, h: 0.6, fontFace: HEAD, fontSize: 16, color: WHITE, align: "center", valign: "middle", margin: 0 });
  s.addText([{ text: g[0] + "\n", options: { bold: true, fontSize: 16, color: INK } }, { text: g[1], options: { fontSize: 13.5, color: SOFT } }], { isTextBox: true, x: 1.55, y: y - 0.05, w: 11, h: 1.1, fontFace: BODY, align: "left", valign: "middle", margin: 0 });
});
footer(s, 13);

// ---------- S14 Siguientes pasos ----------
s = p.addSlide(); s.background = { color: NAVY };
s.addShape(p.shapes.RECTANGLE, { x: 0, y: H - 0.12, w: W, h: 0.12, fill: { color: ORANGE } });
s.addText("Siguientes pasos", { isTextBox: true, x: 0.6, y: 0.6, w: W - 1.2, h: 0.9, fontFace: HEAD, fontSize: 32, bold: true, color: WHITE, align: "left", margin: 0 });
const next = [["1", "Demo guiada", "Recorrido del sistema con datos de ejemplo."], ["2", "Piloto acotado", "Prueba en campo en uno o dos sitios para validar el valor."], ["3", "Implementación", "Plan a la medida de la empresa."]];
next.forEach((nx, i) => {
  const x = 0.7 + i * 4.05;
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 2.0, w: 3.8, h: 2.9, rectRadius: 0.06, fill: { color: SLATE }, line: { color: "2A4653", width: 1 } });
  s.addShape(p.shapes.OVAL, { x: x + 0.35, y: 2.35, w: 0.8, h: 0.8, fill: { color: ORANGE } });
  s.addText(nx[0], { isTextBox: true, x: x + 0.35, y: 2.35, w: 0.8, h: 0.8, fontFace: HEAD, fontSize: 26, bold: true, color: NAVY, align: "center", valign: "middle", margin: 0 });
  s.addText(nx[1], { isTextBox: true, x: x + 0.35, y: 3.35, w: 3.1, h: 0.5, fontFace: HEAD, fontSize: 18, bold: true, color: WHITE, align: "left", margin: 0 });
  s.addText(nx[2], { isTextBox: true, x: x + 0.37, y: 3.9, w: 3.15, h: 0.9, fontFace: BODY, fontSize: 13, color: "CADCFC", align: "left", valign: "top", margin: 0 });
});
s.addText([{ text: "Contacto:  ", options: { bold: true, color: WHITE, fontSize: 15 } }, { text: "[ nombre / correo / teléfono comercial ]", options: { color: "9DB0C4", fontSize: 15, italic: true } }], { isTextBox: true, x: 0.7, y: 5.4, w: 12, h: 0.5, fontFace: BODY, align: "left", margin: 0 });

p.writeFile({ fileName: OUT }).then((f) => console.log("OK:", f));
