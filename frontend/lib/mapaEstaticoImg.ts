// Genera una imagen estática (dataURL PNG) de un mapa centrado en un punto,
// componiendo tiles de OpenStreetMap sobre un canvas y dibujando un marcador.
// Sin llave y con CORS (los tiles de OSM envían Access-Control-Allow-Origin),
// para poder incrustar el mapa dentro del PDF (pdfmake) sin depender de LocationIQ.
export async function mapaOsmDataURL(
  lat: number, lng: number, zoom = 16, cols = 3, rows = 2,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const size = 256;
    const n = Math.pow(2, zoom);
    const fx = ((lng + 180) / 360) * n;
    const latRad = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    const startX = Math.floor(fx) - Math.floor(cols / 2);
    const startY = Math.floor(fy) - Math.floor(rows / 2);

    const canvas = document.createElement("canvas");
    canvas.width = cols * size; canvas.height = rows * size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#e8ecef"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cargas: Promise<void>[] = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const tx = (((startX + i) % n) + n) % n;
        const ty = startY + j;
        if (ty < 0 || ty >= n) continue;
        cargas.push(new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => { try { ctx.drawImage(img, i * size, j * size); } catch { /* */ } resolve(); };
          img.onerror = () => resolve();
          img.src = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
        }));
      }
    }
    await Promise.all(cargas);

    // Marcador en la posición fraccionaria exacta del punto.
    const mx = (fx - startX) * size;
    const my = (fy - startY) * size;
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, 2 * Math.PI);
    ctx.fillStyle = "#e11d48"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
