# pH a la vista · versiones de entrenamiento

Tres aplicaciones independientes para el entrenamiento de los técnicos de campo. Cada versión abre directamente, sin correo ni contraseña, y contiene únicamente las cinco fincas asignadas al técnico. No utiliza Supabase ni transmite registros a un servidor.

## Enlaces

- Juan Pablo Rojas: `juan-pablo/`
- Juan Buitrago: `juan-buitrago/`
- Efraín Ospina: `efrain-ospina/`

## Funciones incluidas

- Medición individual manual o mediante YINMIK YK-S01.
- Muestreo por finca y lote con jornadas de 10 o 15 puntos.
- GPS opcional, temperatura, mediana, promedio y desviación estándar.
- Administración de lotes; la finca y su ubicación permanecen en solo lectura.
- Historial de campañas por lote.
- Comparación temporal de hasta tres lotes de la misma finca.
- Línea y lectura de tendencia para cada lote.
- Comparación espacial de exactamente dos lotes en una campaña seleccionada.
- Mapas de calor construidos con los puntos medidos, sin inferir el perímetro del lote.
- Exportación CSV.
- Instalación PWA y operación offline después de la primera carga.

Las cinco fincas de cada técnico incluyen tres lotes de práctica y cuatro campañas históricas de entrenamiento para que las vistas de monitoreo y comparación puedan probarse inmediatamente.

## Datos y seguridad

Los datos permanecen en IndexedDB dentro del navegador. Cada versión utiliza un ámbito de almacenamiento y una caché independientes, evitando cruces entre técnicos cuando se prueban varias aplicaciones en el mismo dispositivo.

Estas versiones son para entrenamiento: no tienen autenticación, sincronización ni respaldo remoto. Borrar los datos del sitio o desinstalar la PWA puede eliminar los registros locales.

Los resultados son orientativos. Las decisiones de fertilización o encalado deben confirmarse con análisis de laboratorio y criterio técnico.
