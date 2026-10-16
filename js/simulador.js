(function(){
const $ = id => document.getElementById(id);
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =====================================================================
   NÚMEROS DEL PROTOTIPO · CÁMBIALOS AQUÍ
   Son valores de ejemplo. Los reales salen de calibrar el sensor
   (anotar el número en tierra seca y en tierra empapada) y de medir
   la bomba con un vaso graduado. Al cambiarlos se actualizan solos:
   la simulación, los textos, el código mostrado, el dashboard y la
   tabla de seguimiento.
   ===================================================================== */
const CONFIG = {
  UMBRAL_RIEGO: 35,        // % · si la humedad baja de aquí, empieza a regar
  UMBRAL_PARADA: 50,       // % · si la humedad llega aquí, deja de regar
  SEG_PULSO: 3,            // segundos que la bomba está encendida en cada pulso
  ML_PULSO: 75,            // ml de agua que saca la bomba en un pulso
  MIN_ESPERA: 1,           // minutos que espera después de cada pulso
  MAX_PULSOS: 6,           // pulsos seguidos sin éxito antes de detenerse y avisar
  MIN_ENTRE_MEDIDAS: 60,   // minutos entre mediciones cuando no está regando
  SENSOR_SECO: 3000,       // número del sensor en tierra seca (= 0 %)
  SENSOR_MOJADO: 1300,     // número del sensor en tierra empapada (= 100 %)
  SENSOR_MIN_VALIDO: 900,  // por debajo de esto la lectura es imposible
  SENSOR_MAX_VALIDO: 3600, // por encima de esto la lectura es imposible (sensor suelto)
  DEPOSITO_ML: 1500,       // capacidad del depósito
  DEPOSITO_MIN_ML: 80      // con menos agua no riega (la bomba no debe girar en seco)
};
const C = CONFIG;

/* ---------- Datos de las piezas ---------- */
const PARTS = {
  sensor:{name:'Sensor de humedad capacitivo v1.2', role:'Los ojos del sistema',
    what:'Una plaquita que se clava en la tierra y detecta cuánta agua hay alrededor, sin metal expuesto, por eso no se oxida como los sensores baratos de dos patas.',
    does:'Entrega un voltaje que la placa convierte en un número de 0 a 4095. Al revés de lo que uno espera: más seca la tierra, más alto el número.',
    care:['Hay que calibrarlo: anotar el número en el aire, en tierra seca, en tierra mojada y en agua.','No enterrarlo más allá de la línea blanca: la parte de arriba no es impermeable.','Algunos clones vienen defectuosos: conviene comprar uno de repuesto.'],
    live:()=> S.sensorOk ? `Lee ${S.raw} → ${S.hum} % de humedad` : 'Desconectado: lee 4095 (valor imposible)'},
  placa:{name:'Placa ESP32 (o NodeMCU)', role:'El cerebro',
    what:'Un microcontrolador: una computadora muy pequeña que repite un programa sin parar. Esta versión ya trae Wi-Fi incorporado.',
    does:'Lee el sensor, convierte el número a porcentaje, decide si hay que regar, acciona el relé y envía los datos al dashboard.',
    care:['Trabaja con 3,3 V. Si usan ESP32, el sensor va en un pin GPIO 32–39, que sigue leyendo con el Wi-Fi encendido.','La decisión de regar se toma aquí, no en internet: si se corta el Wi-Fi, el riego sigue.'],
    live:()=> `Etapa actual: ${PH[S.phase].title}`},
  rele:{name:'Módulo relé de 1 canal', role:'El interruptor',
    what:'Un interruptor que se acciona con electricidad. Dentro hay un electroimán que mueve una palanca de metal (por eso hace clic).',
    does:'La placa da una señal muy pequeña; el relé cierra el circuito de la bomba con la corriente de la fuente. Así la placa controla algo que no podría alimentar sola.',
    care:['Muchos relés de 5 V no se activan bien con la señal de 3,3 V de la ESP32: hay que probarlo apenas lo compren.','Alternativa más silenciosa y barata: un transistor MOSFET.'],
    live:()=> S.pumpOn ? 'Cerrado: la corriente pasa a la bomba' : 'Abierto: la bomba no recibe corriente'},
  bomba:{name:'Minibomba sumergible de 5 V', role:'El corazón',
    what:'Un motor pequeño con una hélice, dentro del agua, que empuja el líquido hacia la manguera.',
    does:`Cuando el relé se cierra, gira y manda agua al gotero. En la simulación saca unos ${Math.round(C.ML_PULSO/C.SEG_PULSO)} ml por segundo.`,
    care:['Nunca debe girar sin agua: se calienta y se quema.','Al arrancar pide un pico de corriente que puede reiniciar la placa.','Con pocos segundos de riego alcanza para una maceta.'],
    live:()=> S.pumpOn ? (S.level>0 ? 'Girando: empuja agua' : 'Girando EN SECO') : 'Detenida'},
  deposito:{name:'Depósito de agua', role:'La reserva',
    what:'Un recipiente que, en el prototipo, representa el agua del colegio.',
    does:'Guarda el agua que la bomba envía a la planta. Cada riego baja el nivel.',
    care:['En el proyecto real el agua vendría del grifo (con una electroválvula) o de un tanque de lluvia.','Mejora opcional: un sensor de nivel para avisar antes de que se vacíe.'],
    live:()=> `${Math.round(S.level)} ml de ${C.DEPOSITO_ML} ml`},
  manguera:{name:'Manguera de silicona y gotero', role:'Las venas',
    what:'Una manguera delgada que termina en un gotero junto a la raíz.',
    does:'Lleva el agua directo a la raíz (riego por goteo), así se evapora y desperdicia menos.',
    care:['Comprobar que el diámetro calce en la salida de la bomba antes de comprar.','El agua tarda en llegar hasta el sensor: por eso se riega en pulsos cortos y se espera antes de volver a medir.'],
    live:()=> S.hoseLoose ? 'Suelta: el agua se pierde en la mesa' : (S.pumpOn ? 'Llevando agua al gotero' : 'Sin flujo')},
  fuente:{name:'Fuente USB de 5 V y 2 A', role:'La energía',
    what:'Un cargador de celular común.',
    does:'Alimenta la placa y, a través del relé, la bomba.',
    care:['El arranque de la bomba puede bajar el voltaje y reiniciar la placa: un capacitor de 470 a 1000 µF cerca de la bomba lo evita.','Mejor un cargador que pilas: las pilas se agotan y el voltaje baja.'],
    live:()=> 'Entregando 5 V'},
  dashboard:{name:'Dashboard de monitoreo', role:'La ventana',
    what:'Una página web donde llegan los datos que envía la placa por Wi-Fi.',
    does:'Muestra la humedad, cuándo se regó y cuánta agua se usó. Cualquiera puede ver el estado del huerto desde un celular. Está más abajo, en grande.',
    care:['Hay que comprobar que el Wi-Fi del colegio llegue hasta el huerto.','Las redes con página de login suelen bloquear a la placa. Plan B gratuito: ThingSpeak, Blynk o Arduino IoT Cloud.'],
    live:()=> S.wifi ? `En línea · ${D.recv} datos recibidos` : `Sin conexión · ${S.outbox.length} datos esperando`},
  planta:{name:'Planta y suelo', role:'Lo que queremos cuidar',
    what:'El cajón de cultivo que representa al huerto pedagógico.',
    does:`El sol y la propia planta consumen el agua; la tierra se seca con las horas. El sistema la mantiene entre ${C.UMBRAL_RIEGO} % y ${C.UMBRAL_PARADA} %.`,
    care:['Cada especie necesita distinta humedad: el umbral depende de las plantas que tenga el huerto.','Regar de más también daña: las raíces se pudren sin aire.'],
    live:()=> `Humedad ${Math.round(S.m)} % · ${stateWord(S.m)}`}
};
const ORDER = ['planta','sensor','placa','rele','bomba','deposito','manguera','fuente','dashboard'];
const SHORT = {planta:'Planta',sensor:'Sensor',placa:'Placa',rele:'Relé',bomba:'Bomba',deposito:'Depósito',manguera:'Manguera',fuente:'Fuente',dashboard:'Dashboard'};

/* ---------- Números en los textos de la página ---------- */
document.querySelectorAll('[data-cfg]').forEach(e=>{ e.textContent=C[e.dataset.cfg]; });
document.querySelectorAll('[data-cfg-left]').forEach(e=>{ e.style.left=C[e.dataset.cfgLeft]+'%'; });

/* ---------- Código ---------- */
const pad = (s,n) => s + ' '.repeat(Math.max(1,n-s.length));
const CODE = [
  ['// Números de ejemplo: se cambian solo aquí arriba'],
  [pad(`const int SECO = ${C.SENSOR_SECO};`,40),'// sensor en tierra seca = 0 %'],
  [pad(`const int MOJADO = ${C.SENSOR_MOJADO};`,40),'// sensor en tierra empapada = 100 %'],
  [pad(`const int UMBRAL_RIEGO = ${C.UMBRAL_RIEGO};`,40),'// % : empieza a regar'],
  [pad(`const int UMBRAL_PARADA = ${C.UMBRAL_PARADA};`,40),'// % : deja de regar'],
  [pad(`const int MAX_PULSOS = ${C.MAX_PULSOS};`,40),'// pulsos seguidos como máximo'],
  ['bool regando = false;  int pulsos = 0;'],
  [''],
  ['void setup() {'],
  ['  pinMode(RELE, OUTPUT);','','boot'],
  ['  conectarWiFi();','','boot'],
  ['}'],
  [''],
  ['void loop() {'],
  ['  int raw = analogRead(SENSOR);','// leer el sensor','measure'],
  ['  int hum = map(raw, SECO, MOJADO, 0, 100);','// pasar a %','measure'],
  ['  hum = constrain(hum, 0, 100);','// ni menos de 0 ni más de 100','measure'],
  [`  if (raw > ${C.SENSOR_MAX_VALIDO} || raw < ${C.SENSOR_MIN_VALIDO}) {`,'// ¿sensor suelto?','decide'],
  ['    alerta("Revisar sensor");','','a-sensor'],
  ['  } else {'],
  ['    if (hum < UMBRAL_RIEGO)  regando = true;','// muy seca: empezar','decide'],
  ['    if (hum >= UMBRAL_PARADA) regando = false;','// suficiente: parar','decide'],
  ['    if (regando && hayAgua() && pulsos < MAX_PULSOS) {','','decide a-agua a-max'],
  ['      digitalWrite(RELE, HIGH);','// encender bomba','pump'],
  ['      enviarDashboard(hum, "regando");','// si hay Wi-Fi','pump'],
  [`      delay(${C.SEG_PULSO*1000});`,`// regar ${C.SEG_PULSO} s`,'pump'],
  ['      digitalWrite(RELE, LOW);','// apagar bomba','soak'],
  [`      delay(${C.MIN_ESPERA*60000});`,`// esperar ${C.MIN_ESPERA} min`,'soak'],
  ['      pulsos++; return;','// volver a medir','soak'],
  ['    }'],
  ['  }'],
  ['  pulsos = 0;','','report'],
  ['  enviarDashboard(hum);','// si hay Wi-Fi','report'],
  [`  delay(${C.MIN_ENTRE_MEDIDAS*60000});`,`// esperar ${C.MIN_ENTRE_MEDIDAS} min`,'idle'],
  ['}']
];
const codeEl = $('code');
CODE.forEach(([t,c,tag])=>{
  const s=document.createElement('span'); s.textContent=t||' ';
  if(c){ const e=document.createElement('em'); e.textContent='  '+c; s.appendChild(e); }
  s.dataset.tag = tag||''; codeEl.appendChild(s);
});

/* ---------- Estado ---------- */
// S = lo que pasa en la placa y en el huerto. D = lo que el dashboard ya recibió. TR = tabla de seguimiento.
let S, D, TR, paused=false, stepMode=false, speed=1, selected='sensor';
function fresh(){
  return {m:26,pending:0,level:1200,used:0,waste:0,regando:false,pulses:0,phase:'boot',t:0,clock:7*60,day:0,
    raw:2558,hum:26,hasRead:false,outbox:[],cur:null,riegoId:0,pumpStart:0,alarm:null,next:'report',pumpOn:false,
    wifi:true,sensorOk:true,hoseLoose:false,decText:'',spin:0,flow:0};
}
function freshDash(){ return {points:[],riegos:new Map(),lastC:null,lastHum:null,bomba:false,alert:null,recv:0,ver:0}; }
function freshTrace(){ return {rows:[],ver:0}; }
const PH = {
  boot:{title:'Arranque',dur:3.2,step:1,hot:['fuente','placa']},
  measure:{title:'Medir',dur:2.4,step:2,hot:['sensor','placa']},
  decide:{title:'Decidir',dur:2.8,step:3,hot:['placa']},
  pump:{title:'Regar',dur:3,step:4,hot:['rele','bomba','manguera']},
  soak:{title:'Esperar',dur:3.2,step:4,hot:['planta','sensor']},
  alarm:{title:'Alerta',dur:4,step:3,hot:[]},
  report:{title:'Reportar',dur:2.6,step:5,hot:['placa','dashboard']},
  idle:{title:`Pasa ${C.MIN_ENTRE_MEDIDAS===60?'1 hora':C.MIN_ENTRE_MEDIDAS+' min'}`,dur:3.6,step:0,hot:['planta']}
};

function fmt(c){ const m=Math.floor(c)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function clockStr(){ return fmt(S.clock); }
function stateWord(m){ return m<25?'marchitándose':m<C.UMBRAL_RIEGO?'seca':m<=60?'bien':m<=80?'muy húmeda':'encharcada'; }
function log(msg,alert){
  const li=document.createElement('li'); if(alert) li.className='a';
  const t=document.createElement('time'); t.textContent=clockStr();
  const s=document.createElement('span'); s.textContent=msg;
  li.append(t,s); const L=$('log'); L.prepend(li); while(L.children.length>40) L.lastChild.remove();
}

function readSensor(){
  S.hasRead=true;
  if(!S.sensorOk){ S.raw=4095; S.hum=0; return; }
  const span=C.SENSOR_SECO-C.SENSOR_MOJADO;
  S.raw=Math.round(C.SENSOR_SECO - S.m*span/100 + (Math.random()*30-15));
  // igual que map() de Arduino: trabaja con enteros y descarta los decimales
  S.hum=Math.max(0,Math.min(100,Math.trunc((S.raw-C.SENSOR_SECO)*100/(C.SENSOR_MOJADO-C.SENSOR_SECO))));
}
function decide(){
  S.alarm=null;
  if(S.raw>C.SENSOR_MAX_VALIDO||S.raw<C.SENSOR_MIN_VALIDO){ S.alarm='sensor'; S.next='alarm';
    S.decText='Lectura imposible: el sensor está desconectado.'; return; }
  const was=S.regando;
  if(S.hum<C.UMBRAL_RIEGO) S.regando=true;
  if(S.hum>=C.UMBRAL_PARADA) S.regando=false;
  if(S.regando){
    if(S.level<C.DEPOSITO_MIN_ML){ S.alarm='agua'; S.next='alarm'; S.regando=false; return; }
    if(S.pulses>=C.MAX_PULSOS){ S.alarm='max'; S.next='alarm'; S.regando=false; return; }
    S.next='pump';
    S.decText = S.hum<C.UMBRAL_RIEGO ? `${S.hum} % es menor que ${C.UMBRAL_RIEGO} %: la tierra está seca, toca regar.`
                         : `${S.hum} % todavía no llega a ${C.UMBRAL_PARADA} %: da otro pulso de riego.`;
  } else {
    S.next='report';
    S.decText = was ? `${S.hum} %: llegó a ${C.UMBRAL_PARADA} %, suficiente. Deja de regar.`
                    : `${S.hum} % está por encima de ${C.UMBRAL_RIEGO} %: la tierra está bien, no hace falta regar.`;
  }
}

/* ---------- Envío al dashboard (solo llega si hay Wi-Fi) ---------- */
function send(msg){ S.outbox.push(msg); if(S.wifi) flush(); }
function flush(){
  const n=S.outbox.length;
  if(n>1) log(`Volvió el Wi-Fi: envía ${n-1} dato(s) guardados`);
  S.outbox.forEach(receive); S.outbox=[];
}
function receive(m){
  D.recv++; D.ver++; D.lastC=m.c;
  if(m.hum!=null){
    const lp=D.points[D.points.length-1];
    if(!lp || lp.c!==m.c) D.points.push({c:m.c,hum:m.hum}); else lp.hum=m.hum;
    D.lastHum=m.hum;
  }
  if(m.k==='bomba') D.bomba=true; else D.bomba=false;
  if(m.r) D.riegos.set(m.r.id,m.r);
  if(m.k==='lectura') D.alert=m.alerta?{c:m.c,tipo:m.alerta}:null;
  const keep=Math.floor(S.clock/1440)*1440-1440;
  while(D.points.length && D.points[0].c<keep) D.points.shift();
  D.riegos.forEach((r,id)=>{ if(r.c<keep) D.riegos.delete(id); });
}
function report(){
  send({k:'lectura',c:S.clock,hum:S.sensorOk?S.hum:null,alerta:S.alarm});
  S.pulses=0;
}

/* ---------- Riegos (un riego = varios pulsos seguidos hasta llegar al límite) ---------- */
function startRiego(){ S.cur={id:++S.riegoId,c:S.clock,antes:S.hum,pulsos:0,ml:0,despues:null,fin:null}; }
function endRiego(motivo){
  if(!S.cur) return;
  S.cur.despues=S.hum; S.cur.fin=motivo;
  send({k:'fin',c:S.clock,hum:S.hum,r:{...S.cur}});
  log(`Riego ${S.cur.id} terminado: ${S.cur.pulsos} pulso(s), ${Math.round(S.cur.ml)} ml, ${S.cur.antes} % → ${S.hum} %`, motivo!=='ok');
  S.cur=null;
}

/* ---------- Tabla de seguimiento ---------- */
function trRow(){ return TR.rows[TR.rows.length-1]; }
function traceMeasure(){
  TR.rows.push({c:S.clock,raw:S.raw,hum:S.hum,ok:S.sensorOk,lt:null,ge:null,reg:null,pul:S.pulses,dec:'…',tipo:'',envio:''});
  if(TR.rows.length>60) TR.rows.shift();
  TR.ver++;
}
function traceDecide(was){
  const r=trRow(); if(!r) return;
  r.reg=S.regando; r.pul=S.pulses;
  if(S.alarm==='sensor'){ r.dec='Alerta: revisar sensor'; r.tipo='alerta'; TR.ver++; return; }
  r.lt=S.hum<C.UMBRAL_RIEGO; r.ge=S.hum>=C.UMBRAL_PARADA;
  if(S.alarm==='agua'){ r.dec='Alerta: sin agua, no riega'; r.tipo='alerta'; }
  else if(S.alarm==='max'){ r.dec=`Alerta: ${C.MAX_PULSOS} pulsos, deja de regar`; r.tipo='alerta'; }
  else if(S.next==='pump'){ r.dec=`Regar ${C.SEG_PULSO} s`; r.tipo='riega'; }
  else if(was){ r.dec='Dejar de regar'; r.tipo='para'; }
  else { r.dec='No regar'; r.tipo='no'; }
  TR.ver++;
}

function enter(ph){
  S.phase=ph; S.t=0;
  if(ph==='measure'){ readSensor(); traceMeasure(); }
  if(ph==='decide'){
    const was=S.regando; decide(); traceDecide(was);
    if(S.next==='pump' && !S.cur) startRiego();
    if(!S.regando && S.cur && S.alarm!=='sensor') endRiego(S.alarm||'ok');
  }
  if(ph==='pump'){
    S.pumpStart=S.used; log(`Pulso de riego ${S.pulses+1} (${C.SEG_PULSO} s)`);
    send({k:'bomba',c:S.clock,hum:S.hum});
    const r=trRow(); if(r){ r.dec=`Regar ${C.SEG_PULSO} s · pulso ${S.pulses+1}`; TR.ver++; }
  }
  if(ph==='soak'){
    S.pulses++;
    if(S.cur){ S.cur.pulsos++; S.cur.ml+=S.used-S.pumpStart; send({k:'pulso',c:S.clock,r:{...S.cur}}); }
    const r=trRow(); if(r){ r.pul=S.pulses; TR.ver++; }
  }
  if(ph==='alarm'){
    const msg={sensor:'Alerta: sensor desconectado, no riega',agua:'Alerta: depósito casi vacío, no riega',max:`Alerta: ${C.MAX_PULSOS} pulsos sin resultado, deja de regar`}[S.alarm];
    log(msg,true);
  }
  if(ph==='report'){
    report();
    log(!S.sensorOk?'Envía el aviso “Revisar sensor”':S.wifi?`Envía ${S.hum} % al dashboard`:`Sin Wi-Fi: guarda ${S.hum} % para enviarlo después`);
    const r=trRow(); if(r){ r.envio=S.wifi?'dato enviado al dashboard':'sin Wi-Fi: dato guardado'; TR.ver++; }
  }
  if(ph==='boot'){ log('Se enciende la placa y se conecta al Wi-Fi'); }
  if(stepMode){ paused=true; syncPlay(); }
}
function nextPhase(){
  const p=S.phase;
  if(p==='boot') return 'measure';
  if(p==='measure') return 'decide';
  if(p==='decide') return S.next;
  if(p==='pump') return 'soak';
  if(p==='soak') return 'measure';
  if(p==='alarm') return 'report';
  if(p==='report') return 'idle';
  return 'measure';
}

function update(dt){
  const ph=PH[S.phase];
  S.t+=dt;
  S.pumpOn = S.phase==='pump';
  if(S.pumpOn){
    S.spin+=dt*900;
    const left=C.ML_PULSO-(S.used-S.pumpStart);
    if(S.level>0 && left>0){ const f=Math.min(S.level,left,C.ML_PULSO/ph.dur*dt); S.level-=f; S.used+=f;
      if(S.hoseLoose) S.waste+=f; else S.pending+=f; S.flow=1; }
    else S.flow= S.level>0 ? 1 : 0;
    S.clock+=dt*(C.SEG_PULSO/60)/ph.dur;
  } else S.flow=0;
  // el agua se va absorbiendo
  const tr=S.pending*(1-Math.exp(-dt*0.85)); S.pending-=tr; S.m+=tr/6;
  if(S.phase==='idle'){ S.m-=dt*(4*C.MIN_ENTRE_MEDIDAS/60)/ph.dur; S.clock+=dt*C.MIN_ENTRE_MEDIDAS/ph.dur; }
  if(S.phase==='soak'){ S.clock+=dt*C.MIN_ESPERA/ph.dur; S.m-=dt*0.05; }
  S.m=Math.max(0,Math.min(100,S.m));
  const day=Math.floor(S.clock/1440);
  if(day!==S.day){ S.day=day; log('Medianoche: empieza un día nuevo y el dashboard cuenta desde cero'); }
  if(S.t>=ph.dur) enter(nextPhase());
}

/* ---------- Dibujo ---------- */
const LEAVES=[{x:181,y:286,b:-150,s:-1},{x:183,y:262,b:-20,s:1},{x:184,y:236,b:-160,s:-1},{x:183,y:212,b:-35,s:1},{x:182,y:198,b:-95,s:0}];
const leafG=$('leaves');
LEAVES.forEach(()=>{ const p=document.createElementNS('http://www.w3.org/2000/svg','path');
  p.setAttribute('d','M0 0 C 14 -15, 40 -15, 54 0 C 40 11, 14 11, 0 0 Z'); leafG.appendChild(p); });
function lerp(a,b,t){return a+(b-a)*t}
function mix(c1,c2,t){ const a=c1.match(/\w\w/g).map(h=>parseInt(h,16)), b=c2.match(/\w\w/g).map(h=>parseInt(h,16));
  return '#'+a.map((v,i)=>Math.round(lerp(v,b[i],t)).toString(16).padStart(2,'0')).join(''); }
const paths={data:$('w-data'),ctrl:$('w-ctrl'),net:$('w-net')};
const lens={}; for(const k in paths) lens[k]=paths[k].getTotalLength();
function dotOn(k,p){ const pt=paths[k].getPointAtLength(lens[k]*Math.max(0,Math.min(1,p))); const d=$('dot'); d.setAttribute('cx',pt.x); d.setAttribute('cy',pt.y); d.setAttribute('opacity',1); }

const stepsEl=[...document.querySelectorAll('.step')];
const codeLines=[...codeEl.children];
const comps=[...document.querySelectorAll('.comp')];
let flowOff=0, lastNarr='';

function narration(){
  const h=S.hum, a=S.alarm;
  switch(S.phase){
    case 'boot': return 'Se enchufa la fuente de 5 V. La placa ESP32 se enciende, prepara el pin del relé y se conecta al Wi-Fi.';
    case 'measure': return S.sensorOk ? `La placa lee el sensor: valor crudo ${S.raw}, que equivale a ${h} % de humedad.` : 'La placa lee el sensor, pero recibe 4095: el máximo posible. Eso no es una medida real.';
    case 'decide': return S.decText || 'La placa compara la humedad con los límites.';
    case 'pump': return S.hoseLoose ? 'La placa activa el relé y la bomba empuja agua… pero la manguera está suelta: el agua cae en la mesa y la tierra sigue seca.' :
      (S.level>0 ? `La placa activa el relé (¡clic!). El relé cierra el circuito y la bomba empuja agua por la manguera durante ${C.SEG_PULSO} s, unos ${C.ML_PULSO} ml.` : 'La bomba gira sin agua: se puede quemar.');
    case 'soak': return `La bomba se apaga. El agua tarda en llegar hasta el sensor, por eso la placa espera ${C.MIN_ESPERA} minuto antes de volver a medir.`;
    case 'alarm':
      if(a==='sensor') return 'Alerta: lectura imposible, el sensor está desconectado. Sin esta revisión, la placa creería que la tierra está totalmente seca y regaría sin parar. No riega y avisa.';
      if(a==='agua') return 'Alerta: el depósito casi no tiene agua. Si la bomba gira en seco se quema, así que no riega y pide rellenar. (Necesita un sensor de nivel: mejora opcional.)';
      return `Alerta: ya dio ${C.MAX_PULSOS} pulsos y la tierra sigue seca. Algo anda mal (manguera suelta, sensor fuera de la tierra), así que deja de regar y avisa.`;
    case 'report': return S.wifi ? `Envía ${h} % al dashboard por Wi-Fi. Así cualquiera puede ver el estado del huerto desde un celular.` :
      `No hay Wi-Fi. El riego funciona igual porque la decisión se toma en la placa; el dato (${h} %) se guarda y se envía cuando vuelva la conexión.`;
    case 'idle': return 'Pasa una hora. El sol y la planta consumen agua y la tierra se va secando. La placa volverá a medir.';
  }
  return '';
}

/* ---------- Explicación en palabras de la fila actual ---------- */
const num = (n,d=1) => (Math.round(n*10**d)/10**d).toLocaleString('es');
const crudoDe = p => Math.round(C.SENSOR_SECO - p*(C.SENSOR_SECO-C.SENSOR_MOJADO)/100);
$('equiv').innerHTML = `0 % = ${C.SENSOR_SECO} · <b>${C.UMBRAL_RIEGO} % = ${crudoDe(C.UMBRAL_RIEGO)}</b> · <b>${C.UMBRAL_PARADA} % = ${crudoDe(C.UMBRAL_PARADA)}</b> · 100 % = ${C.SENSOR_MOJADO}. `+
  `Si el sensor marca <b>más de ${crudoDe(C.UMBRAL_RIEGO)}</b>, la humedad está bajo ${C.UMBRAL_RIEGO} % y empieza a regar. Si marca <b>${crudoDe(C.UMBRAL_PARADA)} o menos</b>, llegó a ${C.UMBRAL_PARADA} % y deja de regar.`;
const yn = b =>b?'<span class="yn si">Sí</span>':'<span class="yn no">No</span>';
const v = n => `<i class="var">${n}</i>`;
function explain(){
  const r=trRow(), h=S.hum, U=C.UMBRAL_RIEGO, P=C.UMBRAL_PARADA;
  switch(S.phase){
    case 'boot': return ['La placa se enciende. Deja listo el cable que da la orden al relé (el interruptor de la bomba) y se conecta al Wi-Fi.','Todavía no midió nada: la tabla empieza vacía.'];
    case 'measure':
      if(!S.sensorOk) return ['Se escribe una fila nueva. La placa lee el sensor y recibe <b>4095</b>: el número más alto posible.','Eso no es una medida real. Lo más probable es que el cable del sensor esté suelto.'];
      {
        const per=(C.SENSOR_SECO-C.SENSOR_MOJADO)/100, dif=C.SENSOR_SECO-S.raw, exacto=dif/per;
        const L=[`Se escribe una fila nueva. La placa lee el sensor: marcó <b>${S.raw}</b>. Lo guarda en la cajita ${v('raw')}.`,
          `Ojo: con este sensor, un número más alto significa tierra más seca. ${C.SENSOR_SECO} es 0 % (tierra seca) y ${C.SENSOR_MOJADO} es 100 % (empapada).`,
          `La cuenta: ${C.SENSOR_SECO} − ${S.raw} = <b>${dif}</b>. Cada <b>${num(per)}</b> puntos del sensor es 1 % de humedad, entonces ${dif} ÷ ${num(per)} = <b>${num(exacto,2)}</b>.`];
        if(exacto<0) L.push(`Da menos de 0, así que se queda en <b>0 %</b>. Lo guarda en ${v('hum')}.`);
        else if(exacto>100) L.push(`Da más de 100, así que se queda en <b>100 %</b>. Lo guarda en ${v('hum')}.`);
        else L.push(`La placa trabaja con números enteros: descarta los decimales y guarda <b>${h} %</b> en ${v('hum')}.`);
        return L;
      }
    case 'decide': {
      if(S.alarm==='sensor') return [`Primero revisa si la lectura es posible: tiene que estar entre ${C.SENSOR_MIN_VALIDO} y ${C.SENSOR_MAX_VALIDO}.`,
        `¿${S.raw} está en ese rango? ${yn(false)} La placa no confía en el dato: <b>no riega</b> y avisa “Revisar sensor”.`,
        'Sin esta revisión creería que la tierra está totalmente seca y regaría sin parar.'];
      const L=[`Primero revisa si la lectura es posible (entre ${C.SENSOR_MIN_VALIDO} y ${C.SENSOR_MAX_VALIDO}): ${yn(true)} Ahora compara con los dos límites.`,
        `¿${h} es menor que ${U}? ${yn(r.lt)} ${r.lt?`La tierra está seca: ${v('regando')} pasa a <b>sí</b>.`:'Esta regla no cambia nada.'}`,
        `¿${h} es mayor o igual a ${P}? ${yn(r.ge)} ${r.ge?`Ya hay suficiente agua: ${v('regando')} pasa a <b>no</b>.`:'Esta regla no cambia nada.'}`];
      if(!r.lt && !r.ge) L.push(`Ninguna regla cambió nada, así que ${v('regando')} sigue como estaba: <b>${S.regando?'sí':'no'}</b>.`+(S.regando?` (Empezó a regar en una medición anterior y sigue hasta llegar a ${P} %.)`:''));
      if(S.alarm==='agua') L.push('Quiere regar, pero el depósito casi no tiene agua. Si la bomba gira sin agua se quema. Decisión: <b>no regar y avisar</b>.');
      else if(S.alarm==='max') L.push(`Quiere regar, pero ya dio ${C.MAX_PULSOS} pulsos seguidos y la humedad no llegó a ${P} %. Algo anda mal (¿manguera suelta? ¿sensor fuera de la tierra?). Decisión: <b>dejar de regar y avisar</b>.`);
      else if(S.next==='pump') L.push(`Está regando, hay agua en el depósito y lleva ${S.pulses} de ${C.MAX_PULSOS} pulsos posibles. Decisión: <b>regar</b>.`);
      else if(r.tipo==='para') L.push('Decisión: <b>dejar de regar</b>. Ahora envía el dato.');
      else L.push('No hace falta regar. Decisión: <b>no regar</b>. Ahora envía el dato.');
      return L;
    }
    case 'pump': {
      const L=[`Enciende el relé por <b>${C.SEG_PULSO} segundos</b>. El relé es un interruptor: deja pasar la corriente de la fuente hacia la bomba.`,
        `La bomba manda unos <b>${C.ML_PULSO} ml</b> de agua por la manguera hasta el gotero.`];
      if(S.hoseLoose) L.push('Pero la manguera está suelta: el agua cae a la mesa y la tierra no se moja.');
      L.push(S.wifi?'También avisa al dashboard: “bomba encendida”.':'No hay Wi-Fi: el aviso queda guardado en la placa. El riego sigue igual.');
      return L; }
    case 'soak': return ['Apaga el relé: la bomba se detiene.',
      `Espera ${C.MIN_ESPERA} minuto. El agua tarda en bajar hasta el sensor: si midiera enseguida, todavía no la notaría.`,
      `La cajita ${v('pulsos')} sube a <b>${S.pulses}</b> (como máximo ${C.MAX_PULSOS} seguidos).`,
      'Después vuelve al principio y mide otra vez: eso escribe una fila nueva.'];
    case 'alarm':
      if(S.alarm==='sensor') return ['Muestra la alerta “Revisar sensor” y no riega.','El riego automático queda en espera hasta que el sensor dé una lectura posible.'];
      if(S.alarm==='agua') return ['Muestra la alerta “Depósito vacío” y no riega.','Alguien tiene que rellenar el depósito.'];
      return [`Muestra la alerta “${C.MAX_PULSOS} pulsos sin resultado” y deja de regar.`,'Alguien tiene que revisar la manguera y el sensor.'];
    case 'report': return [
      !S.sensorOk ? (S.wifi?'Envía al dashboard el aviso “Revisar sensor” (no hay humedad confiable para mostrar).':'No hay Wi-Fi: guarda el aviso para enviarlo después.')
        : S.wifi ? `Envía <b>${h} %</b> al dashboard por Wi-Fi.` : `No hay Wi-Fi: guarda el dato (${h} %) en la placa y lo enviará cuando vuelva la conexión. El riego no se detiene por esto.`,
      `La cajita ${v('pulsos')} vuelve a <b>0</b>: el próximo riego empieza a contar desde cero.`];
    case 'idle': return [`Espera ${C.MIN_ENTRE_MEDIDAS===60?'1 hora':C.MIN_ENTRE_MEDIDAS+' minutos'} sin hacer nada.`,
      'Mientras tanto el sol y la planta usan el agua: la tierra se va secando.',
      'Después vuelve al principio del programa y mide otra vez (fila nueva).'];
  }
  return [];
}

/* ---------- Tabla de seguimiento: dibujo ---------- */
const traceBody=$('traceBody'), traceWrap=$('traceWrap');
let traceVerShown=-1, explainShown='', varsPrev={};
function cell(v){ return v==null ? '<span class="dash-mute">—</span>' : yn(v); }
function renderTrace(){
  if(TR.ver!==traceVerShown){
    traceVerShown=TR.ver;
    const atBottom = traceWrap.scrollHeight-traceWrap.scrollTop-traceWrap.clientHeight < 40;
    traceBody.innerHTML = TR.rows.map((r,i)=>{
      const now=i===TR.rows.length-1;
      return `<tr class="${now?'now':''} t-${r.tipo}">
        <td class="mono" data-l="Hora">${fmt(r.c)}</td>
        <td class="mono" data-l="Valor crudo del sensor">${r.ok?r.raw:'4095 <span class="warn-t">(!)</span>'}</td>
        <td class="mono" data-l="Humedad %">${r.ok?r.hum+' %':'<span class="dash-mute">—</span>'}</td>
        <td data-l="¿Humedad < ${C.UMBRAL_RIEGO} %?">${r.dec==='…'?'<span class="dash-mute">…</span>':cell(r.lt)}</td>
        <td data-l="¿Humedad ≥ ${C.UMBRAL_PARADA} %?">${r.dec==='…'?'<span class="dash-mute">…</span>':cell(r.ge)}</td>
        <td data-l="¿Está regando?">${r.reg==null?'<span class="dash-mute">…</span>':yn(r.reg)}</td>
        <td class="mono" data-l="Pulsos">${r.pul}</td>
        <td class="dec" data-l="Decisión"><b>${r.dec}</b>${r.envio?`<small>${r.envio}</small>`:''}</td></tr>`;
    }).join('') || `<tr><td colspan="8" class="empty-row">La tabla se llena cuando la placa hace su primera medición.</td></tr>`;
    if(atBottom || TR.rows.length<=1) traceWrap.scrollTop=traceWrap.scrollHeight;
    $('traceCount').textContent = TR.rows.length ? `${TR.rows.length} fila(s)` : '';
  }
  const ex=explain(), key=S.phase+'|'+TR.ver+'|'+ex.join('');
  if(key!==explainShown){
    explainShown=key;
    $('exList').innerHTML=ex.map(t=>`<li>${t}</li>`).join('');
    $('exHead').textContent=`${clockStr()} · ${PH[S.phase].title}`;
  }
  $('explain').classList.toggle('alert',S.phase==='alarm');
  // cajitas de la memoria
  const vals = S.hasRead ? {raw:S.sensorOk?S.raw:'4095 (!)',hum:S.sensorOk?S.hum+' %':'—',regando:S.regando?'sí':'no',pulsos:S.pulses}
                         : {raw:'—',hum:'—',regando:S.regando?'sí':'no',pulsos:S.pulses};
  for(const k in vals){
    if(varsPrev[k]!==vals[k]){
      const box=$('v-'+k); box.querySelector('.vv').textContent=vals[k];
      if(varsPrev[k]!==undefined && !reduce){ box.classList.remove('chg'); void box.offsetWidth; box.classList.add('chg'); }
      varsPrev[k]=vals[k];
    }
  }
}

/* ---------- Dashboard: dibujo ---------- */
const chart=$('chart'), tip=$('chartTip');
let dashKey='', chartPts=[], chartGeo=null;
function todayStart(){ return Math.floor(S.clock/1440)*1440; }
function renderDash(){
  const W=Math.round(chart.getBoundingClientRect().width)||600;
  const key=[D.ver,S.wifi,S.outbox.length,Math.floor(S.clock/5),W].join('|');
  if(key===dashKey) return; dashKey=key;
  const t0=todayStart();
  const riegos=[...D.riegos.values()].filter(r=>r.c>=t0).sort((a,b)=>a.c-b.c);
  const pulsos=riegos.reduce((s,r)=>s+r.pulsos,0), ml=riegos.reduce((s,r)=>s+r.ml,0);
  const enCurso=riegos.some(r=>!r.fin);
  // conexión
  const conn=$('dConn');
  conn.textContent = !S.wifi ? 'Sin conexión' : S.outbox.length ? 'Poniéndose al día…' : 'En línea';
  conn.className='conn '+(!S.wifi?'off':'on');
  const off=$('dOffline'); off.hidden=S.wifi;
  if(!S.wifi) off.textContent = `Sin conexión desde las ${D.lastC!=null?fmt(D.lastC):'--:--'}. Lo que ves es el último dato que llegó. La placa sigue midiendo y regando, y guarda ${S.outbox.length} dato(s) para enviarlos cuando vuelva el Wi-Fi.`;
  const al=$('dAlert'); al.hidden=!D.alert;
  if(D.alert) al.textContent = `Aviso de las ${fmt(D.alert.c)}: `+({sensor:'revisar el sensor (lectura imposible).',agua:'rellenar el depósito.',max:`${C.MAX_PULSOS} pulsos sin que suba la humedad: revisar la manguera y el sensor.`}[D.alert.tipo]);
  // números grandes
  $('kRiegos').textContent=riegos.length;
  $('kRiegosSub').textContent = !riegos.length ? 'todavía no se regó hoy' : enCurso ? 'uno está en curso' : `${pulsos} pulso(s) en total`;
  $('kAgua').textContent=Math.round(ml)+' ml';
  $('kAguaSub').textContent = pulsos ? `${pulsos} pulso(s) de unos ${C.ML_PULSO} ml` : 'nada todavía';
  // estado actual
  $('sHum').textContent = D.lastHum!=null ? D.lastHum+' %' : (D.alert&&D.alert.tipo==='sensor'?'sin dato':'--');
  $('sHumW').textContent = D.lastHum!=null ? stateWord(D.lastHum) : '';
  $('sPump').textContent = D.bomba?'Encendida':'Apagada';
  $('sPump').className = D.bomba?'st-on':'';
  $('sWifi').textContent = S.wifi?'Conectado':'Sin conexión';
  $('sWifi').className = S.wifi?'':'st-off';
  $('sLast').textContent = D.lastC!=null ? fmt(D.lastC) : '--';
  $('dStatus').classList.toggle('stale',!S.wifi);
  // tabla de riegos
  const motivo={ok:`llegó a ${C.UMBRAL_PARADA} %`,agua:'paró: sin agua',max:`paró: ${C.MAX_PULSOS} pulsos`};
  $('riegoBody').innerHTML = riegos.map((r,i)=>`<tr${r.fin?'':' class="now"'}>
      <td class="mono" data-l="Riego">${i+1}</td><td class="mono" data-l="Hora">${fmt(r.c)}</td><td class="mono" data-l="Pulsos">${r.pulsos}</td>
      <td class="mono" data-l="Agua"><b>${Math.round(r.ml)} ml</b></td><td class="mono" data-l="Humedad antes">${r.antes} %</td>
      <td class="mono" data-l="Humedad después">${r.despues!=null?r.despues+' %':'…'}</td>
      <td data-l="Resultado">${r.fin?`<span class="tag ${r.fin==='ok'?'ok':'bad'}">${motivo[r.fin]}</span>`:'<span class="tag run">regando…</span>'}</td></tr>`).join('');
  $('riegoFoot').innerHTML = riegos.length ? `<tr><td colspan="3" class="foot-l">Total de hoy</td><td class="mono" data-l="Total de hoy"><b>${Math.round(ml)} ml</b></td><td colspan="3" class="foot-pad"></td></tr>` : '';
  $('riegoEmpty').hidden = riegos.length>0;
  drawChart(W,riegos,t0);
}
function drawChart(W,riegos,t0){
  const H = W<520 ? 210 : 250;
  chart.setAttribute('viewBox',`0 0 ${W} ${H}`); chart.style.height=H+'px';
  const Lp=40,Rp=14,Tp=26,Bp=26, pw=W-Lp-Rp, ph=H-Tp-Bp;
  const X=c=>Lp+(c-t0)/1440*pw, Y=h=>Tp+(1-h/100)*ph;
  const U=C.UMBRAL_RIEGO, P=C.UMBRAL_PARADA;
  let s=`<rect class="c-band" x="${Lp}" y="${Y(P)}" width="${pw}" height="${Y(U)-Y(P)}"/>`;
  [0,25,50,75,100].forEach(h=>{ s+=`<line class="c-grid" x1="${Lp}" x2="${Lp+pw}" y1="${Y(h)}" y2="${Y(h)}"/><text class="c-ax" x="${Lp-6}" y="${Y(h)+4}" text-anchor="end">${h}</text>`; });
  const step = W<520 ? 360 : 180;
  for(let m=0;m<=1440;m+=step){ s+=`<text class="c-ax" x="${X(t0+m)}" y="${H-8}" text-anchor="${m===0?'start':m===1440?'end':'middle'}">${String(m/60).padStart(2,'0')}:00</text>`; }
  // franja sin conexión
  const now=S.clock;
  if(!S.wifi && D.lastC!=null){ const a=X(Math.max(t0,D.lastC)), b=X(now);
    if(b>a+1) s+=`<rect class="c-off" x="${a}" y="${Tp}" width="${b-a}" height="${ph}"/>`+(b-a>70?`<text class="c-offt" x="${(a+b)/2}" y="${Tp+14}" text-anchor="middle">sin conexión</text>`:''); }
  // riegos: línea vertical + gota
  riegos.forEach(r=>{ const x=X(r.c);
    s+=`<line class="c-riego" x1="${x}" x2="${x}" y1="${Tp-4}" y2="${Tp+ph}"/><path class="c-drop" d="M${x} ${Tp-19} C ${x+6} ${Tp-11}, ${x+6} ${Tp-5}, ${x} ${Tp-5} C ${x-6} ${Tp-5}, ${x-6} ${Tp-11}, ${x} ${Tp-19} Z"/>`; });
  // líneas de límite
  s+=`<line class="c-lim c-lim-u" x1="${Lp}" x2="${Lp+pw}" y1="${Y(U)}" y2="${Y(U)}"/><line class="c-lim c-lim-p" x1="${Lp}" x2="${Lp+pw}" y1="${Y(P)}" y2="${Y(P)}"/>`;
  s+=`<text class="c-limt" x="${Lp+pw-4}" y="${Y(U)+14}" text-anchor="end">${U} % empieza a regar</text>`;
  s+=`<text class="c-limt" x="${Lp+pw-4}" y="${Y(P)-6}" text-anchor="end">${P} % deja de regar</text>`;
  // humedad
  const pts=D.points.filter(p=>p.c>=t0);
  chartPts=pts.map(p=>({x:X(p.c),y:Y(p.hum),c:p.c,hum:p.hum}));
  if(chartPts.length>1) s+=`<polyline class="c-line" points="${chartPts.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ')}"/>`;
  if(chartPts.length){ const l=chartPts[chartPts.length-1]; s+=`<circle class="c-last" cx="${l.x}" cy="${l.y}" r="4.5"/>`; }
  // ahora
  s+=`<line class="c-now" x1="${X(now)}" x2="${X(now)}" y1="${Tp}" y2="${Tp+ph}"/>`;
  s+=`<g id="cHover" style="display:none"><line class="c-cross" y1="${Tp}" y2="${Tp+ph}"/><circle class="c-hdot" r="5"/></g>`;
  if(!chartPts.length) s+=`<text class="c-ax" x="${Lp+pw/2}" y="${Tp+ph/2}" text-anchor="middle">Esperando el primer dato…</text>`;
  chart.innerHTML=s;
  chartGeo={riegos,X};
}
function chartHover(e){
  if(!chartPts.length||!chartGeo){ tip.hidden=true; return; }
  const box=chart.getBoundingClientRect(), x=e.clientX-box.left;
  let best=chartPts[0]; chartPts.forEach(p=>{ if(Math.abs(p.x-x)<Math.abs(best.x-x)) best=p; });
  const g=chart.querySelector('#cHover'); if(!g) return; g.style.display='';
  g.querySelector('line').setAttribute('x1',best.x); g.querySelector('line').setAttribute('x2',best.x);
  g.querySelector('circle').setAttribute('cx',best.x); g.querySelector('circle').setAttribute('cy',best.y);
  const near=chartGeo.riegos.find(r=>Math.abs(chartGeo.X(r.c)-x)<10);
  tip.innerHTML=`<b>${fmt(best.c)}</b> · humedad ${best.hum} %`+(near?`<br>Riego a las ${fmt(near.c)}: ${Math.round(near.ml)} ml`:'');
  tip.hidden=false;
  const tw=tip.offsetWidth; tip.style.left=Math.max(4,Math.min(box.width-tw-4,best.x+12))+'px'; tip.style.top=Math.max(4,best.y-44)+'px';
}
chart.addEventListener('pointermove',chartHover);
chart.addEventListener('pointerleave',()=>{ tip.hidden=true; const g=chart.querySelector('#cHover'); if(g) g.style.display='none'; });

function render(){
  const m=S.m;
  // suelo y planta
  const wet=Math.min(1,m/70);
  $('soil').setAttribute('fill',mix('c9a06a','4b3424',wet));
  $('sensorCover').setAttribute('fill',mix('c9a06a','4b3424',wet));
  $('wet').setAttribute('opacity',Math.min(.5,S.pending/90).toFixed(3));
  const wilt=Math.max(0,Math.min(1,(32-m)/24));
  const leafCol=mix('3f9a4a','b4a443',wilt);
  [...leafG.children].forEach((p,i)=>{ const L=LEAVES[i]; const ang=L.b + (L.s===0?0:(L.s>0? wilt*55 : -wilt*55));
    p.setAttribute('transform',`translate(${L.x} ${L.y}) rotate(${ang.toFixed(1)})`); p.setAttribute('fill',leafCol); });
  $('stem').setAttribute('d',`M180 314 C 176 272, ${188+wilt*10} 240, ${182+wilt*22} ${196+wilt*14}`);
  $('stem').setAttribute('stroke',mix('3d7d3a','8d8a3a',wilt));
  // depósito
  const lv=S.level/C.DEPOSITO_ML, y=499-lv*135;
  $('water').setAttribute('y',y.toFixed(1)); $('tankLbl').textContent=Math.round(S.level)+' ml';
  // relé, bomba, led
  $('led-rele').setAttribute('fill',S.pumpOn?'#ff3b3b':'#4a1d1d');
  $('rele-lever').setAttribute('y2',S.pumpOn?'212':'200');
  $('impeller').setAttribute('transform',`translate(737 475) rotate(${(S.spin%360).toFixed(0)})`);
  const blink = S.phase==='boot' ? (Math.floor(S.t*6)%2) : 1;
  $('led-board').setAttribute('fill',blink?'#4dff7a':'#2b4b30');
  // agua en la manguera
  if(S.flow && !reduce){ flowOff-=2.2*speed; }
  $('hose-flow').setAttribute('opacity',S.flow?'.95':'0');
  $('hose-flow').setAttribute('stroke-dashoffset',flowOff.toFixed(1));
  const ph=(performance.now()/450)%1;
  const showDrops=S.flow && !S.hoseLoose, showLeak=S.flow && S.hoseLoose;
  [['drop1',0],['drop2',.5]].forEach(([id,o])=>{ const k=(ph+o)%1; const e=$(id); e.setAttribute('cy',(306+k*12).toFixed(1)); e.setAttribute('opacity',showDrops?(1-k).toFixed(2):'0'); });
  [['leak1',0],['leak2',.5]].forEach(([id,o])=>{ const k=(ph+o)%1; const e=$(id); e.setAttribute('cy',(292+k*212).toFixed(1)); e.setAttribute('opacity',showLeak?'.9':'0'); });
  $('puddle').setAttribute('rx',Math.min(70,S.waste/5).toFixed(1));
  $('goteroLbl').textContent = S.hoseLoose?'manguera suelta':'gotero';
  // wifi
  $('wifi-x').setAttribute('opacity',S.wifi?'0':'1');
  $('wifi-waves').setAttribute('opacity',S.wifi?(S.phase==='report'?(.5+.5*Math.sin(performance.now()/90)).toFixed(2):'.8'):'.2');
  // punto de señal
  const d=$('dot'); d.setAttribute('opacity',0);
  const pr=S.t/PH[S.phase].dur;
  if(S.phase==='measure' && S.sensorOk) dotOn('data',pr/0.7);
  if(S.phase==='pump' && S.t<0.9) dotOn('ctrl',S.t/0.7);
  if(S.phase==='report' && S.wifi) dotOn('net',pr/0.75);
  if(S.phase==='report' && !S.wifi && pr<0.5) dotOn('net',pr*0.6);
  // laptop del dibujo (muestra lo mismo que el dashboard grande)
  const t0=todayStart(), hist=D.points.filter(p=>p.c>=t0).slice(-30).map(p=>p.hum);
  $('dash-val').textContent = D.lastHum!=null ? D.lastHum+' %' : '--';
  $('dash-status').textContent = S.wifi?'en línea':'sin conexión';
  $('dash-status').setAttribute('fill',S.wifi?'#8fd9c4':'#f27b45');
  const pts=hist.map((v,i)=>{ const x=815+ (hist.length<2?0:i*(160/(Math.max(hist.length,2)-1))); const yy=150-v/100*55; return x.toFixed(1)+','+yy.toFixed(1); });
  $('dash-line').setAttribute('points',pts.join(' '));
  if(pts.length){ const [lx,ly]=pts[pts.length-1].split(','); $('dash-dot').setAttribute('cx',lx); $('dash-dot').setAttribute('cy',ly); }
  else { $('dash-dot').setAttribute('cx',-10); $('dash-dot').setAttribute('cy',-10); }
  // resaltado de piezas
  const hot=new Set(PH[S.phase].hot);
  const bad=new Set();
  if(S.phase==='alarm'){ bad.add({sensor:'sensor',agua:'deposito',max:'manguera'}[S.alarm]); bad.add('placa'); }
  comps.forEach(c=>{ const id=c.dataset.id; c.classList.toggle('hot',hot.has(id)&&!bad.has(id)); c.classList.toggle('bad',bad.has(id)); c.classList.toggle('sel',id===selected); });
  // etapas
  stepsEl.forEach(s=>{ const n=+s.dataset.s; s.classList.toggle('on',n===PH[S.phase].step && S.phase!=='alarm'); s.classList.toggle('bad',S.phase==='alarm'&&n===3); });
  // código
  codeLines.forEach(l=>{ const tags=(l.dataset.tag||'').split(' ');
    const isAlarm=S.phase==='alarm' && tags.includes('a-'+S.alarm);
    l.classList.toggle('badl',isAlarm);
    l.classList.toggle('on',!isAlarm && S.phase!=='alarm' && tags.includes(S.phase)); });
  // narración
  const n=narration();
  if(n!==lastNarr){ $('narrText').textContent=n; lastNarr=n; }
  $('narr').classList.toggle('alert',S.phase==='alarm' || (S.phase==='pump'&&(S.hoseLoose||S.level<=0)));
  $('narrChip').textContent = clockStr()+' · '+PH[S.phase].title;
  // lecturas
  $('rHum').textContent=Math.round(m)+' %';
  const st=stateWord(m); const pill=$('rState'); pill.textContent=st.charAt(0).toUpperCase()+st.slice(1);
  pill.style.color = m<C.UMBRAL_RIEGO?'var(--warn)':m<=60?'var(--ok)':'var(--water)';
  $('needle').style.left=Math.max(0,Math.min(100,m))+'%';
  $('rRaw').textContent=S.sensorOk?S.raw:'4095 (!)';
  $('rPump').textContent=S.pumpOn?'Encendida':'Apagada';
  $('rPump').style.color=S.pumpOn?'var(--water)':'';
  $('rMode').textContent=S.regando?`Sí (hasta ${C.UMBRAL_PARADA} %)`:'No';
  $('rPulses').textContent=S.pulses;
  $('rUsed').textContent=Math.round(S.used)+' ml';
  $('rWifi').textContent=S.wifi?'Conectado':'Cortado';
  $('rWifi').style.color=S.wifi?'':'var(--alert)';
  $('rClock').textContent=clockStr();
  $('rTank').style.width=(lv*100).toFixed(1)+'%';
  $('dLive').textContent='Ahora: '+PARTS[selected].live();
  renderDash();
  renderTrace();
}

/* ---------- Detalle / zoom ---------- */
const pick=$('pick');
ORDER.forEach(id=>{ const b=document.createElement('button'); b.textContent=SHORT[id]; b.dataset.id=id; b.onclick=()=>select(id,false); pick.appendChild(b); });
function select(id,scroll){
  selected=id; const P=PARTS[id];
  $('dName').textContent=P.name; $('dRole').textContent=P.role;
  $('dWhat').textContent=P.what; $('dDoes').textContent=P.does;
  const ul=$('dCare'); ul.innerHTML=''; P.care.forEach(t=>{const li=document.createElement('li'); li.textContent=t; ul.appendChild(li);});
  [...pick.children].forEach(b=>b.classList.toggle('on',b.dataset.id===id));
  const g=$('c-'+id); let bb;
  try{ bb=g.getBBox(); }catch(e){ bb={x:0,y:0,width:1000,height:560}; }
  let pad=26, x=bb.x-pad, y=bb.y-pad, w=bb.width+pad*2, h=bb.height+pad*2;
  const ar=4/3; if(w/h>ar){ const nh=w/ar; y-=(nh-h)/2; h=nh; } else { const nw=h*ar; x-=(nw-w)/2; w=nw; }
  $('zoom').setAttribute('viewBox',`${x.toFixed(0)} ${y.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`);
  if(scroll && window.matchMedia('(max-width:960px)').matches) $('detail').scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
}
comps.forEach(c=>{
  c.addEventListener('click',()=>select(c.dataset.id,true));
  c.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); select(c.dataset.id,true);} });
});

/* ---------- Controles ---------- */
function syncPlay(){
  $('btnPlay').textContent=paused?'Reproducir':'Pausar';
  $('btnNext').disabled=!(stepMode&&paused);
}
$('btnPlay').onclick=()=>{ paused=!paused; syncPlay(); };
$('btnStep').onclick=()=>{ stepMode=!stepMode; $('btnStep').setAttribute('aria-pressed',stepMode); if(!stepMode){paused=false;} syncPlay(); };
$('btnNext').onclick=()=>{ paused=false; syncPlay(); };
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{ speed=+b.dataset.sp; document.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x===b)); });
function resetTests(){ ['tWifi','tSensor','tTank','tHose'].forEach(id=>$(id).setAttribute('aria-pressed','false')); $('tWifi').textContent='Cortar Wi-Fi'; $('tSensor').textContent='Desconectar sensor'; $('tTank').textContent='Vaciar depósito'; $('tHose').textContent='Soltar manguera'; }
$('btnReset').onclick=()=>{ S=fresh(); D=freshDash(); TR=freshTrace(); varsPrev={}; $('log').innerHTML=''; resetTests(); enter('boot'); if(!stepMode) paused=false; syncPlay(); };
$('tDry').onclick=()=>{ S.m=Math.max(0,S.m-15); log('Sol fuerte: la tierra se seca 15 %'); };
$('tHand').onclick=()=>{ S.pending+=90; log('Alguien riega a mano (90 ml)'); };
$('tWifi').onclick=()=>{ S.wifi=!S.wifi; $('tWifi').setAttribute('aria-pressed',!S.wifi); $('tWifi').textContent=S.wifi?'Cortar Wi-Fi':'Devolver Wi-Fi'; log(S.wifi?'Vuelve el Wi-Fi: el dashboard se pone al día en el próximo envío':'Se corta el Wi-Fi',!S.wifi); };
$('tSensor').onclick=()=>{ S.sensorOk=!S.sensorOk; $('tSensor').setAttribute('aria-pressed',!S.sensorOk); $('tSensor').textContent=S.sensorOk?'Desconectar sensor':'Reconectar sensor'; log(S.sensorOk?'Sensor reconectado':'Se suelta el cable del sensor',!S.sensorOk); };
$('tTank').onclick=()=>{ const empty=S.level>100; S.level=empty?40:C.DEPOSITO_ML; $('tTank').setAttribute('aria-pressed',empty); $('tTank').textContent=empty?'Rellenar depósito':'Vaciar depósito'; log(empty?'El depósito casi se vacía':`Depósito relleno (${C.DEPOSITO_ML} ml)`,empty); };
$('tHose').onclick=()=>{ S.hoseLoose=!S.hoseLoose; $('tHose').setAttribute('aria-pressed',S.hoseLoose); $('tHose').textContent=S.hoseLoose?'Arreglar manguera':'Soltar manguera'; log(S.hoseLoose?'Se suelta la manguera':'Manguera arreglada',S.hoseLoose); };

/* ---------- Bucle ---------- */
S=fresh(); D=freshDash(); TR=freshTrace();
if(reduce){ stepMode=true; $('btnStep').setAttribute('aria-pressed','true'); }
enter('boot'); if(reduce) paused=true; syncPlay();
select('sensor',false);
let last=performance.now();
function frame(now){
  const dt=Math.min(0.1,(now-last)/1000); last=now;
  if(!paused) update(dt*speed);
  render();
  requestAnimationFrame(frame);
}
render();
requestAnimationFrame(frame);
})();
