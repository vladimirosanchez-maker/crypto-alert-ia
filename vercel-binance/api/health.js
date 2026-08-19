export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ ok: false, error: "Método no permitido" });
  try {
    const binance = await fetch("https://fapi.binance.com/fapi/v1/time", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000)
    });
    const tipo = binance.headers.get("content-type") || "";
    if (!binance.ok || !tipo.toLowerCase().includes("application/json")) {
      return response.status(502).json({ ok: false, binanceStatus: binance.status, contentType: tipo.split(";")[0] || "desconocido" });
    }
    const datos = await binance.json();
    return response.status(200).json({ ok: true, binanceStatus: binance.status, serverTime: datos.serverTime });
  } catch (error) {
    return response.status(502).json({ ok: false, error: error.name === "TimeoutError" ? "Tiempo de espera agotado" : "Conexión fallida" });
  }
}
