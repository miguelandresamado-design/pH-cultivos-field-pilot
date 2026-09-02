# pH Cultivos Piloto

Prototipo independiente para probar dos formas de trabajo con técnicos de campo, sin modificar `pH-cultivos` ni `pH-cultivos-field`.

## Módulos

### Medición individual

Permite conectar el YINMIK YK-S01 o ingresar un valor manual, interpretar el pH de café, agregar ubicación opcional y guardar la medición sin seleccionar finca o lote.

### Fincas

Permite seleccionar una finca y uno de sus lotes, registrar 10 puntos para lotes de hasta 2 ha o 15 para lotes mayores y obtener un resultado representativo mediante la mediana. Conserva cada submuestra, GPS, temperatura y datos Bluetooth originales.

## Funciones de esta etapa

- Café como único cultivo.
- Fincas y lotes ficticios, sin datos personales.
- Dos historiales separados: mediciones individuales y jornadas por lote.
- Bluetooth YINMIK YK-S01 mediante el servicio `FF01` y la característica `FF02`.
- Android mediante Chrome e iPhone mediante Bluefy.
- Ingreso manual como respaldo.
- Ubicación opcional por registro.
- Exportación CSV de jornadas por lote.
- Guardado local y funcionamiento sin conexión después de la primera carga.

## Datos

Esta versión todavía no tiene usuarios ni servidor. Los registros se guardan localmente con estructuras separadas y el campo `recordType`:

- `individual`
- `submuestra_lote`

Esta separación permitirá sincronizar posteriormente ambos tipos de registro a una misma base de datos sin mezclar las mediciones individuales con las estadísticas de los lotes.

Claves locales:

- `ph-cultivos-field-pilot.individual.v1`
- `ph-cultivos-field-pilot.journeys.v1`
- `ph-cultivos-field-pilot.draft.v1`

## Pruebas

```bash
node tests/logic.test.js
node tests/pilot-contract.test.js
node --check app.js
```

Los resultados son orientativos. Las decisiones de fertilización o encalado deben confirmarse con análisis de laboratorio y criterio técnico.
