function crearGraficaADX(){

    const contenedor = document.getElementById("panelADX");

    const graficaADX = LightweightCharts.createChart(contenedor,{

        width:contenedor.clientWidth,

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

    });

    return graficaADX;

}

function calcularTR(datos){

    const tr=[];

    for(let i=1;i<datos.length;i++){

        const high=Number(datos[i].high);

        const low=Number(datos[i].low);

        const closeAnterior=
            Number(datos[i-1].close);

        const rango1=high-low;

        const rango2=
            Math.abs(high-closeAnterior);

        const rango3=
            Math.abs(low-closeAnterior);

        tr.push(

            Math.max(

                rango1,

                rango2,

                rango3

            )

        );

    }

    return tr;

}

function calcularDM(datos){

    const positivo=[];

    const negativo=[];

    for(let i=1;i<datos.length;i++){

        const up=

            Number(datos[i].high)-

            Number(datos[i-1].high);

        const down=

            Number(datos[i-1].low)-

            Number(datos[i].low);

        positivo.push(

            up>down && up>0

            ? up

            :0

        );

        negativo.push(

            down>up && down>0

            ? down

            :0

        );

    }

    return{

        positivo,

        negativo

    };

}

function suavizarWilder(datos, periodo){

    const resultado=[];

    let suma=0;

    for(let i=0;i<datos.length;i++){

        if(i<periodo){

            suma+=datos[i];

            if(i===periodo-1){

                resultado.push(suma);

            }

        }else{

            suma=suma-(suma/periodo)+datos[i];

            resultado.push(suma);

        }

    }

    return resultado;

}

function calcularDI(datos,periodo=14){

    const tr=calcularTR(datos);

    const dm=calcularDM(datos);

    const trSuavizado=

        suavizarWilder(tr,periodo);

    const dmPositivo=

        suavizarWilder(dm.positivo,periodo);

    const dmNegativo=

        suavizarWilder(dm.negativo,periodo);

    const diPositivo=[];

    const diNegativo=[];

    for(let i=0;i<trSuavizado.length;i++){

        diPositivo.push(

            (dmPositivo[i]/trSuavizado[i])*100

        );

        diNegativo.push(

            (dmNegativo[i]/trSuavizado[i])*100

        );

    }

    return{

        diPositivo,

        diNegativo

    };

}

console.log("ADX listo");

function calcularDX(datos, periodo = 14){

    const di = calcularDI(datos, periodo);

    const dx = [];

    for(let i = 0; i < di.diPositivo.length; i++){

        const positivo = di.diPositivo[i];

        const negativo = di.diNegativo[i];

        const suma = positivo + negativo;

        if(suma === 0){

            dx.push(0);

            continue;

        }

        dx.push(

            (Math.abs(positivo - negativo) / suma) * 100

        );

    }

    return dx;

}

function calcularADX(datos, periodo = 14){

    const dx = calcularDX(datos, periodo);

    const adx = suavizarWilder(dx, periodo);

    return adx;

}
console.log("ADX listo");