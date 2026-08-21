const MARCOS_OPERATIVOS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"]);
const SEGUNDOS_MARCO = Object.freeze({ "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "8h": 28800, "12h": 43200, "1d": 86400, "3d": 259200, "1w": 604800, "1M": 2592000 });

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

function nivelEstructuralCercano(velas, indice, precio, atr, emas, tipo, periodo = 80) {
  const esSoporte = tipo === "soporte";
  const desde = Math.max(2, indice - periodo);
  const candidatos = [];
  for (let posicion = desde; posicion <= indice - 3; posicion += 1) {
    const vela = velas[posicion];
    const vecinos = velas.slice(posicion - 2, posicion + 3);
    const esPivote = esSoporte ? vecinos.every((dato) => vela.low <= dato.low) : vecinos.every((dato) => vela.high >= dato.high);
    const nivel = esSoporte ? vela.low : vela.high;
    if (esPivote && (esSoporte ? nivel < precio : nivel > precio)) candidatos.push({ precio: nivel, origen: "pivote" });
  }
  emas.filter(Number.isFinite).filter((nivel) => esSoporte ? nivel < precio : nivel > precio).forEach((nivel) => candidatos.push({ precio: nivel, origen: "EMA" }));
  const tolerancia = atr * 0.25;
  const bloque = velas.slice(desde, indice);
  return candidatos.map((candidato) => {
    const reacciones = bloque.filter((vela) => esSoporte ? Math.abs(vela.low - candidato.precio) <= tolerancia : Math.abs(vela.high - candidato.precio) <= tolerancia).length;
    const distanciaATR = Math.abs(precio - candidato.precio) / atr;
    const puntuacion = distanciaATR - Math.min(reacciones, 5) * 0.2 - (candidato.origen === "EMA" ? 0.1 : 0);
    return { ...candidato, reacciones, distanciaATR, puntuacion };
  }).filter((candidato) => candidato.distanciaATR <= 8).sort((a, b) => a.puntuacion - b.puntuacion)[0] || null;
}

function precioSenal(valor) {
  return Number(valor).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function construirOperacion(tipo, vela, atr, setup, objetivoCercano, objetivoExtendido, razones, tiempo, indice) {
  const esLong = tipo === "LONG";
  const entradaCentral = setup.precio;
  const entradaDesde = entradaCentral - atr * 0.25;
  const entradaHasta = entradaCentral + atr * 0.25;
  const invalidacionEstructural = esLong ? setup.extremo - atr * 0.2 : setup.extremo + atr * 0.2;
  const invalidacionATR = esLong ? entradaCentral - atr * 1.25 : entradaCentral + atr * 1.25;
  const stop = esLong ? Math.min(invalidacionEstructural, invalidacionATR) : Math.max(invalidacionEstructural, invalidacionATR);
  const riesgo = Math.max(Math.abs(entradaCentral - stop), atr * 0.5);
  const tp1RR = esLong ? entradaCentral + riesgo * 1.5 : entradaCentral - riesgo * 1.5;
  const tp2RR = esLong ? entradaCentral + riesgo * 2.5 : entradaCentral - riesgo * 2.5;
  const tp1 = esLong ? Math.max(tp1RR, objetivoCercano) : Math.min(tp1RR, objetivoCercano);
  const tp2 = esLong ? Math.max(tp2RR, objetivoExtendido, tp1) : Math.min(tp2RR, objetivoExtendido, tp1);
  return {
    tipo, tiempo, indice, precio: entradaCentral, confirmacionPrecio: vela.close,
    setupTiempo: setup.tiempo,
    entradaDesde: Math.min(entradaDesde, entradaHasta),
    entradaHasta: Math.max(entradaDesde, entradaHasta),
    stop,
    tp1, tp2,
    rr1: Math.abs(tp1 - entradaCentral) / riesgo,
    rr2: Math.abs(tp2 - entradaCentral) / riesgo,
    razones
  };
}

function ventanaMesesTemporalidad(temporalidad) {
  return { "1m": 3, "3m": 7, "5m": 14, "15m": 30, "30m": 45, "1h": 60, "2h": 90, "4h": 120, "6h": 180, "8h": 240, "12h": 365, "1d": 730, "3d": 1460, "1w": 2555, "1M": 5000 }[temporalidad];
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
  const { e10, e55, e200, tieneEma200, valorRSI, rsiAnterior, momentum, momentumAnterior, adx, plus, minus, atr, volumenRelativo } = datos;
  const vela = velas[indice];
  const cercano = rangoPrevio(velas, indice, { "1m": 60, "3m": 50, "5m": 48, "15m": 48, "30m": 48, "1h": 48, "2h": 44, "4h": 42, "6h": 40, "8h": 36, "12h": 32, "1d": 30, "3d": 24, "1w": 20, "1M": 12 }[temporalidad]);
  const extendido = extremosVentana(velas, indice, temporalidad);
  const tendenciaAlcista = vela.close > e200 && e10 > e55 && (!tieneEma200 || e55 > e200);
  const tendenciaBajista = vela.close < e200 && e10 < e55 && (!tieneEma200 || e55 < e200);
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
  const minimoVelas = temporalidad === "1M" ? 60 : 233;
  if (!MARCOS_OPERATIVOS.has(temporalidad) || velas.length < minimoVelas) return { habilitado: false, senales: [], vigente: null, zonas: null };

  const segundos = SEGUNDOS_MARCO[temporalidad];
  const ultimoCerrado = velas.findLastIndex((vela) => (vela.time + segundos) * 1000 <= Date.now());
  if (ultimoCerrado < minimoVelas - 1) return { habilitado: true, senales: [], vigente: null, zonas: null };

  const ema10Map = seriePorTiempo(ema10.serie);
  const ema55Map = seriePorTiempo(ema55.serie);
  const ema200Map = seriePorTiempo(ema200.serie);
  const rsiMap = seriePorTiempo(rsi);
  const momentumMap = seriePorTiempo(sqz.histograma);
  const dmi = calcularDMI(velas, ajustesSQZ.diLength, ajustesSQZ.adxLength);
  const atr = calcularSerieATR(velas, 14);
  const estructura = { "1m": 30, "3m": 26, "5m": 24, "15m": 20, "30m": 20, "1h": 20, "2h": 18, "4h": 16, "6h": 16, "8h": 15, "12h": 14, "1d": 14, "3d": 12, "1w": 10, "1M": 8 }[temporalidad];
  const enfriamiento = { "1m": 20, "3m": 18, "5m": 16, "15m": 12, "30m": 11, "1h": 10, "2h": 9, "4h": 8, "6h": 8, "8h": 7, "12h": 7, "1d": 6, "3d": 5, "1w": 4, "1M": 3 }[temporalidad];
  const senales = [];
  const setups = [];
  let setupPendiente = null;
  let ultimoIndice = -Infinity;

  const inicioEvaluacion = temporalidad === "1M" ? 55 : 201;
  for (let indice = inicioEvaluacion; indice <= ultimoCerrado; indice += 1) {
    const vela = velas[indice];
    const anterior = velas[indice - 1];
    const e10 = ema10Map.get(vela.time);
    const e55 = ema55Map.get(vela.time);
    const e200Cruda = ema200Map.get(vela.time);
    const tieneEma200 = Number.isFinite(e200Cruda);
    const e200 = tieneEma200 ? e200Cruda : e55;
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

    const tendenciaAlcista = vela.close > e200 && e10 > e55 && (!tieneEma200 || e55 > e200);
    const tendenciaBajista = vela.close < e200 && e10 < e55 && (!tieneEma200 || e55 < e200);
    const mercadoLateral = !tendenciaAlcista && !tendenciaBajista && adx < 20;
    const tolerancia = atr[indice] * 0.35;
    const soporteCercano = nivelEstructuralCercano(velas, indice, anterior.close, atr[indice], [e10, e55, e200], "soporte", estructura * 4);
    const resistenciaCercana = nivelEstructuralCercano(velas, indice, anterior.close, atr[indice], [e10, e55, e200], "resistencia", estructura * 4);
    const tocaZonaLong = soporteCercano && vela.low <= soporteCercano.precio + tolerancia && vela.close >= soporteCercano.precio - atr[indice] * 0.1;
    const tocaZonaShort = resistenciaCercana && vela.high >= resistenciaCercana.precio - tolerancia && vela.close <= resistenciaCercana.precio + atr[indice] * 0.1;
    const amplitudRango = Math.max(rango.maximo - rango.minimo, atr[indice]);
    const posicionRango = (vela.close - rango.minimo) / amplitudRango;
    const precioLongFavorable = posicionRango <= 0.65 && vela.close < rango.maximo - atr[indice] * 0.15;
    const precioShortFavorable = posicionRango >= 0.35 && vela.close > rango.minimo + atr[indice] * 0.15;
    const setupLong = tocaZonaLong && precioLongFavorable && (tendenciaAlcista || (mercadoLateral && posicionRango <= 0.3));
    const setupShort = tocaZonaShort && precioShortFavorable && (tendenciaBajista || (mercadoLateral && posicionRango >= 0.7));
    const contextoPendienteVigente = setupPendiente?.modo === "RANGO"
      ? mercadoLateral
      : setupPendiente?.tipo === "LONG" ? tendenciaAlcista : tendenciaBajista;
    if (setupPendiente && (indice > setupPendiente.expira || !contextoPendienteVigente)) setupPendiente = null;

    if (setupPendiente && indice > setupPendiente.indice) {
      const esLong = setupPendiente.tipo === "LONG";
      const velaRechazo = esLong ? vela.close > vela.open && vela.close > setupPendiente.maximo : vela.close < vela.open && vela.close < setupPendiente.minimo;
      const rsiConfirma = esLong ? valorRSI >= 42 && valorRSI <= 65 && valorRSI > rsiAnterior : valorRSI <= 58 && valorRSI >= 35 && valorRSI < rsiAnterior;
      const sqzConfirma = esLong ? momentum > momentumAnterior : momentum < momentumAnterior;
      const dmiConfirma = esLong ? plus > minus && adx >= 18 : minus > plus && adx >= 18;
      const contextoConfirma = setupPendiente.modo === "RANGO" ? adx < 22 : esLong ? tendenciaAlcista : tendenciaBajista;
      const distanciaEntradaATR = Math.abs(vela.close - setupPendiente.precio) / atr[indice];
      const checks = [
        [contextoConfirma, setupPendiente.modo === "RANGO" ? `rango vigente con ADX ${adx.toFixed(1)}` : `tendencia ${esLong ? "alcista" : "bajista"} conservada`],
        [velaRechazo, `cierre confirma rechazo ${esLong ? "alcista" : "bajista"}`],
        [rsiConfirma, `RSI ${valorRSI.toFixed(1)} confirma giro`],
        [sqzConfirma, `SQZ confirma giro ${esLong ? "al alza" : "a la baja"}`],
        [setupPendiente.modo === "RANGO" ? adx < 22 : dmiConfirma, setupPendiente.modo === "RANGO" ? `ADX bajo valida operación de rango` : `DMI alineado con ADX ${adx.toFixed(1)}`],
        [distanciaEntradaATR <= 0.8, `cierre a ${distanciaEntradaATR.toFixed(2)} ATR de la zona`],
        [volumenRelativo >= 0.85, `volumen ${volumenRelativo.toFixed(2)}×`]
      ];
      const confirma = checks.filter(([cumple]) => cumple).length >= 6 && checks[0][0] && checks[1][0] && checks[5][0];
      if (confirma && indice - ultimoIndice >= enfriamiento) {
        const objetivoCercano = esLong ? rango.maximo : rango.minimo;
        const objetivoExtendido = esLong ? extremos.maximo : extremos.minimo;
        setups.push(setupPendiente);
        senales.push(construirOperacion(setupPendiente.tipo, vela, atr[indice], setupPendiente, objetivoCercano, objetivoExtendido, checks.filter(([cumple]) => cumple).map(([, razon]) => razon), vela.time, indice));
        ultimoIndice = indice;
        setupPendiente = null;
        continue;
      }
    }

    if (!setupPendiente && indice - ultimoIndice >= enfriamiento && (setupLong || setupShort)) {
      const tipo = setupLong ? "LONG" : "SHORT";
      const nivel = tipo === "LONG" ? soporteCercano : resistenciaCercana;
      setupPendiente = { tipo, modo: mercadoLateral ? "RANGO" : "TENDENCIA", indice, tiempo: vela.time, precio: nivel.precio, nivelOrigen: nivel.origen, reacciones: nivel.reacciones, extremo: tipo === "LONG" ? vela.low : vela.high, minimo: vela.low, maximo: vela.high, expira: indice + 4, atr: atr[indice] };
    }
  }

  const indice = ultimoCerrado;
  const ultima = velas[indice];
  const rango = rangoPrevio(velas, indice, estructura);
  const atrActual = atr[indice];
  const e10 = ema10Map.get(ultima.time);
  const e55 = ema55Map.get(ultima.time);
  const e200Cruda = ema200Map.get(ultima.time);
  const tieneEma200 = Number.isFinite(e200Cruda);
  const e200 = tieneEma200 ? e200Cruda : e55;
  const tendenciaAlcista = ultima.close > e200 && e10 > e55 && (!tieneEma200 || e55 > e200);
  const tendenciaBajista = ultima.close < e200 && e10 < e55 && (!tieneEma200 || e55 < e200);
  const adxActual = dmi.adx[indice];
  const mercadoLateral = !tendenciaAlcista && !tendenciaBajista && adxActual < 20;
  const soporteActual = nivelEstructuralCercano(velas, indice, ultima.close, atrActual, [e10, e55, e200], "soporte", estructura * 4) || { precio: rango.minimo, origen: "mínimo reciente", reacciones: 1 };
  const resistenciaActual = nivelEstructuralCercano(velas, indice, ultima.close, atrActual, [e10, e55, e200], "resistencia", estructura * 4) || { precio: rango.maximo, origen: "máximo reciente", reacciones: 1 };
  const zonaLong = Number.isFinite(atrActual) ? { central: soporteActual.precio, desde: soporteActual.precio - atrActual * 0.25, hasta: soporteActual.precio + atrActual * 0.25, origen: soporteActual.origen, reacciones: soporteActual.reacciones } : null;
  const zonaShort = Number.isFinite(atrActual) ? { central: resistenciaActual.precio, desde: resistenciaActual.precio - atrActual * 0.25, hasta: resistenciaActual.precio + atrActual * 0.25, origen: resistenciaActual.origen, reacciones: resistenciaActual.reacciones } : null;
  const valorRSI = rsiMap.get(ultima.time);
  const rsiAnterior = rsiMap.get(velas[indice - 1].time);
  const momentum = momentumMap.get(ultima.time);
  const momentumAnterior = momentumMap.get(velas[indice - 1].time);
  const volumenMedio = promedioVolumen(velas, indice);
  const proyeccion = proyectarExtremos(velas, indice, temporalidad, { e10, e55, e200, tieneEma200, valorRSI, rsiAnterior, momentum, momentumAnterior, adx: dmi.adx[indice], plus: dmi.plusDI[indice], minus: dmi.minusDI[indice], atr: atrActual, volumenRelativo: ultima.volume / volumenMedio });
  const ultimaSenal = senales.at(-1);
  const vigente = ultimaSenal && indice - ultimaSenal.indice <= 2 ? ultimaSenal : null;
  const estadoMercado = tendenciaAlcista ? "LONG" : tendenciaBajista ? "SHORT" : mercadoLateral ? "RANGO" : "NO_OPERAR";
  const activacion = { long: Math.max(e10, e55, e200), short: Math.min(e10, e55, e200) };
  const distanciaSoporteATR = (ultima.close - soporteActual.precio) / atrActual;
  const distanciaResistenciaATR = (resistenciaActual.precio - ultima.close) / atrActual;
  const vigilancia = {
    long: distanciaSoporteATR >= 0 && distanciaSoporteATR <= 0.8 && (tendenciaAlcista || mercadoLateral),
    short: distanciaResistenciaATR >= 0 && distanciaResistenciaATR <= 0.8 && (tendenciaBajista || mercadoLateral),
    distanciaSoporteATR, distanciaResistenciaATR
  };
  if (setupPendiente) setups.push(setupPendiente);
  return { habilitado: true, senales, setups, vigente, proyeccion, oportunidad: { estado: estadoMercado, activacion, setupPendiente, vigilancia, adx: adxActual }, zonas: { long: zonaLong, short: zonaShort, cierre: ultima.close, marco: temporalidad, atr: atrActual } };
}

function crearMarcadoresOperativos(resultado) {
  const setups = (resultado.setups || []).map((setup) => ({ time: setup.tiempo, position: setup.tipo === "LONG" ? "belowBar" : "aboveBar", color: setup.tipo === "LONG" ? "#55d6aa" : "#f1847e", shape: "circle", text: "" }));
  const confirmaciones = resultado.senales.map((senal) => ({ time: senal.tiempo, position: senal.tipo === "LONG" ? "belowBar" : "aboveBar", color: senal.tipo === "LONG" ? "#18c98b" : "#ef5350", shape: senal.tipo === "LONG" ? "arrowUp" : "arrowDown", text: senal.tipo }));
  return [...setups, ...confirmaciones].sort((a, b) => a.time - b.time);
}
