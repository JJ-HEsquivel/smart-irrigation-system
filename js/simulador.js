(function(){
const $ = id => document.getElementById(id);
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    does:'Cuando el relé se cierra, gira y manda agua al gotero. En la simulación saca unos 25 ml por segundo.',
    care:['Nunca debe girar sin agua: se calienta y se quema.','Al arrancar pide un pico de corriente que puede reiniciar la placa.','Con pocos segundos de riego alcanza para una maceta.'],
    live:()=> S.pumpOn ? (S.level>0 ? 'Girando: empuja agua' : 'Girando EN SECO') : 'Detenida'},
  deposito:{name:'Depósito de agua', role:'La reserva',
    what:'Un recipiente que, en el prototipo, representa el agua del colegio.',
    does:'Guarda el agua que la bomba envía a la planta. Cada riego baja el nivel.',
    care:['En el proyecto real el agua vendría del grifo (con una electroválvula) o de un tanque de lluvia.','Mejora opcional: un sensor de nivel para avisar antes de que se vacíe.'],
    live:()=> `${Math.round(S.level)} ml de 1500 ml`},
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
    does:'Muestra la humedad, cuándo se regó y cuánta agua se usó. Cualquiera puede ver el estado del huerto desde un celular.',
    care:['Hay que comprobar que el Wi-Fi del colegio llegue hasta el huerto.','Las redes con página de login suelen bloquear a la placa. Plan B gratuito: ThingSpeak, Blynk o Arduino IoT Cloud.'],
    live:()=> S.wifi ? `En línea · ${S.history.length} datos recibidos` : `Sin conexión · ${S.buffer.length} datos esperando`},
  planta:{name:'Planta y suelo', role:'Lo que queremos cuidar',
    what:'El cajón de cultivo que representa al huerto pedagógico.',
    does:'El sol y la propia planta consumen el agua; la tierra se seca con las horas. El sistema la mantiene entre 35 % y 50 %.',
    care:['Cada especie necesita distinta humedad: el umbral depende de las plantas que tenga el huerto.','Regar de más también daña: las raíces se pudren sin aire.'],
    live:()=> `Humedad ${Math.round(S.m)} % · ${stateWord(S.m)}`}
};
const ORDER = ['planta','sensor','placa','rele','bomba','deposito','manguera','fuente','dashboard'];
const SHORT = {planta:'Planta',sensor:'Sensor',placa:'Placa',rele:'Relé',bomba:'Bomba',deposito:'Depósito',manguera:'Manguera',fuente:'Fuente',dashboard:'Dashboard'};

/* ---------- Código ---------- */
const CODE = [
  ['void setup() {'],
  ['  pinMode(RELE, OUTPUT);','','boot'],
  ['  conectarWiFi();','','boot'],
  ['}'],
  [''],
  ['void loop() {'],
  ['  int raw = analogRead(SENSOR);','// leer el sensor','measure'],
  ['  int hum = map(raw, SECO, MOJADO, 0, 100);','','measure'],
  ['  if (raw > 3600 || raw < 900) {','// ¿sensor suelto?','decide'],
  ['    alerta("Revisar sensor");','','a-sensor'],
  ['  } else {'],
  ['    if (hum < 35)  regando = true;','// muy seca: empezar','decide'],
  ['    if (hum >= 50) regando = false;','// suficiente: parar','decide'],
  ['    if (regando && hayAgua() && pulsos < 6) {','','decide a-agua a-max'],
  ['      digitalWrite(RELE, HIGH); delay(3000);','// regar 3 s','pump'],
  ['      digitalWrite(RELE, LOW);  delay(60000);','// esperar 1 min','soak'],
  ['      pulsos++; return;','// volver a medir','soak'],
  ['    }'],
  ['  }'],
  ['  enviarDashboard(hum);','// si hay Wi-Fi','report'],
  ['  delay(3600000);','// esperar 1 hora','idle'],
  ['}']
];
const codeEl = $('code');
CODE.forEach(([t,c,tag])=>{
  const s=document.createElement('span'); s.textContent=t||' ';
  if(c){ const e=document.createElement('em'); e.textContent='  '+c; s.appendChild(e); }
  s.dataset.tag = tag||''; codeEl.appendChild(s);
});

/* ---------- Estado ---------- */
let S, paused=false, stepMode=false, speed=1, selected='sensor';
function fresh(){
  return {m:26,pending:0,level:1200,used:0,waste:0,regando:false,pulses:0,phase:'boot',t:0,clock:7*60,
    raw:2558,hum:26,history:[],buffer:[],alarm:null,next:'report',pumpOn:false,
    wifi:true,sensorOk:true,hoseLoose:false,decText:'',spin:0,flow:0,sentT:0};
}
const PH = {
  boot:{title:'Arranque',dur:3.2,step:1,hot:['fuente','placa']},
  measure:{title:'Medir',dur:2.4,step:2,hot:['sensor','placa']},
  decide:{title:'Decidir',dur:2.8,step:3,hot:['placa']},
  pump:{title:'Regar',dur:3,step:4,hot:['rele','bomba','manguera']},
  soak:{title:'Esperar',dur:3.2,step:4,hot:['planta','sensor']},
  alarm:{title:'Alerta',dur:4,step:3,hot:[]},
  report:{title:'Reportar',dur:2.6,step:5,hot:['placa','dashboard']},
  idle:{title:'Pasa 1 hora',dur:3.6,step:0,hot:['planta']}
};

function clockStr(){ const m=Math.floor(S.clock)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function stateWord(m){ return m<25?'marchitándose':m<35?'seca':m<=60?'bien':m<=80?'muy húmeda':'encharcada'; }
function log(msg,alert){
  const li=document.createElement('li'); if(alert) li.className='a';
  const t=document.createElement('time'); t.textContent=clockStr();
  const s=document.createElement('span'); s.textContent=msg;
  li.append(t,s); const L=$('log'); L.prepend(li); while(L.children.length>40) L.lastChild.remove();
}

function readSensor(){
  if(!S.sensorOk){ S.raw=4095; S.hum=0; return; }
  S.raw=Math.round(3000 - S.m*17 + (Math.random()*30-15));
  S.hum=Math.max(0,Math.min(100,Math.round((3000-S.raw)/17)));
}
function decide(){
  S.alarm=null;
  if(S.raw>3600||S.raw<900){ S.alarm='sensor'; S.next='alarm';
    S.decText='Lectura imposible: el sensor está desconectado.'; return; }
  const was=S.regando;
  if(S.hum<35) S.regando=true;
  if(S.hum>=50) S.regando=false;
  if(S.regando){
    if(S.level<80){ S.alarm='agua'; S.next='alarm'; S.regando=false; return; }
    if(S.pulses>=6){ S.alarm='max'; S.next='alarm'; S.regando=false; return; }
    S.next='pump';
    S.decText = S.hum<35 ? `${S.hum} % es menor que 35 %: la tierra está seca, toca regar.`
                         : `${S.hum} % todavía no llega a 50 %: da otro pulso de riego.`;
  } else {
    S.next='report';
    S.decText = was ? `${S.hum} %: llegó a 50 %, suficiente. Deja de regar.`
                    : `${S.hum} % está por encima de 35 %: la tierra está bien, no hace falta regar.`;
  }
}
function report(){
  if(S.wifi){
    if(S.buffer.length){ S.history.push(...S.buffer); log(`Volvió el Wi-Fi: envía ${S.buffer.length} dato(s) guardados`); S.buffer=[]; }
    S.history.push(S.hum); if(S.history.length>30) S.history.splice(0,S.history.length-30);
  } else { S.buffer.push(S.hum); }
  S.pulses=0;
}

function enter(ph){
  S.phase=ph; S.t=0;
  if(ph==='measure'){ readSensor(); }
  if(ph==='decide'){ decide(); }
  if(ph==='pump'){ S.pulses++; log(`Pulso de riego ${S.pulses} (3 s)`); }
  if(ph==='alarm'){
    const msg={sensor:'Alerta: sensor desconectado, no riega',agua:'Alerta: depósito casi vacío, no riega',max:'Alerta: 6 pulsos sin resultado, deja de regar'}[S.alarm];
    log(msg,true);
  }
  if(ph==='report'){ report(); log(S.wifi?`Envía ${S.hum} % al dashboard`:`Sin Wi-Fi: guarda ${S.hum} % para enviarlo después`); }
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
    if(S.level>0){ const f=Math.min(S.level,25*dt); S.level-=f; S.used+=f;
      if(S.hoseLoose) S.waste+=f; else S.pending+=f; S.flow=1; }
    else S.flow=0;
    S.clock+=dt*0.05/ph.dur;
  } else S.flow=0;
  // el agua se va absorbiendo
  const tr=S.pending*(1-Math.exp(-dt*0.85)); S.pending-=tr; S.m+=tr/6;
  if(S.phase==='idle'){ S.m-=dt*4/ph.dur; S.clock+=dt*60/ph.dur; }
  if(S.phase==='soak'){ S.clock+=dt*1/ph.dur; S.m-=dt*0.05; }
  S.m=Math.max(0,Math.min(100,S.m));
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
      (S.level>0 ? 'La placa activa el relé (¡clic!). El relé cierra el circuito y la bomba empuja agua por la manguera durante 3 s, unos 75 ml.' : 'La bomba gira sin agua: se puede quemar.');
    case 'soak': return 'La bomba se apaga. El agua tarda en llegar hasta el sensor, por eso la placa espera 1 minuto antes de volver a medir.';
    case 'alarm':
      if(a==='sensor') return 'Alerta: lectura imposible, el sensor está desconectado. Sin esta revisión, la placa creería que la tierra está totalmente seca y regaría sin parar. No riega y avisa.';
      if(a==='agua') return 'Alerta: el depósito casi no tiene agua. Si la bomba gira en seco se quema, así que no riega y pide rellenar. (Necesita un sensor de nivel: mejora opcional.)';
      return 'Alerta: ya dio 6 pulsos y la tierra sigue seca. Algo anda mal (manguera suelta, sensor fuera de la tierra), así que deja de regar y avisa.';
    case 'report': return S.wifi ? `Envía ${h} % al dashboard por Wi-Fi. Así cualquiera puede ver el estado del huerto desde un celular.` :
      `No hay Wi-Fi. El riego funciona igual porque la decisión se toma en la placa; el dato (${h} %) se guarda y se envía cuando vuelva la conexión.`;
    case 'idle': return 'Pasa una hora. El sol y la planta consumen agua y la tierra se va secando. La placa volverá a medir.';
  }
  return '';
}

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
  const lv=S.level/1500, y=499-lv*135;
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
  // dashboard
  const hist=S.history;
  $('dash-val').textContent = hist.length? hist[hist.length-1]+' %' : '--';
  $('dash-status').textContent = S.wifi?'en línea':'sin conexión';
  $('dash-status').setAttribute('fill',S.wifi?'#8fd9c4':'#f27b45');
  const pts=hist.map((v,i)=>{ const x=815+ (hist.length<2?0:i*(160/(Math.max(hist.length,2)-1))); const yy=150-v/100*55; return x.toFixed(1)+','+yy.toFixed(1); });
  $('dash-line').setAttribute('points',pts.join(' '));
  if(pts.length){ const [lx,ly]=pts[pts.length-1].split(','); $('dash-dot').setAttribute('cx',lx); $('dash-dot').setAttribute('cy',ly); }
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
  pill.style.color = m<35?'var(--warn)':m<=60?'var(--ok)':'var(--water)';
  $('needle').style.left=Math.max(0,Math.min(100,m))+'%';
  $('rRaw').textContent=S.sensorOk?S.raw:'4095 (!)';
  $('rPump').textContent=S.pumpOn?'Encendida':'Apagada';
  $('rPump').style.color=S.pumpOn?'var(--water)':'';
  $('rMode').textContent=S.regando?'Sí (hasta 50 %)':'No';
  $('rPulses').textContent=S.pulses;
  $('rUsed').textContent=Math.round(S.used)+' ml';
  $('rWifi').textContent=S.wifi?'Conectado':'Cortado';
  $('rWifi').style.color=S.wifi?'':'var(--alert)';
  $('rClock').textContent=clockStr();
  $('rTank').style.width=(lv*100).toFixed(1)+'%';
  $('dLive').textContent='Ahora: '+PARTS[selected].live();
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
$('btnReset').onclick=()=>{ S=fresh(); $('log').innerHTML=''; resetTests(); enter('boot'); if(!stepMode) paused=false; syncPlay(); };
$('tDry').onclick=()=>{ S.m=Math.max(0,S.m-15); log('Sol fuerte: la tierra se seca 15 %'); };
$('tHand').onclick=()=>{ S.pending+=90; log('Alguien riega a mano (90 ml)'); };
$('tWifi').onclick=()=>{ S.wifi=!S.wifi; $('tWifi').setAttribute('aria-pressed',!S.wifi); $('tWifi').textContent=S.wifi?'Cortar Wi-Fi':'Devolver Wi-Fi'; log(S.wifi?'Vuelve el Wi-Fi':'Se corta el Wi-Fi',!S.wifi); };
$('tSensor').onclick=()=>{ S.sensorOk=!S.sensorOk; $('tSensor').setAttribute('aria-pressed',!S.sensorOk); $('tSensor').textContent=S.sensorOk?'Desconectar sensor':'Reconectar sensor'; log(S.sensorOk?'Sensor reconectado':'Se suelta el cable del sensor',!S.sensorOk); };
$('tTank').onclick=()=>{ const empty=S.level>100; S.level=empty?40:1500; $('tTank').setAttribute('aria-pressed',empty); $('tTank').textContent=empty?'Rellenar depósito':'Vaciar depósito'; log(empty?'El depósito casi se vacía':'Depósito relleno (1500 ml)',empty); };
$('tHose').onclick=()=>{ S.hoseLoose=!S.hoseLoose; $('tHose').setAttribute('aria-pressed',S.hoseLoose); $('tHose').textContent=S.hoseLoose?'Arreglar manguera':'Soltar manguera'; log(S.hoseLoose?'Se suelta la manguera':'Manguera arreglada',S.hoseLoose); };

/* ---------- Bucle ---------- */
S=fresh(); readSensor();
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
