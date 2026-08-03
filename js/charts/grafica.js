let periodoActual = localStorage.getItem("periodoActual");

let estadoGrafica = null;

let primeraCarga = true;

if(!periodoActual){

    periodoActual = "15m";

}
const contenedorGrafica = document.getElementById("graficaBTC");

const grafica = LightweightCharts.createChart(contenedorGrafica, {

    width: contenedorGrafica.clientWidth,

    height: 500,

    layout: {

        background: {

            color:"#111827"

        },

        textColor:"#FFFFFF",
        fontSize:16

    },

    grid:{

        vertLines:{

            color:"#1F2937"

        },

        horzLines:{

            color:"#1F2937"

        }

    },
    handleScale:{

    mouseWheel:true,

    pinch:true,

    axisPressedMouseMove:true,

    axisDoubleClickReset:true

},


});


const velas = grafica.addCandlestickSeries();

const lblFecha = document.getElementById("infoFecha");
const lblHora = document.getElementById("infoHora");
const lblContador = document.getElementById("contadorVela");
const lblOpen = document.getElementById("infoOpen");
const lblHigh = document.getElementById("infoHigh");
const lblLow = document.getElementById("infoLow");
const lblClose = document.getElementById("infoClose");

const ema10 = grafica.addLineSeries({

    color: "#2196F3",

    lineWidth: 2,

    title: "EMA 10"

});
const ema55 = grafica.addLineSeries({

    color:"#FFD700",

    lineWidth:2,

    title:"EMA 55"

});

const ema200 = grafica.addLineSeries({

    color:"#FFFFFF",

    lineWidth:2,

    title:"EMA 200"

});

const{

    graficaVolumen,

    volumen

}=crearGraficaVolumen();

const graficaADX = crearGraficaADX();

window.addEventListener("resize",()=>{

    grafica.applyOptions({

        width:contenedorGrafica.clientWidth

    });

});

const botonesPeriodo = document.querySelectorAll(".btnPeriodo");

botonesPeriodo.forEach(boton=>{

    if(boton.dataset.periodo===periodoActual){

        boton.classList.add("activo");

    }

});

botonesPeriodo.forEach(boton => {

    boton.addEventListener("click", () => {

        periodoActual = boton.dataset.periodo;
        localStorage.setItem(
    "periodoActual",
    periodoActual
);

        botonesPeriodo.forEach(b => {

            b.classList.remove("activo");

        });

        boton.classList.add("activo");

        cargarVelas();

    });

});

async function cargarVelas(){

    try{

        const datos = await consultarVelas(
            "BTCUSDT",
             periodoActual
        );

        const velasFormateadas = datos.map(candle=>({

            time:Number(candle[0])/1000,
            open:Number(candle[1]),
            high:Number(candle[2]),
            low:Number(candle[3]),
            close:Number(candle[4])

        }));

        velas.setData(velasFormateadas);

        const datosVolumen =
    datos.map(candle=>({

        time:Number(candle[0])/1000,

        value:Number(candle[5]),

        color:
            Number(candle[4]) >= Number(candle[1])

            ? "#00C853"

            : "#FF5252"

    }));

volumen.setData(datosVolumen);

//procesarIndicadores(
//
  //  velasFormateadas,
//
  //  datos

//);

if(primeraCarga){

    grafica.timeScale().fitContent();

    primeraCarga = false;

}

const datosEMA10 = calcularEMA(velasFormateadas,10);

ema10.setData(datosEMA10.serie);

const datosEMA55 = calcularEMA(velasFormateadas,55);

ema55.setData(datosEMA55.serie);

const datosEMA200 = calcularEMA(velasFormateadas,200);


const analisisEMA = obtenerEstadoEMA(

    datosEMA10.ultimo,

    datosEMA55.ultimo,

    datosEMA200.ultimo

);

document.getElementById("estadoIA").innerHTML =

    analisisEMA.estado;

document.getElementById("estadoIA").style.color =

    analisisEMA.color;

document.getElementById("scoreIA").innerHTML =

    "Score IA: " +

    analisisEMA.score +

    " / 100";

console.log(analisisEMA);


ema200.setData(datosEMA200.serie);


console.log(

    datosEMA10.ultimo,

    datosEMA55.ultimo,

    datosEMA200.ultimo

);

    }

    catch(error){

        console.error(error);

    }

}

cargarVelas();


function actualizarContador(){

    let segundosPeriodo = 60;

    switch(periodoActual){

        case "1m":
            segundosPeriodo = 60;
            break;

        case "5m":
            segundosPeriodo = 300;
            break;

        case "15m":
            segundosPeriodo = 900;
            break;

        case "1h":
            segundosPeriodo = 3600;
            break;

        case "4h":
            segundosPeriodo = 14400;
            break;

        case "1d":
            segundosPeriodo = 86400;
            break;

        case "1w":
            segundosPeriodo = 604800;
            break;

    }

    const ahora = Math.floor(Date.now()/1000);

    const restante = segundosPeriodo - (ahora % segundosPeriodo);

    const horas = Math.floor(restante/3600);

    const minutos = Math.floor((restante%3600)/60);

    const segundos = restante%60;

    if(horas>0){

        lblContador.innerHTML =
            "⏳ " +
            String(horas).padStart(2,"0") + ":" +
            String(minutos).padStart(2,"0") + ":" +
            String(segundos).padStart(2,"0");

    }else{

        lblContador.innerHTML =
            "⏳ " +
            String(minutos).padStart(2,"0") + ":" +
            String(segundos).padStart(2,"0");

    }

}


grafica.subscribeCrosshairMove(param => {

    if(
        !param.point ||
        !param.time ||
        !param.seriesData.has(velas)
    ){
        return;
    }

    const vela = param.seriesData.get(velas);

    const fecha = new Date(param.time * 1000);

    lblFecha.innerHTML =
        "📅 " +
        fecha.toLocaleDateString("es-CO");

    lblHora.innerHTML =
        "🕒 " +
        fecha.toLocaleTimeString(
            "es-CO",
            {
                hour:"2-digit",
                minute:"2-digit",
                second:"2-digit",
                hour12:false
            }
        );

    lblOpen.innerHTML =
        "O: " +
        Number(vela.open).toFixed(2);

    lblHigh.innerHTML =
        "H: " +
        Number(vela.high).toFixed(2);

    lblLow.innerHTML =
        "L: " +
        Number(vela.low).toFixed(2);

    lblClose.innerHTML =
        "C: " +
        Number(vela.close).toFixed(2);

});

setInterval(() => {

    cargarVelas();

}, 5000);

grafica.timeScale().subscribeVisibleLogicalRangeChange(

    rango => {

        graficaVolumen.timeScale().setVisibleLogicalRange(rango);

    }

);

graficaVolumen.timeScale().subscribeVisibleLogicalRangeChange(

    rango => {

        grafica.timeScale().setVisibleLogicalRange(rango);

    }

);

setInterval(() => {

    actualizarContador();

},1000);
