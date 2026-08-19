const SIMBOLOS = new Set(["BTCUSDT", "ETHUSDT"]);

function numero(valor, respaldo = 0) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : respaldo;
}

function tokenValido(request) {
  const recibido = String(request.headers.authorization || "");
  const esperado = `Bearer ${process.env.RELAY_TOKEN || ""}`;
  if (!process.env.RELAY_TOKEN || recibido.length !== esperado.length) return false;
  let diferencia = 0;
  for (let indice = 0; indice < esperado.length; indice += 1) {
    diferencia |= recibido.charCodeAt(indice) ^ esperado.charCodeAt(indice);
  }
  return diferencia === 0;
}

async function firmarHmac(secret, contenido) {
  const encoder = new TextEncoder();
  const clave = await globalThis.crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await globalThis.crypto.subtle.sign("HMAC", clave, encoder.encode(contenido));
  return [...new Uint8Array(firma)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") return response.status(405).json({ error: "Método no permitido" });
  let etapa = "autenticación interna";
  try {
    if (!tokenValido(request)) return response.status(401).json({ error: "Token interno inválido" });
    etapa = "configuración de credenciales";
    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_SECRET_KEY) {
      return response.status(503).json({ error: "Credenciales Binance no configuradas en Vercel" });
    }
    etapa = "firma de Binance";
    const consulta = `recvWindow=5000&timestamp=${Date.now()}`;
    const firma = await firmarHmac(process.env.BINANCE_SECRET_KEY, consulta);
    etapa = "solicitud a Binance";
    const binance = await fetch(`https://fapi.binance.com/fapi/v2/positionRisk?${consulta}&signature=${firma}`, {
      headers: { "X-MBX-APIKEY": process.env.BINANCE_API_KEY, accept: "application/json" },
      signal: AbortSignal.timeout(7000)
    });
    const tipo = binance.headers.get("content-type") || "";
    if (!tipo.toLowerCase().includes("application/json")) {
      return response.status(502).json({ error: `Binance respondió HTTP ${binance.status} sin JSON` });
    }
    const datos = await binance.json();
    if (!binance.ok || !Array.isArray(datos)) {
      return response.status(502).json({ error: `Binance: ${datos?.msg || `HTTP ${binance.status}`}` });
    }

    const positions = datos.filter((posicion) => SIMBOLOS.has(posicion.symbol) && Math.abs(numero(posicion.positionAmt)) > 0).map((posicion) => {
      const cantidadFirmada = numero(posicion.positionAmt);
      const side = !posicion.positionSide || posicion.positionSide === "BOTH"
        ? (cantidadFirmada >= 0 ? "LONG" : "SHORT")
        : posicion.positionSide;
      const leverage = Math.max(1, numero(posicion.leverage, 1));
      const margin = numero(posicion.isolatedMargin) || Math.abs(numero(posicion.notional)) / leverage;
      const pnl = numero(posicion.unRealizedProfit);
      return {
        exchange: "BINANCE", symbol: posicion.symbol, side,
        quantity: Math.abs(cantidadFirmada), entryPrice: numero(posicion.entryPrice), markPrice: numero(posicion.markPrice),
        pnl, pnlPercent: margin > 0 ? pnl / margin * 100 : 0, leverage, margin,
        liquidationPrice: numero(posicion.liquidationPrice), marginType: posicion.marginType || "--",
        updatedAt: numero(posicion.updateTime, Date.now())
      };
    });
    return response.status(200).json({ positions, updatedAt: Date.now() });
  } catch (error) {
    const detalle = error.name === "TimeoutError" ? "tiempo de espera agotado" : error.name || "error desconocido";
    return response.status(502).json({ error: `Conector falló en ${etapa}: ${detalle}` });
  }
}
