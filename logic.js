(function(global){
  'use strict';

  const CAFE={
    scaleMin:4,
    scaleMax:6.5,
    bands:[
      {max:4.5,label:'MUY BAJO'},
      {max:5,label:'BAJO'},
      {max:5.5,label:'ADECUADO'},
      {max:6,label:'MODERADAMENTE ALTO'},
      {max:Infinity,label:'ALTO'}
    ]
  };

  function classify(ph){
    if(!Number.isFinite(ph)||ph<0||ph>14)throw new RangeError('pH fuera del rango válido');
    return CAFE.bands.find(band=>ph<band.max).label;
  }

  function targetForArea(areaHa){
    if(!Number.isFinite(areaHa)||areaHa<=0)throw new RangeError('Área inválida');
    return areaHa<=2?10:15;
  }

  function median(values){
    if(!values.length)return null;
    const sorted=[...values].sort((a,b)=>a-b);
    const middle=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  }

  function summarize(points){
    const values=points.map(point=>point.ph).filter(Number.isFinite);
    if(!values.length)return null;
    const representative=median(values);
    const average=values.reduce((sum,value)=>sum+value,0)/values.length;
    return {
      count:values.length,
      representative,
      average,
      minimum:Math.min(...values),
      maximum:Math.max(...values),
      adequateCount:values.filter(value=>classify(value)==='ADECUADO').length,
      category:classify(representative)
    };
  }

  function decodeYinmikFrame(input){
    const bytes=input instanceof DataView
      ?Array.from({length:input.byteLength},(_,index)=>input.getUint8(index))
      :Array.from(input);
    for(let index=bytes.length-1;index>0;index--){
      const current=bytes[index];
      const previous=bytes[index-1];
      const highCurrent=(current&0x55)<<1;
      const lowCurrent=(current&0xaa)>>1;
      const highPrevious=(previous&0x55)<<1;
      const lowPrevious=(previous&0xaa)>>1;
      bytes[index]=0xff-(highCurrent|lowPrevious);
      bytes[index-1]=0xff-(highPrevious|lowCurrent);
    }
    return bytes;
  }

  function unsigned16(bytes,index){return (bytes[index]<<8)|bytes[index+1];}
  function signed16(bytes,index){const value=unsigned16(bytes,index);return value&0x8000?value-0x10000:value;}

  function rawHex(value){
    return Array.from({length:value.byteLength},(_,index)=>value.getUint8(index).toString(16).padStart(2,'0')).join('').toUpperCase();
  }

  function decodeReading(value){
    if(!(value instanceof DataView)||value.byteLength!==45)return null;
    const decoded=decodeYinmikFrame(value);
    if(decoded[0]!==0x01||decoded[1]!==0x02)return null;
    const ph=unsigned16(decoded,3)/10;
    const temperatureC=signed16(decoded,13)/10;
    if(!Number.isFinite(ph)||ph<0||ph>14||!Number.isFinite(temperatureC)||temperatureC<-20||temperatureC>80)return null;
    return {ph,temperatureC,rawPayload:rawHex(value)};
  }

  function scalePosition(ph){
    return Math.max(0,Math.min(100,((ph-CAFE.scaleMin)/(CAFE.scaleMax-CAFE.scaleMin))*100));
  }

  function formatPh(value){
    return value.toLocaleString('es-CO',{minimumFractionDigits:1,maximumFractionDigits:2});
  }

  function csvNumber(value){
    return Number.isFinite(value)?String(value).replace('.',','):'';
  }

  function csvCell(value){
    const text=value===null||value===undefined?'':String(value);
    return /[;"\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
  }

  function buildJourneyCsv(journey){
    const headers=[
      'jornada_id','finca_codigo','finca','lote_codigo','lote','area_ha','ano_siembra','fecha_jornada',
      'punto','ph','categoria','temperatura_c','fuente','latitud','longitud','precision_gps_m','fecha_punto'
    ];
    const rows=(journey.points||[]).map(point=>[
      journey.id,journey.farmId,journey.farmName,journey.lotId,journey.lotName,csvNumber(journey.areaHa),journey.plantingYear,journey.completedAt,
      point.sequence,csvNumber(point.ph),classify(point.ph),csvNumber(point.temperatureC),point.source,
      csvNumber(point.location&&point.location.latitude),csvNumber(point.location&&point.location.longitude),csvNumber(point.location&&point.location.accuracy),point.recordedAt
    ]);
    return `\uFEFF${[headers,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n')}`;
  }

  function journeyFilename(journey){
    const lot=String(journey.lotName||'lote').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const date=String(journey.completedAt||new Date().toISOString()).slice(0,10);
    return `ph-field-${lot||'lote'}-${date}.csv`;
  }

  global.PhFieldLogic=Object.freeze({CAFE,classify,targetForArea,median,summarize,decodeYinmikFrame,decodeReading,scalePosition,formatPh,buildJourneyCsv,journeyFilename});
})(globalThis);
