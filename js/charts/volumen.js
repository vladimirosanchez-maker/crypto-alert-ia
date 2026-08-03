function crearGraficaVolumen(){

    const contenedorVolumen =
        document.getElementById("panelVolumen");

    const graficaVolumen =
        LightweightCharts.createChart(
            contenedorVolumen,
            {

                width:contenedorVolumen.clientWidth,

                height:180,

                layout:{

                    background:{
                        color:"#111827"
                    },

                    textColor:"#FFFFFF"

                },

                grid:{

                    vertLines:{
                        color:"#1F2937"
                    },

                    horzLines:{
                        color:"#1F2937"
                    }

                }

            }

        );

    const volumen =
        graficaVolumen.addHistogramSeries({

            priceFormat:{
                type:"volume"
            },

            priceScaleId:""

        });

    return{

        graficaVolumen,

        volumen

    };

}