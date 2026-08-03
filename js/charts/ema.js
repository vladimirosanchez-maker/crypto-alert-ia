function calcularEMA(velas, periodo){

    const resultado = [];

    const multiplicador = 2 / (periodo + 1);

    let emaAnterior = Number(velas[0].close);

    resultado.push({

        time: velas[0].time,

        value: emaAnterior

    });

    for(let i = 1; i < velas.length; i++){

        const cierre = Number(velas[i].close);

        const ema = (cierre - emaAnterior) * multiplicador + emaAnterior;

        resultado.push({

            time: velas[i].time,

            value: ema

        });

        emaAnterior = ema;

    }

    return{

    serie:resultado,

    ultimo:resultado[resultado.length-1].value

};

}