const SIMBOLOS = new Set(["BTCUSDT", "ETHUSDT"]);

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const permitidos = String(env.ALLOWED_ORIGINS || "").split(",").map((valor) => valor.trim()).filter(Boolean);
  if (origin && !permitidos.includes(origin)) return null;
  return {
    "access-control-allow-origin": origin || permitidos[0] || "null",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

function bytesHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function firmarHmac(secret, contenido) {
  const encoder = new TextEncoder();
  const clave = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesHex(await crypto.subtle.sign("HMAC", clave, encoder.encode(contenido)));
}

function numero(valor, respaldo = 0) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : respaldo;
}

function porcentajePnl(pnl, margen) {
  return margen > 0 ? pnl / margen * 100 : 0;
}

async function solicitarBinance(env) {
  if (!env.BINANCE_API_KEY || !env.BINANCE_SECRET_KEY) throw new Error("Credenciales Binance no configuradas");
  const consulta = `recvWindow=5000&timestamp=${Date.now()}`;
  const firma = await firmarHmac(env.BINANCE_SECRET_KEY, consulta);
  const respuesta = await fetch(`https://fapi.binance.com/fapi/v2/positionRisk?${consulta}&signature=${firma}`, {
    headers: { "X-MBX-APIKEY": env.BINANCE_API_KEY }
  });
  const datos = await respuesta.json();
  if (!respuesta.ok || !Array.isArray(datos)) throw new Error(`Binance: ${datos?.msg || `HTTP ${respuesta.status}`}`);
  return datos.filter((posicion) => SIMBOLOS.has(posicion.symbol) && Math.abs(numero(posicion.positionAmt)) > 0).map((posicion) => {
    const cantidadFirmada = numero(posicion.positionAmt);
    const lado = !posicion.positionSide || posicion.positionSide === "BOTH"
      ? (cantidadFirmada >= 0 ? "LONG" : "SHORT")
      : posicion.positionSide;
    const margen = numero(posicion.isolatedMargin) || Math.abs(numero(posicion.notional)) / Math.max(1, numero(posicion.leverage, 1));
    const pnl = numero(posicion.unRealizedProfit);
    return {
      exchange: "BINANCE", symbol: posicion.symbol, side: lado,
      quantity: Math.abs(cantidadFirmada), entryPrice: numero(posicion.entryPrice), markPrice: numero(posicion.markPrice),
      pnl, pnlPercent: porcentajePnl(pnl, margen), leverage: numero(posicion.leverage), margin: margen,
      liquidationPrice: numero(posicion.liquidationPrice), marginType: posicion.marginType || "--", updatedAt: numero(posicion.updateTime, Date.now())
    };
  });
}

function consultaCanonica(parametros) {
  return Object.keys(parametros).sort().map((clave) => `${clave}=${parametros[clave]}`).join("&");
}

async function solicitarBingXFirmado(env, ruta, parametros = {}) {
  if (!env.BINGX_API_KEY || !env.BINGX_SECRET_KEY) throw new Error("Credenciales BingX no configuradas");
  const todos = { ...parametros, recvWindow: 5000, timestamp: Date.now() };
  const consulta = consultaCanonica(todos);
  const firma = await firmarHmac(env.BINGX_SECRET_KEY, consulta);
  let ultimoError;
  for (const base of ["https://open-api.bingx.com", "https://open-api.bingx.pro"]) {
    try {
      const respuesta = await fetch(`${base}${ruta}?${consulta}&signature=${firma}`, {
        headers: { "X-BX-APIKEY": env.BINGX_API_KEY, "X-SOURCE-KEY": "BX-AI-SKILL" }
      });
      const datos = await respuesta.json();
      if (!respuesta.ok || datos.code !== 0) throw new Error(`BingX: ${datos?.msg || `HTTP ${respuesta.status}`}`);
      return datos.data;
    } catch (error) { ultimoError = error; }
  }
  throw ultimoError;
}

async function consultarMarkPriceBingX(simbolo) {
  try {
    const respuesta = await fetch(`https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex?symbol=${encodeURIComponent(simbolo)}`, { headers: { "X-SOURCE-KEY": "BX-AI-SKILL" } });
    const datos = await respuesta.json();
    const resultado = Array.isArray(datos?.data) ? datos.data[0] : datos?.data;
    return numero(resultado?.markPrice);
  } catch { return 0; }
}

async function solicitarBingX(env) {
  const datos = await solicitarBingXFirmado(env, "/openApi/swap/v2/user/positions");
  const posiciones = (Array.isArray(datos) ? datos : []).filter((posicion) => SIMBOLOS.has(String(posicion.symbol).replace("-", "")) && Math.abs(numero(posicion.positionAmt)) > 0);
  return Promise.all(posiciones.map(async (posicion) => {
    const pnl = numero(posicion.unrealizedProfit);
    const margen = numero(posicion.initialMargin);
    const simbolo = String(posicion.symbol).replace("-", "");
    let markPrice = await consultarMarkPriceBingX(posicion.symbol);
    if (!markPrice && numero(posicion.positionAmt)) markPrice = numero(posicion.avgPrice) + (posicion.positionSide === "SHORT" ? -1 : 1) * pnl / Math.abs(numero(posicion.positionAmt));
    return {
      exchange: "BINGX", symbol: simbolo, side: posicion.positionSide,
      quantity: Math.abs(numero(posicion.positionAmt)), entryPrice: numero(posicion.avgPrice), markPrice,
      pnl, pnlPercent: porcentajePnl(pnl, margen), leverage: numero(posicion.leverage), margin: margen,
      liquidationPrice: numero(posicion.liquidationPrice), marginType: posicion.isolated ? "isolated" : "cross", updatedAt: Date.now()
    };
  }));
}

function tokenValido(request, env) {
  const recibido = request.headers.get("authorization") || "";
  const esperado = `Bearer ${env.DASHBOARD_TOKEN || ""}`;
  if (!env.DASHBOARD_TOKEN || recibido.length !== esperado.length) return false;
  let diferencia = 0;
  for (let indice = 0; indice < esperado.length; indice += 1) diferencia |= recibido.charCodeAt(indice) ^ esperado.charCodeAt(indice);
  return diferencia === 0;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (!cors) return json({ error: "Origen no permitido" }, 403, {});
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const ruta = new URL(request.url).pathname;
    if (ruta === "/health") return json({ ok: true }, 200, cors);
    if (ruta !== "/positions" || request.method !== "GET") return json({ error: "Ruta no encontrada" }, 404, cors);
    if (!tokenValido(request, env)) return json({ error: "Token de panel inválido" }, 401, cors);

    const resultados = await Promise.allSettled([solicitarBinance(env), solicitarBingX(env)]);
    const posiciones = resultados.flatMap((resultado) => resultado.status === "fulfilled" ? resultado.value : []);
    const errores = resultados.map((resultado, indice) => resultado.status === "rejected" ? { exchange: indice === 0 ? "BINANCE" : "BINGX", message: resultado.reason?.message || "Error desconocido" } : null).filter(Boolean);
    return json({ positions: posiciones, errors: errores, updatedAt: Date.now() }, errores.length === 2 ? 502 : 200, cors);
  }
};
