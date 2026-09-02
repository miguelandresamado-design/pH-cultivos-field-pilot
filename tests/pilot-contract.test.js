'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');

const htmlIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(htmlIds).size,htmlIds.length,'La interfaz no debe tener IDs duplicados.');

const referencedIds=[...app.matchAll(/byId\('([^']+)'\)/g)].map(match=>match[1]);
for(const id of referencedIds)assert.ok(htmlIds.includes(id),`Falta el elemento #${id}.`);

assert.match(html,/Medición individual/);
assert.match(html,/>Fincas</);
assert.match(app,/recordType:'individual'/);
assert.match(app,/recordType:'submuestra_lote'/);
assert.match(app,/ph-cultivos-field-pilot\.individual\.v1/);
assert.match(app,/ph-cultivos-field-pilot\.journeys\.v1/);
assert.match(app,/0000ff01-0000-1000-8000-00805f9b34fb/);
assert.match(app,/0000ff02-0000-1000-8000-00805f9b34fb/);
assert.match(worker,/ph-cultivos-field-pilot-v1/);

for(const asset of ['index.html','styles.css','logic.js','app.js','manifest.json','icon.svg','icon-192.png','icon-512.png']){
  assert.ok(fs.existsSync(path.join(root,asset)),`Falta el recurso offline ${asset}.`);
}

console.log('El contrato de los dos módulos y los recursos offline pasó.');
