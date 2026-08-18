const MARCOS_OPERATIVOS = new Set(["15m", "1h", "4h", "1d", "1w"]);

function seriePorTiempo(serie) {
  return new Map(serie.map((punto) => [Number(punto.time), Number(punto.value)]));
}

function calcularSerieATR(velas, periodo = 14) {
  const rangos = calcularRangoVerdadero(velas);
  const resultado = Array(velas.length).fill(NaN);
  if (rangos.length < periodo) return resultado;
  let atr = rangos.slice(0, periodo).reduce((suma, valor) => suma + valor, 0) / periodo;
  resultado[periodo - 1] = atr;
  for (let indice = periodo; indice < rangos.length; indice += 1) {
    atr = ((atr * (periodo - 1)) + rangos[indice]) / periodo;
    resultado[indice] = atr;
  }
  return resultado;
}

function promedioVolumen(velas, indice, periodo = 20) {
  const bloque = velas.slice(Math.max(0, indice - periodo), indice);
  return bloque.length ? bloque.reduce((suma, vela) => suma + vela.volume, 0) / bloque.length : NaN;
}

function rangoPrevio(velas, indice, periodo) {
  const bloque = velas.slice(Math.max(0, indice - periodo), indice);
  return {
    maximo: Math.max(...bloque.map((vela) => vela.high)),
    minimo: Math.min(...bloque.map((vela) => vela.low))
  };
}

function precioSenal(valor) {
  return Number(valor).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function construirOperacion(tipo, vela, atr, soporte, resistencia, razones, tiempo, indice) {
  const esLong = tipo === "LONG";
  const entradaDesde = esLong ? vela.close - atr * 0.2 : vela.close - atr * 0.15;
  const entradaHasta = esLong ? vela.close + atr * 0.15 : vela.close + atr * 0.2;
  const invalidacionEstructural = esLong ? soporte : resistencia;
  const invalidacionATR = esLong ? vela.close - atr * 1.5 : vela.close + atr * 1.5;
  const stop = esLong ? Math.max(invalidacionEstructural, invalidacionATR) : Math.min(invalidacionEstructural, invalidacionATR);
  const riesgo = Math.max(Math.abs(vela.close - stop), atr * 0.5);
  return {
    tipo, tiempo, indice, precio: vela.close,
    entradaDesde: Math.min(entradaDesde, entradaHasta),
    entradaHasta: Math.max(entradaDesde, entradaHasta),
    stop,
    tp1: esLong ? vela.close + riesgo * 1.5 : vela.close - riesgo * 1.5,
    tp2: esLong ? vela.close + riesgo * 2.5 : vela.close - riesgo * 2.5,
    rr1: 1.5, rr2: 2.5, razones
  };
}

function evaluarSenalesOperativas(velas, opciones) {
  const { temporalidad, ema10, ema55, ema200, rsi, sqz, ajustesSQZ } = opciones;
  if (!MARCOS_OPERATIVOS.has(temporalidad) || velas.length < 233) return { habilitado: false, senales: [], vigente: null, zonas: null };

  const segundos = { "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 }[temporalidad];
  const ultimoCerrado = velas.findLastIndex((vela) => (vela.time + segundos) * 1000 <= Date.now());
  if (ultimoCerrado < 232) return { habilitado: true, senales: [], vigente: null, zonas: null };

  const ema10Map = seriePorTiempo(ema10.serie);
  const ema55Map = seriePorTiempo(ema55.serie);
  const ema200Map = seriePorTiempo(ema200.serie);
  const rsiMap = seriePorTiempo(rsi);
  const momentumMap = seriePorTiempo(sqz.histograma);
  const dmi = calcularDMI(velas, ajustesSQZ.diLength, ajustesSQZ.adxLength);
  const atr = calcularSerieATR(velas, 14);
  const ruptura = { "15m": 12, "1h": 12, "4h": 10, "1d": 8, "1w": 6 }[temporalidad];
  const enfriamiento = { "15m": 12, "1h": 10, "4h": 8, "1d": 6, "1w": 4 }[temporalidad];
  const senales = [];
  let ultimaDireccion = null;
  let ultimoIndice = -Infinity;

  for (let indice = 201; indice <= ultimoCerrado; indice += 1) {
    const vela = velas[indice];
    const anterior = velas[indice - 1];
    const e10 = ema10Map.get(vela.time);
    const e55 = ema55Map.get(vela.time);
    const e200 = ema200Map.get(vela.time);
    const valorRSI = rsiMap.get(vela.time);
    const rsiAnterior = rsiMap.get(anterior.time);
    const momentum = momentumMap.get(vela.time);
    const momentumAnterior = momentumMap.get(anterior.time);
    const adx = dmi.adx[indice];
    const plus = dmi.plusDI[indice];
    const minus = dmi.minusDI[indice];
    const volumenMedio = promedioVolumen(velas, indice);
    const volumenRelativo = vela.volume / volumenMedio;
    const rango = rangoPrevio(velas, indice, ruptura);
    if (![e10, e55, e200, valorRSI, momentum, adx, plus, minus, atr[indice]].every(Number.isFinite)) continue;

    const longChecks = [
      [vela.close > e200 && e10 > e55, "precio sobre EMA200 y EMA10 sobre EMA55"],
      [e55 > e200, "estructura EMA55/EMA200 alcista"],
      [valorRSI >= 52 && valorRSI <= 70 && valorRSI > rsiAnterior, `RSI ${valorRSI.toFixed(1)} comprador sin sobreextensión`],
      [momentum > 0 && momentum >= momentumAnterior, "SQZ positivo y acelerando"],
      [adx >= ajustesSQZ.keyLevel && plus > minus, `DMI alcista con ADX ${adx.toFixed(1)}`],
      [vela.close > rango.maximo, "ruptura confirmada al cierre"],
      [volumenRelativo >= 1.05, `volumen ${volumenRelativo.toFixed(2)}×`]
    ];
    const shortChecks = [
      [vela.close < e200 && e10 < e55, "precio bajo EMA200 y EMA10 bajo EMA55"],
      [e55 < e200, "estructura EMA55/EMA200 bajista"],
      [valorRSI <= 48 && valorRSI >= 30 && valorRSI < rsiAnterior, `RSI ${valorRSI.toFixed(1)} vendedor sin sobreextensión`],
      [momentum < 0 && momentum <= momentumAnterior, "SQZ negativo y acelerando"],
      [adx >= ajustesSQZ.keyLevel && minus > plus, `DMI bajista con ADX ${adx.toFixed(1)}`],
      [vela.close < rango.minimo, "ruptura confirmada al cierre"],
      [volumenRelativo >= 1.05, `volumen ${volumenRelativo.toFixed(2)}×`]
    ];
    const longPuntos = longChecks.filter(([cumple]) => cumple).length;
    const shortPuntos = shortChecks.filter(([cumple]) => cumple).length;
    const longValido = longPuntos >= 6 && longChecks[0][0] && longChecks[4][0] && longChecks[5][0];
    const shortValido = shortPuntos >= 6 && shortChecks[0][0] && shortChecks[4][0] && shortChecks[5][0];
    const direccion = longValido ? "LONG" : shortValido ? "SHORT" : null;
    if (!direccion) { ultimaDireccion = null; continue; }
    if (direccion === ultimaDireccion || indice - ultimoIndice < enfriamiento) continue;
    const checks = direccion === "LONG" ? longChecks : shortChecks;
    senales.push(construirOperacion(direccion, vela, atr[indice], rango.minimo, rango.maximo, checks.filter(([cumple]) => cumple).map(([, razon]) => razon), vela.time, indice));
    ultimaDireccion = direccion;
    ultimoIndice = indice;
  }

  const indice = ultimoCerrado;
  const ultima = velas[indice];
  const rango = rangoPrevio(velas, indice, ruptura);
  const atrActual = atr[indice];
  const zonaLong = Number.isFinite(atrActual) ? { desde: rango.maximo, hasta: rango.maximo + atrActual * 0.25 } : null;
  const zonaShort = Number.isFinite(atrActual) ? { desde: rango.minimo - atrActual * 0.25, hasta: rango.minimo } : null;
  const ultimaSenal = senales.at(-1);
  const vigente = ultimaSenal && indice - ultimaSenal.indice <= 2 ? ultimaSenal : null;
  return { habilitado: true, senales, vigente, zonas: { long: zonaLong, short: zonaShort, cierre: ultima.close, marco: temporalidad } };
}

function crearMarcadoresOperativos(resultado) {
  return resultado.senales.map((senal) => ({
    time: senal.tiempo,
    position: senal.tipo === "LONG" ? "belowBar" : "aboveBar",
    color: senal.tipo === "LONG" ? "#18c98b" : "#ef5350",
    shape: senal.tipo === "LONG" ? "arrowUp" : "arrowDown",
    text: senal.tipo
  }));
}
