(function(){
  'use strict';

  const Logic=globalThis.PhFieldLogic;
  const INDIVIDUAL_STORE_KEY='ph-a-la-vista-training.individual.v1';
  const JOURNEY_STORE_KEY='ph-a-la-vista-training.journeys.v1';
  const DRAFT_KEY='ph-a-la-vista-training.draft.v1';
  const LOT_STORE_KEY='ph-a-la-vista-training.lots.v1';
  const YINMIK_SERVICE='0000ff01-0000-1000-8000-00805f9b34fb';
  const YINMIK_MEASUREMENT='0000ff02-0000-1000-8000-00805f9b34fb';

  const technicians=[
    {id:'TEC-002',name:'Juan Buitrago'}
  ];

  const farmData=[
    ['FIN-006','TEC-002','La Italia','Antioquia','Andes','Taparto'],
    ['FIN-007','TEC-002','Rigoberto Franco','Antioquia','Andes','Taparto'],
    ['FIN-008','TEC-002','La Costa','Antioquia','Concordia','La Costa'],
    ['FIN-009','TEC-002','La Primavera','Antioquia','Concordia','Pueblo Rico'],
    ['FIN-010','TEC-002','La Cascada','Antioquia','Ciudad Bolívar','Farallón']
  ];

  const farms=farmData.map(([id,technicianId,name,department,municipality,village])=>({
    id,technicianId,name,department,municipality,village,
    lots:[
      {id:`${id}-LOT-01`,name:'Lote de práctica 1',areaHa:1.8,plantingYear:2021},
      {id:`${id}-LOT-02`,name:'Lote de práctica 2',areaHa:2.7,plantingYear:2018}
    ]
  }));

  const byId=id=>document.getElementById(id);
  const elements={
    stepLabel:byId('step-label'),
    screens:{
      home:byId('home-screen'),individual:byId('individual-screen'),farms:byId('setup-screen'),capture:byId('capture-screen'),result:byId('result-screen')
    },
    openIndividualButton:byId('open-individual-button'),openFarmsButton:byId('open-farms-button'),
    homeIndividualCount:byId('home-individual-count'),homeJourneyCount:byId('home-journey-count'),
    individualBack:byId('individual-back'),quickConnectionBadge:byId('quick-connection-badge'),quickReadingState:byId('quick-reading-state'),
    quickLiveValue:byId('quick-live-value'),quickLiveTemperature:byId('quick-live-temperature'),quickScaleMarker:byId('quick-scale-marker'),
    quickConnectButton:byId('quick-connect-button'),quickDisconnectButton:byId('quick-disconnect-button'),quickBluetoothStatus:byId('quick-bluetooth-status'),
    quickManualPh:byId('quick-manual-ph'),quickManualButton:byId('quick-manual-button'),quickGpsStatus:byId('quick-gps-status'),
    quickSaveButton:byId('quick-save-button'),quickConfirmation:byId('quick-confirmation'),quickHistoryCount:byId('quick-history-count'),
    quickHistoryEmpty:byId('quick-history-empty'),quickHistoryList:byId('quick-history-list'),
    setupBack:byId('setup-back'),technicianSelect:byId('technician-select'),farmSelect:byId('farm-select'),farmLocation:byId('farm-location'),
    lotSelect:byId('lot-select'),lotManager:byId('lot-manager'),lotList:byId('lot-list'),addLotButton:byId('add-lot-button'),lotForm:byId('lot-form'),
    lotEditId:byId('lot-edit-id'),lotName:byId('lot-name'),lotArea:byId('lot-area'),lotYear:byId('lot-year'),cancelLotButton:byId('cancel-lot-button'),
    planTitle:byId('plan-title'),planMeta:byId('plan-meta'),
    startButton:byId('start-button'),resumeBanner:byId('resume-banner'),resumeText:byId('resume-text'),resumeButton:byId('resume-button'),
    historyCount:byId('history-count'),historyEmpty:byId('history-empty'),historyList:byId('history-list'),
    captureBack:byId('capture-back'),pointNumber:byId('point-number'),pointTarget:byId('point-target'),captureLot:byId('capture-lot'),
    connectionBadge:byId('connection-badge'),readingState:byId('reading-state'),liveValue:byId('live-value'),liveTemperature:byId('live-temperature'),
    scaleMarker:byId('scale-marker'),connectButton:byId('connect-button'),disconnectButton:byId('disconnect-button'),bluetoothStatus:byId('bluetooth-status'),
    manualPh:byId('manual-ph'),manualButton:byId('manual-button'),progressCount:byId('progress-count'),progressFill:byId('progress-fill'),
    gpsStatus:byId('gps-status'),savePointButton:byId('save-point-button'),finishButton:byId('finish-button'),
    resultBack:byId('result-back'),resultLot:byId('result-lot'),resultPh:byId('result-ph'),resultCategory:byId('result-category'),
    resultMarker:byId('result-marker'),resultRange:byId('result-range'),resultAdequate:byId('result-adequate'),
    technicalText:byId('technical-text'),saveJourneyButton:byId('save-journey-button')
  };

  let individualMeasurements=[];
  let journeys=[];
  let draft=null;
  let currentReading=null;
  let activeScreen='home';
  let bluetoothDevice=null;
  let bluetoothCharacteristic=null;
  let bluetoothPollTimer=null;
  let bluetoothReadPending=false;
  let savingReading=false;

  function id(){
    return globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function'
      ?globalThis.crypto.randomUUID()
      :`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function parseStore(key,property){
    try{
      const stored=JSON.parse(localStorage.getItem(key));
      return stored&&stored.schemaVersion===1&&Array.isArray(stored[property])?stored[property]:[];
    }catch(error){return [];}
  }

  function loadData(){
    individualMeasurements=parseStore(INDIVIDUAL_STORE_KEY,'measurements');
    journeys=parseStore(JOURNEY_STORE_KEY,'journeys');
    try{
      const storedLots=JSON.parse(localStorage.getItem(LOT_STORE_KEY));
      if(storedLots&&storedLots.schemaVersion===1&&storedLots.farms){
        farms.forEach(farm=>{
          const saved=storedLots.farms[farm.id];
          if(Array.isArray(saved))farm.lots=saved.filter(lot=>lot&&lot.id&&lot.name&&Number.isFinite(lot.areaHa)&&Number.isInteger(lot.plantingYear));
        });
      }
    }catch(error){}
    try{
      const storedDraft=JSON.parse(localStorage.getItem(DRAFT_KEY));
      draft=storedDraft&&storedDraft.schemaVersion===1&&Array.isArray(storedDraft.points)?storedDraft:null;
    }catch(error){draft=null;}
  }

  function persistIndividuals(){
    localStorage.setItem(INDIVIDUAL_STORE_KEY,JSON.stringify({schemaVersion:1,measurements:individualMeasurements}));
  }
  function persistJourneys(){localStorage.setItem(JOURNEY_STORE_KEY,JSON.stringify({schemaVersion:1,journeys}));}
  function persistDraft(){if(draft)localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));else localStorage.removeItem(DRAFT_KEY);}
  function persistLots(){
    const saved=Object.fromEntries(farms.map(farm=>[farm.id,farm.lots]));
    localStorage.setItem(LOT_STORE_KEY,JSON.stringify({schemaVersion:1,farms:saved}));
  }

  function showScreen(name){
    activeScreen=name;
    Object.entries(elements.screens).forEach(([screenName,screen])=>{screen.hidden=screenName!==name;});
    const labels={home:'Inicio',individual:'Individual',farms:'Fincas · 1 de 3',capture:'Fincas · 2 de 3',result:'Fincas · 3 de 3'};
    elements.stepLabel.textContent=labels[name];
    if(name==='individual'||name==='capture')startBluetoothPolling();else stopBluetoothPolling();
    if(name==='home')renderHome();
    globalThis.scrollTo({top:0,behavior:'smooth'});
  }

  function renderHome(){
    elements.homeIndividualCount.textContent=String(individualMeasurements.length);
    elements.homeJourneyCount.textContent=String(journeys.length);
  }

  function selectedTechnician(){return technicians.find(technician=>technician.id===elements.technicianSelect.value)||technicians[0];}
  function farmsForTechnician(){const technician=selectedTechnician();return farms.filter(farm=>farm.technicianId===technician.id);}
  function selectedFarm(){const available=farmsForTechnician();return available.find(farm=>farm.id===elements.farmSelect.value)||available[0];}
  function selectedLot(){const farm=selectedFarm();return farm&&farm.lots.find(lot=>lot.id===elements.lotSelect.value)||farm&&farm.lots[0]||null;}
  function farmById(farmId){return farms.find(farm=>farm.id===farmId);}
  function lotById(farm,lotId){return farm&&farm.lots.find(lot=>lot.id===lotId);}

  function populateTechnicians(){
    elements.technicianSelect.replaceChildren(...technicians.map(technician=>new Option(technician.name,technician.id)));
    populateFarms();
  }

  function populateFarms(){
    const available=farmsForTechnician();
    elements.farmSelect.replaceChildren(...available.map(farm=>new Option(farm.name,farm.id)));
    populateLots();
  }

  function populateLots(){
    const farm=selectedFarm();
    if(!farm)return;
    elements.lotSelect.replaceChildren(...farm.lots.map(lot=>new Option(`${lot.name} · ${String(lot.areaHa).replace('.',',')} ha · Siembra ${lot.plantingYear}`,lot.id)));
    elements.lotSelect.disabled=farm.lots.length===0;
    elements.startButton.disabled=farm.lots.length===0;
    elements.farmLocation.textContent=[farm.village?`Vereda ${farm.village}`:null,farm.municipality,farm.department].filter(Boolean).join(' · ');
    renderLotManager();
    updatePlan();
  }

  function updatePlan(){
    const lot=selectedLot();
    if(!lot){
      elements.planTitle.textContent='Agrega un lote para comenzar';
      elements.planMeta.textContent='La finca permanecerá fija; solo se guardarán los lotes en este dispositivo.';
      return;
    }
    const target=Logic.targetForArea(lot.areaHa);
    elements.planTitle.textContent=`${target} puntos en zigzag`;
    elements.planMeta.textContent='GPS y temperatura se guardan automáticamente';
  }

  function resetLotForm(){
    elements.lotForm.reset();elements.lotEditId.value='';elements.lotForm.hidden=true;elements.addLotButton.hidden=false;
  }

  function openLotForm(lot){
    elements.lotEditId.value=lot?lot.id:'';
    elements.lotName.value=lot?lot.name:'';
    elements.lotArea.value=lot?String(lot.areaHa).replace('.',','):'';
    elements.lotYear.value=lot?String(lot.plantingYear):'';
    elements.lotForm.hidden=false;elements.addLotButton.hidden=true;elements.lotName.focus();
  }

  function renderLotManager(){
    const farm=selectedFarm();elements.lotList.replaceChildren();resetLotForm();
    if(!farm||farm.lots.length===0){
      const empty=document.createElement('div');empty.className='lot-empty';empty.textContent='Esta finca aún no tiene lotes. Agrega el primero para iniciar.';elements.lotList.appendChild(empty);return;
    }
    farm.lots.forEach(lot=>{
      const row=document.createElement('div');row.className='lot-row';
      const copy=document.createElement('div');const name=document.createElement('strong');name.textContent=lot.name;
      const meta=document.createElement('span');meta.textContent=`${String(lot.areaHa).replace('.',',')} ha · Siembra ${lot.plantingYear}`;copy.append(name,meta);
      const actions=document.createElement('div');actions.className='lot-row-actions';
      const edit=document.createElement('button');edit.type='button';edit.className='text-button';edit.textContent='Editar';edit.addEventListener('click',()=>openLotForm(lot));
      const remove=document.createElement('button');remove.type='button';remove.className='delete-button';remove.textContent='Eliminar';
      remove.addEventListener('click',()=>deleteLot(lot));actions.append(edit,remove);row.append(copy,actions);elements.lotList.appendChild(row);
    });
  }

  function saveLot(event){
    event.preventDefault();const farm=selectedFarm();if(!farm)return;
    const name=elements.lotName.value.trim();const areaHa=Number(elements.lotArea.value.trim().replace(',','.'));const plantingYear=Number(elements.lotYear.value);
    if(!name){alert('Escribe el nombre del lote.');elements.lotName.focus();return;}
    if(!Number.isFinite(areaHa)||areaHa<=0||areaHa>10000){alert('Ingresa un área válida mayor que 0.');elements.lotArea.focus();return;}
    if(!Number.isInteger(plantingYear)||plantingYear<1900||plantingYear>new Date().getFullYear()+1){alert('Ingresa un año de siembra válido.');elements.lotYear.focus();return;}
    const editId=elements.lotEditId.value;
    if(editId){
      const lot=lotById(farm,editId);if(lot)Object.assign(lot,{name,areaHa,plantingYear});
    }else{
      farm.lots.push({id:`${farm.id}-LOT-${id()}`,name,areaHa,plantingYear});
    }
    persistLots();populateLots();elements.lotManager.open=true;
  }

  function deleteLot(lot){
    const farm=selectedFarm();if(!farm||!globalThis.confirm(`¿Eliminar ${lot.name}? Los muestreos ya guardados no se borrarán.`))return;
    if(draft&&draft.farmId===farm.id&&draft.lotId===lot.id){
      if(!globalThis.confirm('Este lote tiene un muestreo sin finalizar. Si continúas, ese avance también se eliminará.'))return;
      draft=null;persistDraft();renderResume();
    }
    farm.lots=farm.lots.filter(item=>item.id!==lot.id);persistLots();populateLots();elements.lotManager.open=true;
  }

  function renderResume(){
    if(!draft){elements.resumeBanner.hidden=true;return;}
    const farm=farmById(draft.farmId);const lot=lotById(farm,draft.lotId);
    if(!farm||!lot){draft=null;persistDraft();elements.resumeBanner.hidden=true;return;}
    elements.resumeText.textContent=`${lot.name} · ${draft.points.length}/${draft.target} puntos`;
    elements.resumeBanner.hidden=false;
  }

  function formatDate(iso){
    const date=new Date(iso);
    return Number.isNaN(date.getTime())?'Fecha no disponible':new Intl.DateTimeFormat('es-CO',{dateStyle:'short',timeStyle:'short'}).format(date);
  }

  function mapUrlForLocation(location,label){
    const apple=/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
    const coordinates=`${location.latitude},${location.longitude}`;
    return apple
      ?`https://maps.apple.com/?ll=${encodeURIComponent(coordinates)}&q=${encodeURIComponent(label)}`
      :`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`;
  }

  function renderIndividualHistory(){
    elements.quickHistoryCount.textContent=String(individualMeasurements.length);
    elements.quickHistoryEmpty.hidden=individualMeasurements.length>0;
    elements.quickHistoryList.replaceChildren();
    individualMeasurements.forEach(measurement=>{
      const item=document.createElement('div');item.className='quick-history-item';
      const value=document.createElement('div');value.className='quick-history-value';value.textContent=`pH ${Logic.formatPh(measurement.ph)}`;
      const category=document.createElement('div');category.className='quick-history-category';category.textContent=measurement.category;
      const temperature=Number.isFinite(measurement.temperatureC)?` · ${Logic.formatPh(measurement.temperatureC)} °C`:'';
      const meta=document.createElement('div');meta.className='quick-history-meta';
      meta.textContent=`${measurement.source==='bluetooth'?'Bluetooth':'Manual'}${temperature} · ${formatDate(measurement.recordedAt)}`;
      const actions=document.createElement('div');actions.className='quick-history-actions';
      if(measurement.location){
        const link=document.createElement('a');link.href=mapUrlForLocation(measurement.location,'Medición individual');link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ver ubicación';actions.appendChild(link);
      }
      const remove=document.createElement('button');remove.type='button';remove.className='delete-button';remove.textContent='Eliminar';
      remove.addEventListener('click',()=>{
        if(!globalThis.confirm('¿Eliminar esta medición individual?'))return;
        individualMeasurements=individualMeasurements.filter(item=>item.id!==measurement.id);
        persistIndividuals();renderIndividualHistory();renderHome();
      });
      actions.appendChild(remove);item.append(value,category,meta,actions);elements.quickHistoryList.appendChild(item);
    });
  }

  function renderHistory(){
    elements.historyCount.textContent=String(journeys.length);
    elements.historyEmpty.hidden=journeys.length>0;
    elements.historyList.replaceChildren();
    journeys.forEach(journey=>{
      const item=document.createElement('div');item.className='history-item';
      const title=document.createElement('div');title.className='history-title';
      const name=document.createElement('span');name.textContent=`${journey.farmName} · ${journey.lotName}`;
      const ph=document.createElement('span');ph.textContent=`pH ${Logic.formatPh(journey.summary.representative)}`;
      const meta=document.createElement('div');meta.className='history-meta';meta.textContent=`${journey.points.length} puntos · ${journey.summary.category} · ${formatDate(journey.completedAt)}`;
      const controls=document.createElement('div');controls.className='history-actions';
      const toggle=document.createElement('button');toggle.type='button';toggle.className='text-button';toggle.textContent='Ver puntos';
      const exportButton=document.createElement('button');exportButton.type='button';exportButton.className='secondary-button compact-button';exportButton.textContent='Exportar CSV';
      const detail=document.createElement('div');detail.className='point-detail';detail.hidden=true;
      (journey.points||[]).forEach(point=>detail.appendChild(renderPoint(point)));
      const exportHint=document.createElement('p');exportHint.className='export-hint';exportHint.textContent='En iPhone, selecciona “Guardar en Archivos” en la hoja de compartir.';
      detail.appendChild(exportHint);
      toggle.addEventListener('click',()=>{detail.hidden=!detail.hidden;toggle.textContent=detail.hidden?'Ver puntos':'Ocultar puntos';});
      exportButton.addEventListener('click',()=>exportJourney(journey));
      controls.append(toggle,exportButton);title.append(name,ph);item.append(title,meta,controls,detail);elements.historyList.appendChild(item);
    });
  }

  function renderPoint(point){
    const row=document.createElement('div');row.className='point-row';
    const head=document.createElement('div');head.className='point-head';
    const sequence=document.createElement('strong');sequence.textContent=`Punto ${point.sequence}`;
    const ph=document.createElement('strong');ph.textContent=`pH ${Logic.formatPh(point.ph)}`;head.append(sequence,ph);
    const reading=document.createElement('div');reading.className='point-meta';
    const temperature=Number.isFinite(point.temperatureC)?` · ${Logic.formatPh(point.temperatureC)} °C`:'';
    reading.textContent=`${Logic.classify(point.ph)}${temperature} · ${point.source==='bluetooth'?'Bluetooth':'Manual'}`;
    const gps=document.createElement('div');gps.className='point-gps';
    if(point.location){
      const coordinates=document.createElement('span');coordinates.textContent=`${point.location.latitude.toFixed(6)}, ${point.location.longitude.toFixed(6)} · ±${Math.round(point.location.accuracy)} m`;
      const link=document.createElement('a');link.href=mapUrlForLocation(point.location,`Punto ${point.sequence}`);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir en mapa';gps.append(coordinates,link);
    }else{gps.textContent='Sin ubicación GPS';}
    row.append(head,reading,gps);return row;
  }

  async function exportJourney(journey){
    const csv=Logic.buildJourneyCsv(journey);const filename=Logic.journeyFilename(journey);
    if(typeof File==='function'&&navigator.share){
      const file=new File([csv],filename,{type:'text/csv;charset=utf-8'});
      if(!navigator.canShare||navigator.canShare({files:[file]})){
        try{await navigator.share({files:[file],title:`Muestreo ${journey.lotName}`});return;}
        catch(error){if(error&&error.name==='AbortError')return;}
      }
    }
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
    globalThis.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function resetIndividualReading(){
    currentReading=null;elements.quickLiveValue.textContent='—';elements.quickLiveTemperature.textContent='Temperatura no disponible';
    elements.quickReadingState.textContent='Esperando lectura';elements.quickScaleMarker.hidden=true;elements.quickSaveButton.disabled=true;
  }

  function openIndividual(){
    resetIndividualReading();elements.quickConfirmation.hidden=true;showScreen('individual');
  }

  function startJourney(){
    const technician=selectedTechnician();const farm=selectedFarm();const lot=selectedLot();
    if(!farm||!lot){elements.lotManager.open=true;openLotForm(null);return;}
    draft={schemaVersion:1,id:id(),recordType:'submuestra_lote',crop:'cafe',technicianId:technician.id,technicianName:technician.name,farmId:farm.id,lotId:lot.id,target:Logic.targetForArea(lot.areaHa),startedAt:new Date().toISOString(),points:[]};
    persistDraft();openCapture();
  }

  function openCapture(){
    if(!draft)return;
    currentReading=null;updateCapture();showScreen('capture');
  }

  function updateCapture(){
    const farm=farmById(draft.farmId);const lot=lotById(farm,draft.lotId);const completed=draft.points.length;
    elements.pointNumber.textContent=String(Math.min(completed+1,draft.target));elements.pointTarget.textContent=String(draft.target);
    elements.captureLot.textContent=`${farm.name} · ${lot.name}`;elements.progressCount.textContent=`${completed}/${draft.target}`;
    elements.progressFill.style.width=`${Math.min(100,(completed/draft.target)*100)}%`;
    elements.finishButton.disabled=completed<draft.target;elements.finishButton.textContent=completed<draft.target?`Faltan ${draft.target-completed} puntos`:'Finalizar muestreo';
    elements.savePointButton.disabled=!currentReading||completed>=draft.target;
    if(completed>=draft.target){
      elements.liveValue.textContent='Recorrido completo';elements.liveTemperature.textContent='Ya puedes finalizar el muestreo';elements.scaleMarker.hidden=true;
    }else if(!currentReading){
      elements.liveValue.textContent='—';elements.liveTemperature.textContent='Temperatura no disponible';elements.readingState.textContent='Esperando lectura';elements.scaleMarker.hidden=true;
    }
  }

  function useReading(reading){
    if(activeScreen==='capture'&&(!draft||draft.points.length>=draft.target))return;
    if(activeScreen!=='capture'&&activeScreen!=='individual')return;
    currentReading=reading;
    const quick=activeScreen==='individual';
    const value=quick?elements.quickLiveValue:elements.liveValue;
    const temperature=quick?elements.quickLiveTemperature:elements.liveTemperature;
    const state=quick?elements.quickReadingState:elements.readingState;
    const marker=quick?elements.quickScaleMarker:elements.scaleMarker;
    const save=quick?elements.quickSaveButton:elements.savePointButton;
    value.textContent=`pH ${Logic.formatPh(reading.ph)}`;
    temperature.textContent=Number.isFinite(reading.temperatureC)?`${Logic.formatPh(reading.temperatureC)} °C`:'Lectura manual';
    state.textContent=reading.source==='bluetooth'?'Lectura Bluetooth':'Lectura manual';
    marker.hidden=false;marker.style.left=`${Logic.scalePosition(reading.ph)}%`;save.disabled=false;
    if(quick){
      elements.quickConfirmation.hidden=false;
      elements.quickConfirmation.textContent=`${Logic.classify(reading.ph)} · lista para guardar`;
    }
  }

  function parseManual(input){
    const value=input.value.trim().replace(',','.');const ph=Number(value);
    if(value===''||!Number.isFinite(ph)||ph<0||ph>14){alert('Ingresa un valor de pH válido entre 0 y 14.');input.focus();return null;}
    return {ph,temperatureC:null,source:'manual',rawPayload:null,device:null};
  }

  function useManualReading(){const reading=parseManual(elements.manualPh);if(reading)useReading(reading);}
  function useQuickManualReading(){const reading=parseManual(elements.quickManualPh);if(reading)useReading(reading);}

  function locationErrorMessage(error){
    if(error&&error.code===1)return 'Guardado sin GPS: permiso no concedido.';
    if(error&&error.code===3)return 'Guardado sin GPS: la ubicación tardó demasiado.';
    return 'Guardado sin GPS.';
  }

  function captureLocation(){
    return new Promise(resolve=>{
      if(!('geolocation' in navigator)){resolve({location:null,message:'Guardado sin GPS: ubicación no disponible.'});return;}
      navigator.geolocation.getCurrentPosition(position=>resolve({
        location:{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,capturedAt:new Date().toISOString()},
        message:`GPS guardado · precisión aproximada ±${Math.round(position.coords.accuracy)} m.`
      }),error=>resolve({location:null,message:locationErrorMessage(error)}),{enableHighAccuracy:true,timeout:12000,maximumAge:0});
    });
  }

  async function saveIndividual(){
    if(!currentReading||activeScreen!=='individual')return;
    const reading=currentReading;currentReading=null;savingReading=true;stopBluetoothPolling();
    elements.quickSaveButton.disabled=true;elements.quickSaveButton.textContent='Guardando…';
    const gps=await captureLocation();
    individualMeasurements.unshift({
      schemaVersion:1,id:id(),recordType:'individual',crop:'cafe',ph:reading.ph,category:Logic.classify(reading.ph),
      temperatureC:reading.temperatureC,source:reading.source,rawPayload:reading.rawPayload,device:reading.device,
      location:gps.location,recordedAt:new Date().toISOString(),syncState:'local'
    });
    persistIndividuals();renderIndividualHistory();renderHome();elements.quickManualPh.value='';elements.quickGpsStatus.textContent=gps.message;
    elements.quickSaveButton.textContent='Guardar medición';resetIndividualReading();
    elements.quickConfirmation.hidden=false;elements.quickConfirmation.textContent='Medición guardada correctamente.';
    savingReading=false;startBluetoothPolling();
  }

  async function savePoint(){
    if(!currentReading||!draft||draft.points.length>=draft.target)return;
    const reading=currentReading;currentReading=null;savingReading=true;stopBluetoothPolling();
    elements.savePointButton.disabled=true;elements.savePointButton.textContent='Guardando…';
    const gps=await captureLocation();
    draft.points.push({
      id:id(),sequence:draft.points.length+1,ph:reading.ph,temperatureC:reading.temperatureC,source:reading.source,
      rawPayload:reading.rawPayload,device:reading.device,location:gps.location,recordedAt:new Date().toISOString(),syncState:'local'
    });
    persistDraft();elements.gpsStatus.textContent=gps.message;elements.manualPh.value='';elements.savePointButton.textContent='Guardar punto';
    updateCapture();savingReading=false;
    if(draft.points.length<draft.target&&bluetoothCharacteristic){
      setBluetoothStatus('Punto guardado. Obteniendo la lectura del siguiente punto…');startBluetoothPolling();
    }
  }

  function openResult(){
    if(!draft||draft.points.length<draft.target)return;
    const farm=farmById(draft.farmId);const lot=lotById(farm,draft.lotId);const summary=Logic.summarize(draft.points);
    elements.resultLot.textContent=`${farm.name} · ${lot.name} · ${summary.count} puntos`;
    elements.resultPh.textContent=Logic.formatPh(summary.representative);elements.resultCategory.textContent=summary.category;
    elements.resultMarker.style.left=`${Logic.scalePosition(summary.representative)}%`;
    elements.resultRange.textContent=`${Logic.formatPh(summary.minimum)}–${Logic.formatPh(summary.maximum)}`;
    elements.resultAdequate.textContent=`${summary.adequateCount} de ${summary.count}`;
    elements.technicalText.textContent=`Mediana ${Logic.formatPh(summary.representative)} · promedio ${Logic.formatPh(summary.average)} · mínimo ${Logic.formatPh(summary.minimum)} · máximo ${Logic.formatPh(summary.maximum)}.`;
    showScreen('result');
  }

  function saveJourney(){
    if(!draft)return;
    const farm=farmById(draft.farmId);const lot=lotById(farm,draft.lotId);const summary=Logic.summarize(draft.points);
    journeys.unshift({...draft,farmName:farm.name,department:farm.department,municipality:farm.municipality,village:farm.village,lotName:lot.name,areaHa:lot.areaHa,plantingYear:lot.plantingYear,summary,completedAt:new Date().toISOString(),syncState:'local'});
    persistJourneys();draft=null;persistDraft();renderHistory();renderResume();renderHome();showScreen('farms');
  }

  function setConnected(connected){
    [elements.connectionBadge,elements.quickConnectionBadge].forEach(badge=>{
      badge.textContent=connected?'Conectado':'No conectado';badge.classList.toggle('connected',connected);
    });
    [elements.connectButton,elements.quickConnectButton].forEach(button=>{button.hidden=connected;});
    [elements.disconnectButton,elements.quickDisconnectButton].forEach(button=>{button.hidden=!connected;});
  }

  function setBluetoothStatus(message){
    elements.bluetoothStatus.textContent=message;elements.quickBluetoothStatus.textContent=message;
  }

  function handleDisconnected(){
    stopBluetoothPolling();bluetoothCharacteristic=null;setConnected(false);setBluetoothStatus('El medidor se desconectó.');
  }

  function receiveBluetooth(value){
    if(savingReading||(activeScreen!=='capture'&&activeScreen!=='individual'))return;
    const decoded=Logic.decodeReading(value);
    if(!decoded){setBluetoothStatus('Se recibió un paquete que no pudo interpretarse.');return;}
    useReading({...decoded,source:'bluetooth',device:{name:bluetoothDevice&&bluetoothDevice.name?bluetoothDevice.name:'YK-S01',serviceUuid:YINMIK_SERVICE,characteristicUuid:YINMIK_MEASUREMENT}});
    setBluetoothStatus(activeScreen==='individual'?'Lectura recibida. Guarda la medición cuando estés listo.':'Lectura recibida. Guarda el punto cuando estés en la ubicación correcta.');
  }

  function handleNotification(event){receiveBluetooth(event.target.value);}
  function stopBluetoothPolling(){if(bluetoothPollTimer!==null){globalThis.clearInterval(bluetoothPollTimer);bluetoothPollTimer=null;}}
  function captureIsActive(){return activeScreen==='individual'||(activeScreen==='capture'&&draft);}

  async function refreshBluetoothReading(){
    if(!bluetoothCharacteristic||bluetoothReadPending||savingReading||!captureIsActive())return;
    bluetoothReadPending=true;
    try{receiveBluetooth(await bluetoothCharacteristic.readValue());}
    catch(error){
      if(bluetoothDevice&&bluetoothDevice.gatt&&bluetoothDevice.gatt.connected)setBluetoothStatus('Conectado. Esperando la siguiente lectura del medidor…');
    }finally{bluetoothReadPending=false;}
  }

  function startBluetoothPolling(){
    stopBluetoothPolling();if(!bluetoothCharacteristic||savingReading||!captureIsActive())return;
    refreshBluetoothReading();bluetoothPollTimer=globalThis.setInterval(refreshBluetoothReading,2000);
  }

  async function connectBluetooth(){
    if(!('bluetooth' in navigator))return;
    [elements.connectButton,elements.quickConnectButton].forEach(button=>{button.disabled=true;});
    setBluetoothStatus('Selecciona YK-S01 en la ventana Bluetooth…');
    try{
      bluetoothDevice=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'YK-S01'}],optionalServices:[YINMIK_SERVICE]});
      bluetoothDevice.addEventListener('gattserverdisconnected',handleDisconnected);
      const server=await bluetoothDevice.gatt.connect();const service=await server.getPrimaryService(YINMIK_SERVICE);
      bluetoothCharacteristic=await service.getCharacteristic(YINMIK_MEASUREMENT);
      bluetoothCharacteristic.addEventListener('characteristicvaluechanged',handleNotification);
      await bluetoothCharacteristic.startNotifications();setConnected(true);setBluetoothStatus('Conectado. Esperando lectura del medidor…');startBluetoothPolling();
    }catch(error){
      if(bluetoothDevice&&bluetoothDevice.gatt&&bluetoothDevice.gatt.connected)bluetoothDevice.gatt.disconnect();
      setConnected(false);setBluetoothStatus(error&&error.name==='NotFoundError'?'No se seleccionó ningún medidor.':'No fue posible conectar. Verifica que el YK-S01 esté encendido y cerca.');
    }finally{[elements.connectButton,elements.quickConnectButton].forEach(button=>{button.disabled=false;});}
  }

  function disconnectBluetooth(){
    stopBluetoothPolling();
    if(bluetoothCharacteristic)bluetoothCharacteristic.removeEventListener('characteristicvaluechanged',handleNotification);
    if(bluetoothDevice&&bluetoothDevice.gatt&&bluetoothDevice.gatt.connected)bluetoothDevice.gatt.disconnect();else handleDisconnected();
  }

  function initializeBluetooth(){
    setConnected(false);
    setBluetoothStatus('bluetooth' in navigator
      ?'Enciende el YK-S01 y pulsa conectar. En iPhone, abre esta página dentro de Bluefy.'
      :'Bluetooth no está disponible en este navegador. Puedes ingresar el pH manualmente.');
    const unavailable=!(('bluetooth') in navigator);elements.connectButton.disabled=unavailable;elements.quickConnectButton.disabled=unavailable;
  }

  elements.openIndividualButton.addEventListener('click',openIndividual);
  elements.openFarmsButton.addEventListener('click',()=>{renderResume();showScreen('farms');});
  elements.individualBack.addEventListener('click',()=>showScreen('home'));
  elements.setupBack.addEventListener('click',()=>showScreen('home'));
  elements.technicianSelect.addEventListener('change',populateFarms);elements.farmSelect.addEventListener('change',populateLots);elements.lotSelect.addEventListener('change',updatePlan);
  elements.addLotButton.addEventListener('click',()=>openLotForm(null));elements.cancelLotButton.addEventListener('click',resetLotForm);elements.lotForm.addEventListener('submit',saveLot);
  elements.startButton.addEventListener('click',startJourney);elements.resumeButton.addEventListener('click',openCapture);
  elements.captureBack.addEventListener('click',()=>{renderResume();showScreen('farms');});elements.resultBack.addEventListener('click',()=>showScreen('capture'));
  elements.manualButton.addEventListener('click',useManualReading);elements.manualPh.addEventListener('keydown',event=>{if(event.key==='Enter')useManualReading();});
  elements.quickManualButton.addEventListener('click',useQuickManualReading);elements.quickManualPh.addEventListener('keydown',event=>{if(event.key==='Enter')useQuickManualReading();});
  elements.quickSaveButton.addEventListener('click',saveIndividual);elements.savePointButton.addEventListener('click',savePoint);
  elements.finishButton.addEventListener('click',openResult);elements.saveJourneyButton.addEventListener('click',saveJourney);
  [elements.connectButton,elements.quickConnectButton].forEach(button=>button.addEventListener('click',connectBluetooth));
  [elements.disconnectButton,elements.quickDisconnectButton].forEach(button=>button.addEventListener('click',disconnectBluetooth));

  loadData();populateTechnicians();renderIndividualHistory();renderHistory();renderResume();renderHome();initializeBluetooth();showScreen('home');
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))globalThis.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').then(registration=>registration.update()).catch(()=>{}));
})();
