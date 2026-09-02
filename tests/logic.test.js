'use strict';

const assert=require('node:assert/strict');
require('../logic.js');

const Logic=globalThis.PhFieldLogic;

assert.equal(Logic.classify(4.49),'MUY BAJO');
assert.equal(Logic.classify(4.5),'BAJO');
assert.equal(Logic.classify(5),'ADECUADO');
assert.equal(Logic.classify(5.5),'MODERADAMENTE ALTO');
assert.equal(Logic.classify(6),'ALTO');

assert.equal(Logic.targetForArea(0.1),10);
assert.equal(Logic.targetForArea(2),10);
assert.equal(Logic.targetForArea(2.01),15);

assert.equal(Logic.median([5.4,4.9,5.1]),5.1);
assert.ok(Math.abs(Logic.median([5,5.2,5.4,5.6])-5.3)<Number.EPSILON*10);

const summary=Logic.summarize([
  {ph:4.8},{ph:5},{ph:5.2},{ph:5.4},{ph:5.6}
]);
assert.equal(summary.representative,5.2);
assert.equal(summary.minimum,4.8);
assert.equal(summary.maximum,5.6);
assert.equal(summary.adequateCount,3);
assert.equal(summary.category,'ADECUADO');

const packet='FF81 FE5A FFFE FFFF FFFF FFFF FDF7 FD57 DAAA EBFF FFFF FFFF FFFF FFF7 1400 0000 0000 0000 0000 0000 0000 0000 00';
const hex=packet.replace(/\s/g,'');
const bytes=Uint8Array.from(hex.match(/.{2}/g).map(value=>Number.parseInt(value,16)));
const reading=Logic.decodeReading(new DataView(bytes.buffer));
assert.ok(reading);
assert.equal(reading.ph,8.2);
assert.equal(reading.temperatureC,26);
assert.equal(reading.rawPayload,hex);

const journey={
  id:'J-1',farmId:'FIN-001',farmName:'Finca Demostración 1',lotId:'LOT-001',lotName:'Lote 1',areaHa:1.8,plantingYear:2021,completedAt:'2026-09-01T15:00:00.000Z',
  points:[{sequence:1,ph:5.2,temperatureC:24.6,source:'bluetooth',recordedAt:'2026-09-01T14:55:00.000Z',location:{latitude:4.8612,longitude:-74.0583,accuracy:14}}]
};
const csv=Logic.buildJourneyCsv(journey);
assert.ok(csv.startsWith('\uFEFFjornada_id;'));
assert.ok(csv.includes('J-1;FIN-001;Finca Demostración 1;LOT-001;Lote 1;1,8;2021'));
assert.ok(csv.includes(';1;5,2;ADECUADO;24,6;bluetooth;4,8612;-74,0583;14;'));
assert.equal(Logic.journeyFilename(journey),'ph-field-lote-1-2026-09-01.csv');

assert.equal(Logic.decodeReading(new DataView(new ArrayBuffer(3))),null);
assert.throws(()=>Logic.classify(14.1),RangeError);
assert.throws(()=>Logic.targetForArea(0),RangeError);

console.log('Todas las pruebas de lógica pasaron.');
