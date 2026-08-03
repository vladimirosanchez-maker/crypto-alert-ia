// ================================
// WORKSPACE DE CRYPTO ALERT IA PRO
// ================================

const WORKSPACE_KEY = "CryptoAlertIAPro";

function cargarWorkspace(){

    const datos = localStorage.getItem(WORKSPACE_KEY);

    if(datos){

        return JSON.parse(datos);

    }

    return{

        periodo:"15m",

        grafica:null,

        indicadores:{

            ema10:true,

            ema55:true,

            ema200:true,

            volumen:true,

            adx:true

        },

        simbolo:"BTCUSDT"

    };

}

function guardarWorkspace(workspace){

    localStorage.setItem(

        WORKSPACE_KEY,

        JSON.stringify(workspace)

    );

}

console.log(cargarWorkspace());