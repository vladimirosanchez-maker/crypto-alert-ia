function calcularEMA(velas, periodo) {
  if (!velas.length) return { serie: [], ultimo: null };
  const multiplicador = 2 / (periodo + 1);
  let anterior = velas[0].close;
  const serie = [{ time: velas[0].time, value: anterior }];
  for (let indice = 1; indice < velas.length; indice += 1) {
    anterior = (velas[indice].close - anterior) * multiplicador + anterior;
    serie.push({ time: velas[indice].time, value: anterior });
  }
  return { serie, ultimo: anterior };
}
