function obtenerEstadoEMA(ema10, ema55, ema200) {
  let score = 0;
  if (ema10 > ema55) score += 30;
  if (ema55 > ema200) score += 30;
  if (ema10 > ema200) score += 40;
  if (score >= 90) return { estado: "Muy alcista", color: "#26a69a", score };
  if (score >= 60) return { estado: "Alcista", color: "#71c7a7", score };
  if (score >= 40) return { estado: "Lateral", color: "#d7a93e", score };
  if (score >= 20) return { estado: "Bajista", color: "#f38b79", score };
  return { estado: "Muy bajista", color: "#ef5350", score };
}

function ultimoFinito(serie) {
  for (let indice = serie.length - 1; indice >= 0; indice -= 1) {
    if (Number.isFinite(serie[indice])) return serie[indice];
  }
  return NaN;
}

function calcularATR(velas, periodo = 14) {
  const rangos = calcularRangoVerdadero(velas);
  if (rangos.length < periodo) return NaN;
  let atr = rangos.slice(0, periodo).reduce((suma, valor) => suma + valor, 0) / periodo;
  for (let indice = periodo; indice < rangos.length; indice += 1) atr = ((atr * (periodo - 1)) + rangos[indice]) / periodo;
  return atr;
}

function obtenerContextoTemporal(velas, temporalidad) {
  const segundos = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 }[temporalidad] || 900;
  const velasDosMeses = Math.ceil((CONFIG.DIAS_CONTEXTO_ANALISIS * 86400) / segundos);
  const cantidadObjetivo = Math.max(CONFIG.VELAS_MINIMAS_ANALISIS, velasDosMeses);
  const datos = velas.slice(-cantidadObjetivo);
  const diasCubiertos = datos.length > 1 ? (datos.at(-1).time - datos[0].time) / 86400 : 0;
  return { datos, cantidadObjetivo, diasCubiertos, completo: datos.length >= cantidadObjetivo || diasCubiertos >= CONFIG.DIAS_CONTEXTO_ANALISIS - 1 };
}

function obtenerAnalisisTemporal(velas, indicadores) {
  const { ema10, ema55, ema200, rsi, sqz, ajustesSQZ, temporalidad = "15m" } = indicadores;
  const ultima = velas.at(-1);
  if (!ultima || ![ema10, ema55, ema200].every(Number.isFinite)) {
    return { estado: "Incertidumbre", color: "#d7a93e", score: 0, probabilidadAlcista: 50, probabilidadBajista: 50, confianza: "Baja", condicion: "Faltan datos para validar un escenario.", modelo: "Confluencia técnica pendiente.", nivelesTecnicos: "Objetivos alcista/bajista: --", resumen: "Aún no hay suficientes velas para completar este marco temporal." };
  }

  let sesgo = 0;
  let evidencia = 0;
  const razones = [];
  const agregar = (valor, texto) => { sesgo += valor; evidencia += Math.abs(valor); razones.push(texto); };
  const precioActual = ultima.close;
  const contexto = obtenerContextoTemporal(velas, temporalidad);
  const primeraContexto = contexto.datos[0];
  const rendimientoContexto = primeraContexto ? ((precioActual - primeraContexto.close) / primeraContexto.close) * 100 : 0;

  if (Math.abs(rendimientoContexto) >= 1) agregar(Math.sign(rendimientoContexto), `contexto de ${contexto.diasCubiertos.toFixed(0)} días ${rendimientoContexto >= 0 ? "sube" : "cae"} ${Math.abs(rendimientoContexto).toFixed(2)}%`);

  const emaAlcista = precioActual > ema10 && ema10 > ema55 && ema55 > ema200;
  const emaBajista = precioActual < ema10 && ema10 < ema55 && ema55 < ema200;
  if (emaAlcista) agregar(3, "EMA 10/55/200 alineadas al alza");
  else if (emaBajista) agregar(-3, "EMA 10/55/200 alineadas a la baja");
  else {
    const votosEMA = [precioActual > ema10, precioActual > ema55, precioActual > ema200].filter(Boolean).length;
    if (votosEMA >= 2) agregar(1, "precio sobre la mayoría de EMA, pero sin alineación completa");
    else if (votosEMA <= 1) agregar(-1, "precio bajo la mayoría de EMA, pero sin alineación completa");
  }

  const dmi = calcularDMI(velas, ajustesSQZ.diLength, ajustesSQZ.adxLength);
  const adx = ultimoFinito(dmi.adx);
  const plusDI = ultimoFinito(dmi.plusDI);
  const minusDI = ultimoFinito(dmi.minusDI);
  const adxAnterior = ultimoFinito(dmi.adx.slice(0, -1));
  const tendenciaFuerte = Number.isFinite(adx) && adx >= ajustesSQZ.keyLevel;
  if (tendenciaFuerte && plusDI > minusDI) agregar(adx >= adxAnterior ? 2 : 1, `DMI alcista (+DI ${plusDI.toFixed(1)} > -DI ${minusDI.toFixed(1)}) con ADX ${adx.toFixed(1)}`);
  else if (tendenciaFuerte && minusDI > plusDI) agregar(adx >= adxAnterior ? -2 : -1, `DMI bajista (-DI ${minusDI.toFixed(1)} > +DI ${plusDI.toFixed(1)}) con ADX ${adx.toFixed(1)}`);
  else if (Number.isFinite(adx)) razones.push(`ADX ${adx.toFixed(1)}: tendencia débil; reduce la fiabilidad direccional`);

  const valorRSI = rsi.at(-1)?.value;
  const rsiAnterior = rsi.at(-2)?.value;
  if (Number.isFinite(valorRSI)) {
    if (valorRSI > 70) agregar(valorRSI < rsiAnterior ? -1 : 0, `RSI ${valorRSI.toFixed(1)} en sobrecompra${valorRSI < rsiAnterior ? " y perdiendo impulso" : ""}`);
    else if (valorRSI < 30) agregar(valorRSI > rsiAnterior ? 1 : 0, `RSI ${valorRSI.toFixed(1)} en sobreventa${valorRSI > rsiAnterior ? " y recuperándose" : ""}`);
    else if (valorRSI >= 55) agregar(1, `RSI ${valorRSI.toFixed(1)} confirma momentum comprador`);
    else if (valorRSI <= 45) agregar(-1, `RSI ${valorRSI.toFixed(1)} confirma momentum vendedor`);
    else razones.push(`RSI ${valorRSI.toFixed(1)} neutral`);
  }

  const momentum = sqz.histograma.at(-1)?.value;
  const momentumAnterior = sqz.histograma.at(-2)?.value;
  if (Number.isFinite(momentum)) {
    const acelera = !Number.isFinite(momentumAnterior) || Math.abs(momentum) >= Math.abs(momentumAnterior);
    agregar(momentum > 0 ? (acelera ? 2 : 1) : (acelera ? -2 : -1), `SQZ+TTM ${momentum > 0 ? "positivo" : "negativo"} y ${acelera ? "acelerando" : "perdiendo impulso"}`);
  }

  const volumenBase = contexto.datos.slice(0, -1).map((vela) => vela.volume).filter(Number.isFinite);
  const volumenMedio = volumenBase.length ? volumenBase.reduce((suma, valor) => suma + valor, 0) / volumenBase.length : NaN;
  const volumenRelativo = ultima.volume / volumenMedio;
  const movimiento = ultima.close - ultima.open;
  if (Number.isFinite(volumenRelativo) && volumenRelativo >= 1.2 && movimiento !== 0) agregar(Math.sign(movimiento), `volumen ${volumenRelativo.toFixed(2)}× confirma la vela actual`);
  else if (Number.isFinite(volumenRelativo) && volumenRelativo < 0.8) razones.push(`volumen ${volumenRelativo.toFixed(2)}×: movimiento sin confirmación`);

  const maxEvidencia = 10;
  const sesgoNormalizado = Math.max(-1, Math.min(1, sesgo / maxEvidencia));
  const probabilidadAlcista = Math.round(50 + sesgoNormalizado * 35);
  const probabilidadBajista = 100 - probabilidadAlcista;
  const cobertura = Math.min(1, evidencia / 8);
  const confianza = cobertura >= 0.75 && tendenciaFuerte ? "Alta" : cobertura >= 0.45 ? "Media" : "Baja";
  const score = Math.round(Math.abs(sesgoNormalizado) * 100);

  const atr = calcularATR(velas, 14);
  const horizontes = { "1m": 12, "5m": 12, "15m": 8, "1h": 6, "4h": 4, "1d": 3, "1w": 2 };
  const horizonte = horizontes[temporalidad] || 6;
  const recorrido = Number.isFinite(atr) ? atr * Math.sqrt(horizonte) : precioActual * 0.01;
  const objetivoAlcista = precioActual + recorrido;
  const objetivoBajista = Math.max(0, precioActual - recorrido);
  const bloque = contexto.datos.slice(0, -1);
  const resistencia = Math.max(...bloque.map((vela) => vela.high));
  const soporte = Math.min(...bloque.map((vela) => vela.low));
  const precio = (valor) => Number(valor).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nivelesTecnicos = `Si sube: ${precio(objetivoAlcista)} · Si baja: ${precio(objetivoBajista)} · Rango del contexto: ${precio(soporte)}–${precio(resistencia)}`;
  const coberturaDatos = contexto.completo ? `${contexto.diasCubiertos.toFixed(0)} días` : `${contexto.diasCubiertos.toFixed(0)} días (cargando mínimo de ${CONFIG.DIAS_CONTEXTO_ANALISIS})`;
  const modelo = `Contexto ${coberturaDatos} · EMA10 ${precio(ema10)} · EMA55 ${precio(ema55)} · EMA200 ${precio(ema200)} · RSI ${Number.isFinite(valorRSI) ? valorRSI.toFixed(1) : "--"} · ADX ${Number.isFinite(adx) ? adx.toFixed(1) : "--"} · Vol. ${Number.isFinite(volumenRelativo) ? `${volumenRelativo.toFixed(2)}×` : "--"}`;
  const resumen = `${sesgo > 2 ? "Ventaja alcista" : sesgo < -2 ? "Ventaja bajista" : "Sin ventaja clara"} en ${temporalidad}: ${razones.slice(0, 4).join("; ")}.`;
  const condicion = `Proyección ATR para las próximas ${horizonte} velas, no precio garantizado. Confirmación alcista sobre ${precio(resistencia)}; confirmación bajista bajo ${precio(soporte)}.`;
  const base = { score, probabilidadAlcista, probabilidadBajista, confianza, condicion, modelo, nivelesTecnicos, resumen };
  if (sesgo > 2) return { ...base, estado: "Alcista", color: "#26a69a" };
  if (sesgo < -2) return { ...base, estado: "Bajista", color: "#ef5350" };
  return { ...base, estado: "Neutral", color: "#d7a93e" };
}
