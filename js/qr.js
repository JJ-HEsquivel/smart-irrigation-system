/* Generador de códigos QR pequeño, sin librerías externas.
   Uso: QR.svg('https://...') devuelve el dibujo SVG del código.
   Modo byte (UTF-8), corrección de errores nivel M, versiones 1 a 10 (hasta ~210 caracteres). */
(function(root){
  // [palabras de corrección por bloque, tamaños de datos de cada bloque] para el nivel M
  const BLOCKS = [null,
    [10,[16]], [16,[28]], [26,[44]], [18,[32,32]], [24,[43,43]],
    [16,[27,27,27,27]], [18,[31,31,31,31]], [22,[38,38,39,39]],
    [22,[36,36,36,37,37]], [26,[43,43,43,43,44]]];
  const ALIGN = [null,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];

  function gfMul(x,y){ let z=0; for(let i=7;i>=0;i--){ z=(z<<1)^((z>>>7)*0x11D); z^=((y>>>i)&1)*x; } return z; }
  function rsDivisor(deg){
    const r=new Array(deg).fill(0); r[deg-1]=1; let root=1;
    for(let i=0;i<deg;i++){ for(let j=0;j<deg;j++){ r[j]=gfMul(r[j],root); if(j+1<deg) r[j]^=r[j+1]; } root=gfMul(root,2); }
    return r;
  }
  function rsRemainder(data,div){
    const r=div.map(()=>0);
    for(const b of data){ const f=b^r.shift(); r.push(0); div.forEach((c,i)=>{ r[i]^=gfMul(c,f); }); }
    return r;
  }
  function utf8(s){ return Array.from(new TextEncoder().encode(s)); }

  function matrix(text){
    const bytes=utf8(text);
    let ver=1;
    for(;ver<=10;ver++){
      const cap=BLOCKS[ver][1].reduce((a,b)=>a+b,0)*8, cc=ver<10?8:16;
      if(4+cc+bytes.length*8<=cap) break;
    }
    if(ver>10) throw new Error('Texto demasiado largo para el QR');
    const [ecLen,dataLens]=BLOCKS[ver], capBytes=dataLens.reduce((a,b)=>a+b,0);
    // bits de datos
    const bits=[]; const put=(v,n)=>{ for(let i=n-1;i>=0;i--) bits.push((v>>>i)&1); };
    put(4,4); put(bytes.length,ver<10?8:16); bytes.forEach(b=>put(b,8));
    put(0,Math.min(4,capBytes*8-bits.length));
    while(bits.length%8) bits.push(0);
    const data=[]; for(let i=0;i<bits.length;i+=8){ let b=0; for(let j=0;j<8;j++) b=(b<<1)|bits[i+j]; data.push(b); }
    for(let p=0xEC;data.length<capBytes;p^=0xEC^0x11) data.push(p);
    // bloques y corrección de errores, intercalados
    const div=rsDivisor(ecLen), blocks=[], ecs=[]; let k=0;
    dataLens.forEach(n=>{ const blk=data.slice(k,k+n); k+=n; blocks.push(blk); ecs.push(rsRemainder(blk,div)); });
    const out=[], maxD=Math.max(...dataLens);
    for(let i=0;i<maxD;i++) blocks.forEach(b=>{ if(i<b.length) out.push(b[i]); });
    for(let i=0;i<ecLen;i++) ecs.forEach(e=>out.push(e[i]));
    // matriz
    const size=ver*4+17;
    const M=Array.from({length:size},()=>new Array(size).fill(false));
    const F=Array.from({length:size},()=>new Array(size).fill(false));
    const set=(x,y,v)=>{ M[y][x]=v; F[y][x]=true; };
    for(let i=0;i<size;i++){ set(6,i,i%2===0); set(i,6,i%2===0); }
    const finder=(cx,cy)=>{ for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++){ const x=cx+dx,y=cy+dy;
      if(x>=0&&x<size&&y>=0&&y<size){ const d=Math.max(Math.abs(dx),Math.abs(dy)); set(x,y,d!==2&&d!==4); } } };
    finder(3,3); finder(size-4,3); finder(3,size-4);
    const al=ALIGN[ver], last=al.length-1;
    al.forEach((ay,i)=>al.forEach((ax,j)=>{
      if((i===0&&j===0)||(i===0&&j===last)||(i===last&&j===0)) return;
      for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) set(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
    }));
    const drawFormat=mask=>{
      const d=(0<<3)|mask; let r=d; for(let i=0;i<10;i++) r=(r<<1)^((r>>>9)*0x537);
      const b=((d<<10)|r)^0x5412, g=i=>((b>>>i)&1)===1;
      for(let i=0;i<=5;i++) set(8,i,g(i));
      set(8,7,g(6)); set(8,8,g(7)); set(7,8,g(8));
      for(let i=9;i<15;i++) set(14-i,8,g(i));
      for(let i=0;i<8;i++) set(size-1-i,8,g(i));
      for(let i=8;i<15;i++) set(8,size-15+i,g(i));
      set(8,size-8,true);
    };
    drawFormat(0);
    if(ver>=7){
      let r=ver; for(let i=0;i<12;i++) r=(r<<1)^((r>>>11)*0x1F25);
      const b=(ver<<12)|r;
      for(let i=0;i<18;i++){ const v=((b>>>i)&1)===1, a=size-11+i%3, c=Math.floor(i/3); set(a,c,v); set(c,a,v); }
    }
    // colocar los datos en zigzag
    let i=0;
    for(let right=size-1;right>=1;right-=2){
      if(right===6) right=5;
      for(let vert=0;vert<size;vert++) for(let j=0;j<2;j++){
        const x=right-j, up=((right+1)&2)===0, y=up?size-1-vert:vert;
        if(!F[y][x] && i<out.length*8){ M[y][x]=((out[i>>>3]>>>(7-(i&7)))&1)===1; i++; }
      }
    }
    // elegir la máscara que deja el dibujo más fácil de leer
    const MASKS=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,
      (x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,
      (x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
    const apply=m=>{ for(let y=0;y<size;y++) for(let x=0;x<size;x++) if(!F[y][x]&&MASKS[m](x,y)) M[y][x]=!M[y][x]; };
    const penalty=()=>{
      let p=0, dark=0;
      for(let y=0;y<size;y++){ let run=1; for(let x=1;x<size;x++){ if(M[y][x]===M[y][x-1]) run++; else { if(run>=5) p+=run-2; run=1; } } if(run>=5) p+=run-2; }
      for(let x=0;x<size;x++){ let run=1; for(let y=1;y<size;y++){ if(M[y][x]===M[y-1][x]) run++; else { if(run>=5) p+=run-2; run=1; } } if(run>=5) p+=run-2; }
      for(let y=0;y<size-1;y++) for(let x=0;x<size-1;x++){ const c=M[y][x]; if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1]) p+=3; }
      for(let y=0;y<size;y++) for(let x=0;x<size;x++) if(M[y][x]) dark++;
      p+=Math.floor(Math.abs(dark*20-size*size*10)/(size*size))*10;
      return p;
    };
    let best=0, bestP=Infinity;
    for(let m=0;m<8;m++){ apply(m); drawFormat(m); const p=penalty(); if(p<bestP){ bestP=p; best=m; } apply(m); }
    apply(best); drawFormat(best);
    return M;
  }

  function svg(text,opt){
    opt=opt||{};
    const M=matrix(text), n=M.length, q=4, s=n+q*2;
    let d='';
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) if(M[y][x]) d+=`M${x+q} ${y+q}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" role="img" aria-label="${opt.label||'Código QR'}">`+
      `<rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  const QR={matrix,svg};
  root.QR=QR;
  if(typeof module!=='undefined' && module.exports) module.exports=QR;
})(typeof window!=='undefined'?window:globalThis);
