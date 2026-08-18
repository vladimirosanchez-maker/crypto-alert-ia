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
  const setups = [];
  let setupPendiente = null;
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

    const tendenciaAlcista = vela.close > e200 && e10 > e55 && e55 > e200;
    const tendenciaBajista = vela.close < e200 && e10 < e55 && e55 < e200;
    const tolerancia = atr[indice] * 0.35;
    const soporteCercano = nivelEstructuralCercano(velas, indice, anterior.close, atr[indice], [e10, e55, e200], "soporte", estructura * 4);
    const resistenciaCercana = nivelEstructuralCercano(velas, indice, anterior.close, atr[indice], [e10, e55, e200], "resistencia", estructura * 4);
    const tocaZonaLong = soporteCercano && vela.low <= soporteCercano.precio + tolerancia && vela.close >= soporteCercano.precio - atr[indice] * 0.1;
    const tocaZonaShort = resistenciaCercana && vela.high >= resistenciaCercana.precio - tolerancia && vela.close <= resistenciaCercana.precio + atr[indice] * 0.1;
    const amplitudRango = Math.max(rango.maximo - rango.minimo, atr[indice]);
    const posicionRango = (vela.close - rango.minimo) / amplitudRango;
    const precioLongFavorable = posicionRango <= 0.65 && vela.close < rango.maximo - atr[indice] * 0.15;
    const precioShortFavorable = posicionRango >= 0.35 && vela.close > rango.minimo + atr[indice] * 0.15;
    const setupLong = tendenciaAlcista && tocaZonaLong && precioLongFavorable;
    const setupShort = tendenciaBajista && tocaZonaShort && precioShortFavorable;
    if (setupPendiente && (indice > setupPendiente.expira || (setupPendiente.tipo === "LONG" ? !tendenciaAlcista : !tendenciaBajista))) setupPendiente = null;

    if (setupPendiente && indice > setupPendiente.indice) {
      const esLong = setupPendiente.tipo === "LONG";
      const velaRechazo = esLong ? vela.close > vela.open && vela.close > setupPendiente.maximo : vela.close < vela.open && vela.close < setupPendiente.minimo;
      const rsiConfirma = esLong ? valorRSI >= 42 && valorRSI <= 65 && valorRSI > rsiAnterior : valorRSI <= 58 && valorRSI >= 35 && valorRSI < rsiAnterior;
      const sqzConfirma = esLong ? momentum > momentumAnterior : momentum < momentumAnterior;
      const dmiConfirma = esLong ? plus > minus && adx >= 18 : minus > plus && adx >= 18;
      const checks = [
        [esLong ? tendenciaAlcista : tendenciaBajista, `tendencia ${esLong ? "alcista" : "bajista"} conservada`],
        [velaRechazo, `cierre confirma rechazo ${esLong ? "alcista" : "bajista"}`],
        [rsiConfirma, `RSI ${valorRSI.toFixed(1)} confirma giro`],
        [sqzConfirma, `SQZ confirma giro ${esLong ? "al alza" : "a la baja"}`],
        [dmiConfirma, `DMI alineado con ADX ${adx.toFixed(1)}`],
        [volumenRelativo >= 0.85, `volumen ${volumenRelativo.toFixed(2)}×`]
      ];
      const confirma = checks.filter(([cumple]) => cumple).length >= 5 && checks[0][0] && checks[1][0];
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
      setupPendiente = { tipo, indice, tiempo: vela.time, precio: nivel.precio, nivelOrigen: nivel.origen, reacciones: nivel.reacciones, extremo: tipo === "LONG" ? vela.low : vela.high, minimo: vela.low, maximo: vela.high, expira: indice + 4, atr: atr[indice] };
    }
  }

  const indice = ultimoCerrado;
  const ultima = velas[indice];
  const rango = rangoPrevio(velas, indice, estructura);
  const atrActual = atr[indice];
  const e10 = ema10Map.get(ultima.time);
  const e55 = ema55Map.get(ultima.time);
  const e200 = ema200Map.get(ultima.time);
  const tendenciaAlcista = ultima.close > e200 && e10 > e55 && e55 > e200;
  const tendenciaBajista = ultima.close < e200 && e10 < e55 && e55 < e200;
  const soporteActual = nivelEstructuralCercano(velas, indice, ultima.close, atrActual, [e10, e55, e200], "soporte", estructura * 4) || { precio: rango.minimo, origen: "mínimo reciente", reacciones: 1 };
  const resistenciaActual = nivelEstructuralCercano(velas, indice, ultima.close, atrActual, [e10, e55, e200], "resistencia", estructura * 4) || { precio: rango.maximo, origen: "máximo reciente", reacciones: 1 };
  const zonaLong = Number.isFinite(atrActual) ? { central: soporteActual.precio, desde: soporteActual.precio - atrActual * 0.25, hasta: soporteActual.precio + atrActual * 0.25, origen: soporteActual.origen, reacciones: soporteActual.reacciones } : null;
  const zonaShort = Number.isFinite(atrActual) ? { central: resistenciaActual.precio, desde: resistenciaActual.precio - atrActual * 0.25, hasta: resistenciaActual.precio + atrActual * 0.25, origen: resistenciaActual.origen, reacciones: resistenciaActual.reacciones } : null;
  const valorRSI = rsiMap.get(ultima.time);
  const rsiAnterior = rsiMap.get(velas[indice - 1].time);
  const momentum = momentumMap.get(ultima.time);
  const momentumAnterior = momentumMap.get(velas[indice - 1].time);
  const volumenMedio = promedioVolumen(velas, indice);
  const proyeccion = proyectarExtremos(velas, indice, temporalidad, { e10, e55, e200, valorRSI, rsiAnterior, momentum, momentumAnterior, adx: dmi.adx[indice], plus: dmi.plusDI[indice], minus: dmi.minusDI[indice], atr: atrActual, volumenRelativo: ultima.volume / volumenMedio });
  const ultimaSenal = senales.at(-1);
  const vigente = ultimaSenal && indice - ultimaSenal.indice <= 2 ? ultimaSenal : null;
  const estadoMercado = tendenciaAlcista ? "LONG" : tendenciaBajista ? "SHORT" : "NO_OPERAR";
  const activacion = { long: Math.max(e10, e55, e200), short: Math.min(e10, e55, e200) };
  if (setupPendiente) setups.push(setupPendiente);
  return { habilitado: true, senales, setups, vigente, proyeccion, oportunidad: { estado: estadoMercado, activacion, setupPendiente }, zonas: { long: zonaLong, short: zonaShort, cierre: ultima.close, marco: temporalidad } };
}

function crearMarcadoresOperativos(resultado) {
  const setups = (resultado.setups || []).map((setup) => ({ time: setup.tiempo, position: setup.tipo === "LONG" ? "belowBar" : "aboveBar", color: setup.tipo === "LONG" ? "#55d6aa" : "#f1847e", shape: "circle", text: "" }));
  const confirmaciones = resultado.senales.map((senal) => ({ time: senal.tiempo, position: senal.tipo === "LONG" ? "belowBar" : "aboveBar", color: senal.tipo === "LONG" ? "#18c98b" : "#ef5350", shape: senal.tipo === "LONG" ? "arrowUp" : "arrowDown", text: senal.tipo }));
  return [...setups, ...confirmaciones].sort((a, b) => a.time - b.time);
}
