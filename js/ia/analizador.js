function analizarEMA(

    ema10,

    ema55,

    ema200

){

    let puntos = 0;

    if(ema10 > ema55){

        puntos += 30;

    }

    if(ema55 > ema200){

        puntos += 30;

    }

    if(ema10 > ema200){

        puntos += 40;

    }

    return puntos;

}

function obtenerEstadoEMA(

    ema10,

    ema55,

    ema200

){

    const score = analizarEMA(

        ema10,

        ema55,

        ema200

    );

    if(score >= 90){

    return{

        estado:"🟢 Muy Alcista",

        color:"#00FF66",

        score

    };

}

if(score >= 80){

    return{

        estado:"🟢 Alcista",

        color:"#66FF66",

        score

    };

}

if(score >= 60){

    return{

        estado:"🟢 Lateral Alcista",

        color:"#99FF66",

        score

    };

}

if(score >= 50){

    return{

        estado:"🟡 Lateral",

        color:"#FFD700",

        score

    };

}

if(score >= 40){

    return{

        estado:"🟠 Lateral Bajista",

        color:"#FFAA00",

        score

    };

}

if(score >= 20){

    return{

        estado:"🔴 Bajista",

        color:"#FF5555",

        score

    };

}

return{

    estado:"🔴 Muy Bajista",

    color:"#FF0000",

    score

};

}

