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

function obtenerAnalisisTemporal(velas, indicadores) {
  const { ema10, ema55, ema200, rsi, sqz, ajustesSQZ } = indicadores;
  const ultima = velas.at(-1);
  const anterior = velas.at(-2);
  if (!ultima || !anterior || !Number.isFinite(ema10) || !Number.isFinite(ema55) || !Number.isFinite(ema200)) {
    return { estado: "Incertidumbre", color: "#d7a93e", score: 50, probabilidadAlcista: 50, probabilidadBajista: 50, confianza: "Baja", condicion: "Escenario pendiente de suficientes datos para validarse.", fractal: "Estructura fractal: esperando pivotes confirmados.", nivelesFractales: "Máximo fractal: -- · Mínimo fractal: --", resumen: "Aún no hay suficientes velas para completar el análisis de esta temporalidad." };
  }

  let puntos = 0;
  const razones = [];
  const cierresRecientes = velas.slice(-6);
  const variacion = ((ultima.close - cierresRecientes[0].close) / cierresRecientes[0].close) * 100;
  const volumenes = velas.slice(-21, -1).map((vela) => vela.volume).filter(Number.isFinite);
  const volumenMedio = volumenes.length ? volumenes.reduce((suma, valor) => suma + valor, 0) / volumenes.length : NaN;
  const factorVolumen = ultima.volume / volumenMedio;
  const direccionVelas = Math.sign(variacion);
  const fractal = obtenerEstructuraFractal(velas);

  if (ema10 > ema55 && ema55 > ema200 && ultima.close > ema10) { puntos += 3; razones.push("precio y medias alineados al alza"); }
  else if (ema10 < ema55 && ema55 < ema200 && ultima.close < ema10) { puntos -= 3; razones.push("precio y medias alineados a la baja"); }
  else razones.push("medias sin alineación completa");

  if (fractal.direccion > 0) { puntos += 2; razones.push("estructura fractal alcista HH/HL"); }
  else if (fractal.direccion < 0) { puntos -= 2; razones.push("estructura fractal bajista LH/LL"); }
  else razones.push("estructura fractal mixta");

  if (Math.abs(variacion) >= 0.15) {
    puntos += direccionVelas;
    razones.push(`velas recientes ${direccionVelas > 0 ? "positivas" : "negativas"} (${Math.abs(variacion).toFixed(2)}%)`);
  }

  if (Number.isFinite(factorVolumen)) {
    if (factorVolumen >= 1.15 && direccionVelas !== 0) { puntos += direccionVelas; razones.push("volumen confirma el movimiento"); }
    else if (factorVolumen < 0.8) razones.push("volumen bajo, sin confirmación");
  }

  const ultimoSQZ = sqz.histograma.at(-1)?.value;
  const anteriorSQZ = sqz.histograma.at(-2)?.value;
  if (Number.isFinite(ultimoSQZ)) {
    if (ultimoSQZ > 0) { puntos += 1; razones.push("SQZ+TTM positivo"); }
    if (ultimoSQZ < 0) { puntos -= 1; razones.push("SQZ+TTM negativo"); }
    if (Number.isFinite(anteriorSQZ) && Math.sign(ultimoSQZ) !== Math.sign(anteriorSQZ)) razones.push("SQZ acaba de cambiar de lado");
  }

  const serieADX = calcularADXCrudo(velas, ajustesSQZ.diLength, ajustesSQZ.adxLength);
  const adx = serieADX.at(-1);
  const adxAnterior = serieADX.at(-2);
  const direccionEstructural = ema10 > ema55 && ema55 > ema200 ? 1 : ema10 < ema55 && ema55 < ema200 ? -1 : direccionVelas;
  if (Number.isFinite(adx)) {
    if (adx >= ajustesSQZ.keyLevel) {
      if (direccionEstructural > 0) puntos += 1;
      if (direccionEstructural < 0) puntos -= 1;
      const adxSube = !Number.isFinite(adxAnterior) || adx >= adxAnterior;
      if (direccionEstructural > 0) razones.push(`línea ADX ${adx.toFixed(1)} ${adxSube ? "ascendente: hay fuerza para continuar subiendo" : "alta pero cediendo: el alza pierde impulso"}`);
      else if (direccionEstructural < 0) razones.push(`línea ADX ${adx.toFixed(1)} ${adxSube ? "ascendente: hay fuerza para continuar cayendo" : "alta pero cediendo: la caída pierde impulso"}`);
      else razones.push(`línea ADX ${adx.toFixed(1)} confirma fuerza, pero sin dirección clara`);
    } else {
      razones.push(`línea ADX ${adx.toFixed(1)} sin fuerza suficiente para confirmar continuidad`);
    }
  }

  const valorRSI = rsi.at(-1)?.value;
  if (Number.isFinite(valorRSI)) {
    if (valorRSI >= 70) { puntos -= 1; razones.push(`RSI ${valorRSI.toFixed(1)} en sobrecompra`); }
    else if (valorRSI <= 30) { puntos += 1; razones.push(`RSI ${valorRSI.toFixed(1)} en sobreventa`); }
    else if (valorRSI > 55) { puntos += 1; razones.push(`RSI ${valorRSI.toFixed(1)} favorable`); }
    else if (valorRSI < 45) { puntos -= 1; razones.push(`RSI ${valorRSI.toFixed(1)} débil`); }
    else razones.push(`RSI ${valorRSI.toFixed(1)} neutral`);
  }

  const factoresResumen = [...razones.filter((razon) => razon.startsWith("línea ADX")), ...razones.filter((razon) => razon.startsWith("estructura fractal")), ...razones.filter((razon) => !razon.startsWith("línea ADX") && !razon.startsWith("estructura fractal"))].slice(0, 4).join(", ");
  const fuerza = Math.min(100, 50 + Math.abs(puntos) * 9 + (Number.isFinite(adx) && adx >= ajustesSQZ.keyLevel ? 8 : 0));
  const impulsoADX = Number.isFinite(adx) && adx >= ajustesSQZ.keyLevel ? (!Number.isFinite(adxAnterior) || adx >= adxAnterior ? 4 : 1) : 0;
  const probabilidadAlcista = Math.max(15, Math.min(85, Math.round(50 + puntos * 5 + (direccionEstructural > 0 ? impulsoADX : 0) - (direccionEstructural < 0 ? impulsoADX : 0))));
  const probabilidadBajista = 100 - probabilidadAlcista;
  const confianza = fuerza >= 85 ? "Alta" : fuerza >= 67 ? "Media" : "Baja";
  const bloque = velas.slice(-10);
  const soporte = fractal.soporte ?? Math.min(...bloque.map((vela) => vela.low));
  const resistencia = fractal.resistencia ?? Math.max(...bloque.map((vela) => vela.high));
  const precio = (valor) => Number(valor).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nivelesFractales = `Máximo fractal: ${fractal.resistencia ? precio(fractal.resistencia) : "--"} · Mínimo fractal: ${fractal.soporte ? precio(fractal.soporte) : "--"}`;
  const base = { score: fuerza, probabilidadAlcista, probabilidadBajista, confianza, fractal: fractal.descripcion, nivelesFractales };

  if (puntos >= 4) return { ...base, estado: "Alcista", color: "#26a69a", condicion: `Escenario alcista válido mientras conserve ${precio(soporte)}; gana calidad con cierre sobre ${precio(resistencia)} y volumen creciente.`, resumen: `Sesgo alcista en esta temporalidad: ${factoresResumen}.` };
  if (puntos <= -4) return { ...base, estado: "Bajista", color: "#ef5350", condicion: `Escenario bajista válido mientras respete ${precio(resistencia)}; gana calidad con pérdida de ${precio(soporte)} y volumen creciente.`, resumen: `Sesgo bajista en esta temporalidad: ${factoresResumen}.` };
  return { ...base, estado: "Incertidumbre", color: "#d7a93e", condicion: `Sin ventaja direccional clara: un cierre sobre ${precio(resistencia)} favorecería subida; bajo ${precio(soporte)} favorecería caída.`, resumen: `Señales mixtas: ${factoresResumen}. Espera confirmación de precio y volumen.` };
}

function obtenerEstructuraFractal(velas, radio = 2) {
  const maximos = [];
  const minimos = [];
  for (let indice = radio; indice < velas.length - radio; indice += 1) {
    const actual = velas[indice];
    const vecinos = velas.slice(indice - radio, indice).concat(velas.slice(indice + 1, indice + radio + 1));
    if (vecinos.every((vela) => actual.high > vela.high)) maximos.push({ time: actual.time, valor: actual.high });
    if (vecinos.every((vela) => actual.low < vela.low)) minimos.push({ time: actual.time, valor: actual.low });
  }
  const [maximoAnterior, maximoActual] = maximos.slice(-2);
  const [minimoAnterior, minimoActual] = minimos.slice(-2);
  const soporte = minimoActual?.valor;
  const resistencia = maximoActual?.valor;
  if (!maximoAnterior || !maximoActual || !minimoAnterior || !minimoActual) {
    return { direccion: 0, soporte, resistencia, descripcion: "Estructura fractal: aún no hay dos máximos y dos mínimos confirmados." };
  }
  if (maximoActual.valor > maximoAnterior.valor && minimoActual.valor > minimoAnterior.valor) {
    return { direccion: 1, soporte, resistencia, descripcion: "Fractal alcista confirmado: máximo y mínimo recientes son crecientes (HH/HL). Mientras se mantenga el último mínimo fractal, la estructura favorece continuidad al alza." };
  }
  if (maximoActual.valor < maximoAnterior.valor && minimoActual.valor < minimoAnterior.valor) {
    return { direccion: -1, soporte, resistencia, descripcion: "Fractal bajista confirmado: máximo y mínimo recientes son decrecientes (LH/LL). Mientras se respete el último máximo fractal, la estructura favorece continuidad a la baja." };
  }
  return { direccion: 0, soporte, resistencia, descripcion: "Fractal mixto: máximos y mínimos no avanzan en la misma dirección; la estructura no confirma una tendencia." };
}
