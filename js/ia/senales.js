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

function construirOperacion(tipo, vela, atr, soporte, resistencia, objetivoCercano, objetivoExtendido, razones, tiempo, indice) {
  const esLong = tipo === "LONG";
  const entradaDesde = esLong ? soporte : vela.close;
  const entradaHasta = esLong ? vela.close : resistencia;
  const invalidacionEstructural = esLong ? soporte - atr * 0.2 : resistencia + atr * 0.2;
  const invalidacionATR = esLong ? vela.close - atr * 1.4 : vela.close + atr * 1.4;
  const stop = esLong ? Math.min(invalidacionEstructural, invalidacionATR) : Math.max(invalidacionEstructural, invalidacionATR);
  const riesgo = Math.max(Math.abs(vela.close - stop), atr * 0.5);
  const tp1RR = esLong ? vela.close + riesgo * 1.5 : vela.close - riesgo * 1.5;
  const tp2RR = esLong ? vela.close + riesgo * 2.5 : vela.close - riesgo * 2.5;
  const tp1 = esLong ? Math.max(tp1RR, objetivoCercano) : Math.min(tp1RR, objetivoCercano);
  const tp2 = esLong ? Math.max(tp2RR, objetivoExtendido, tp1) : Math.min(tp2RR, objetivoExtendido, tp1);
  return {
    tipo, tiempo, indice, precio: vela.close,
    entradaDesde: Math.min(entradaDesde, entradaHasta),
    entradaHasta: Math.max(entradaDesde, entradaHasta),
    stop,
    tp1, tp2,
    rr1: Math.abs(tp1 - vela.close) / riesgo,
    rr2: Math.abs(tp2 - vela.close) / riesgo,
    razones
  };
}

function ventanaMesesTemporalidad(temporalidad) {
  return { "15m": 30, "1h": 60, "4h": 120, "1d": 365, "1w": 730 }[temporalidad];
}

function extremosVentana(velas, indice, temporalidad) {
  const desde = velas[indice].time - ventanaMesesTemporalidad(temporalidad) * 86400;
  const bloque = velas.slice(0, indice).filter((vela) => vela.time >= desde);
  return {
    maximo: Math.max(...bloque.map((vela) => vela.high)),
    minimo: Math.min(...bloque.map((vela) => vela.low)),
    velas: bloque.length
  };
}

function clasificarFactibilidad(puntos, distanciaATR) {
  const ajusteDistancia = distanciaATR <= 3 ? 2 : distanciaATR <= 6 ? 1 : distanciaATR > 12 ? -2 : 0;
  const total = puntos + ajusteDistancia;
  if (total >= 7) return { nivel: "Alta", clase: "alta" };
  if (total >= 4) return { nivel: "Media", clase: "media" };
  return { nivel: "Baja", clase: "baja" };
}

function proyectarExtremos(velas, indice, temporalidad, datos) {
  const { e10, e55, e200, valorRSI, rsiAnterior, momentum, momentumAnterior, adx, plus, minus, atr, volumenRelativo } = datos;
  const vela = velas[indice];
  const cercano = rangoPrevio(velas, indice, { "15m": 48, "1h": 48, "4h": 42, "1d": 30, "1w": 20 }[temporalidad]);
  const extendido = extremosVentana(velas, indice, temporalidad);
  const tendenciaAlcista = vela.close > e200 && e10 > e55 && e55 > e200;
  const tendenciaBajista = vela.close < e200 && e10 < e55 && e55 < e200;
  const puntosSubida = [tendenciaAlcista, valorRSI > 50, valorRSI >= rsiAnterior, momentum > momentumAnterior, plus > minus, adx >= 20, volumenRelativo >= 1].filter(Boolean).length;
  const puntosCaida = [tendenciaBajista, valorRSI < 50, valorRSI <= rsiAnterior, momentum < momentumAnterior, minus > plus, adx >= 20, volumenRelativo >= 1].filter(Boolean).length;
  const maximoCercano = cercano.maximo > vela.close ? cercano.maximo : NaN;
  const maximoExtendido = extendido.maximo > vela.close ? extendido.maximo : NaN;
  const minimoCercano = cercano.minimo < vela.close ? cercano.minimo : NaN;
  const minimoExtendido = extendido.minimo < vela.close ? extendido.minimo : NaN;
  const distanciaMaximo = Number.isFinite(maximoExtendido) ? (maximoExtendido - vela.close) / atr : Infinity;
  const distanciaMinimo = Number.isFinite(minimoExtendido) ? (vela.close - minimoExtendido) / atr : Infinity;
  const coberturaDias = extendido.velas > 1 ? (vela.time - velas.slice(0, indice).filter((dato) => dato.time >= vela.time - ventanaMesesTemporalidad(temporalidad) * 86400)[0].time) / 86400 : 0;
  return {
    subida: { cercano: maximoCercano, extendido: maximoExtendido, ...clasificarFactibilidad(puntosSubida, distanciaMaximo), distanciaATR: distanciaMaximo, alineada: tendenciaAlcista },
    caida: { cercano: minimoCercano, extendido: minimoExtendido, ...clasificarFactibilidad(puntosCaida, distanciaMinimo), distanciaATR: distanciaMinimo, alineada: tendenciaBajista },
    dias: ventanaMesesTemporalidad(temporalidad), coberturaDias, velas: extendido.velas
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
  const estructura = { "15m": 20, "1h": 20, "4h": 16, "1d": 14, "1w": 10 }[temporalidad];
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
    const rango = rangoPrevio(velas, indice, estructura);
    const extremos = extremosVentana(velas, indice, temporalidad);
    if (![e10, e55, e200, valorRSI, momentum, adx, plus, minus, atr[indice]].every(Number.isFinite)) continue;

    const velaAlcista = vela.close > vela.open && vela.close > anterior.close;
    const velaBajista = vela.close < vela.open && vela.close < anterior.close;
    const tendenciaAlcista = vela.close > e200 && e10 > e55 && e55 > e200;
    const tendenciaBajista = vela.close < e200 && e10 < e55 && e55 < e200;
    const tolerancia = atr[indice] * 0.35;
    const tocaZonaLong = vela.low <= e10 + tolerancia && vela.low >= Math.min(rango.minimo, e55) - tolerancia;
    const tocaZonaShort = vela.high >= e10 - tolerancia && vela.high <= Math.max(rango.maximo, e55) + tolerancia;
    const amplitudRango = Math.max(rango.maximo - rango.minimo, atr[indice]);
    const posicionRango = (vela.close - rango.minimo) / amplitudRango;
    const precioLongFavorable = posicionRango <= 0.65 && vela.close < rango.maximo - atr[indice] * 0.15;
    const precioShortFavorable = posicionRango >= 0.35 && vela.close > rango.minimo + atr[indice] * 0.15;
    const sqzGiraAlcista = momentum > momentumAnterior;
    const sqzGiraBajista = momentum < momentumAnterior;

    const longChecks = [
      [tendenciaAlcista, "tendencia alcista EMA10 > EMA55 > EMA200"],
      [tocaZonaLong, "retroceso hacia EMA/soporte, no compra en máximos"],
      [precioLongFavorable, "precio en zona baja/media del rango reciente"],
      [velaAlcista, "vela de rechazo alcista confirmada al cierre"],
      [valorRSI >= 38 && valorRSI <= 60 && valorRSI > rsiAnterior, `RSI ${valorRSI.toFixed(1)} recuperándose`],
      [sqzGiraAlcista, "SQZ gira al alza o pierde impulso bajista"],
      [plus > minus && adx >= 18, `DMI alcista con ADX ${adx.toFixed(1)}`],
      [volumenRelativo >= 0.85, `volumen ${volumenRelativo.toFixed(2)}×`]
    ];
    const shortChecks = [
      [tendenciaBajista, "tendencia bajista EMA10 < EMA55 < EMA200"],
      [tocaZonaShort, "rebote hacia EMA/resistencia, no venta en mínimos"],
      [precioShortFavorable, "precio en zona media/alta del rango reciente"],
      [velaBajista, "vela de rechazo bajista confirmada al cierre"],
      [valorRSI <= 62 && valorRSI >= 40 && valorRSI < rsiAnterior, `RSI ${valorRSI.toFixed(1)} girando a la baja`],
      [sqzGiraBajista, "SQZ gira a la baja o pierde impulso alcista"],
      [minus > plus && adx >= 18, `DMI bajista con ADX ${adx.toFixed(1)}`],
      [volumenRelativo >= 0.85, `volumen ${volumenRelativo.toFixed(2)}×`]
    ];
    const longPuntos = longChecks.filter(([cumple]) => cumple).length;
    const shortPuntos = shortChecks.filter(([cumple]) => cumple).length;
    const longValido = longPuntos >= 7 && longChecks[0][0] && longChecks[1][0] && longChecks[2][0] && longChecks[3][0];
    const shortValido = shortPuntos >= 7 && shortChecks[0][0] && shortChecks[1][0] && shortChecks[2][0] && shortChecks[3][0];
    const direccion = longValido ? "LONG" : shortValido ? "SHORT" : null;
    if (!direccion) { ultimaDireccion = null; continue; }
    if (direccion === ultimaDireccion || indice - ultimoIndice < enfriamiento) continue;
    const checks = direccion === "LONG" ? longChecks : shortChecks;
    const soporteOperacion = Math.max(rango.minimo, Math.min(e10, e55) - atr[indice] * 0.35);
    const resistenciaOperacion = Math.min(rango.maximo, Math.max(e10, e55) + atr[indice] * 0.35);
    const objetivoCercano = direccion === "LONG" ? rango.maximo : rango.minimo;
    const objetivoExtendido = direccion === "LONG" ? extremos.maximo : extremos.minimo;
    senales.push(construirOperacion(direccion, vela, atr[indice], soporteOperacion, resistenciaOperacion, objetivoCercano, objetivoExtendido, checks.filter(([cumple]) => cumple).map(([, razon]) => razon), vela.time, indice));
    ultimaDireccion = direccion;
    ultimoIndice = indice;
  }

  const indice = ultimoCerrado;
  const ultima = velas[indice];
  const rango = rangoPrevio(velas, indice, estructura);
  const atrActual = atr[indice];
  const e10 = ema10Map.get(ultima.time);
  const e55 = ema55Map.get(ultima.time);
  const e200 = ema200Map.get(ultima.time);
  const zonaLong = Number.isFinite(atrActual) ? { desde: Math.min(e10, e55, rango.minimo + atrActual), hasta: Math.max(e10, e55) + atrActual * 0.15 } : null;
  const zonaShort = Number.isFinite(atrActual) ? { desde: Math.min(e10, e55) - atrActual * 0.15, hasta: Math.max(e10, e55, rango.maximo - atrActual) } : null;
  const valorRSI = rsiMap.get(ultima.time);
  const rsiAnterior = rsiMap.get(velas[indice - 1].time);
  const momentum = momentumMap.get(ultima.time);
  const momentumAnterior = momentumMap.get(velas[indice - 1].time);
  const volumenMedio = promedioVolumen(velas, indice);
  const proyeccion = proyectarExtremos(velas, indice, temporalidad, { e10, e55, e200, valorRSI, rsiAnterior, momentum, momentumAnterior, adx: dmi.adx[indice], plus: dmi.plusDI[indice], minus: dmi.minusDI[indice], atr: atrActual, volumenRelativo: ultima.volume / volumenMedio });
  const ultimaSenal = senales.at(-1);
  const vigente = ultimaSenal && indice - ultimaSenal.indice <= 2 ? ultimaSenal : null;
  return { habilitado: true, senales, vigente, proyeccion, zonas: { long: zonaLong, short: zonaShort, cierre: ultima.close, marco: temporalidad } };
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
