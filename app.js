'use strict';
const PRESETS={};
// STATE
const S={layers:[],activeId:'outline',tool:'select',selSet:[],drag:null,pan:null,
  cam:{x:0.5,y:0.15,z:400},snap:{on:false,inc:0.025}};
const U={stack:[],redo:[],MAX:60};
const FLAG_COLS=['#4a9de0','#6db86d','#d06060','#9c6dd0','#d0a040','#50c8c0'];
let flagCount=0;

// CANVAS
const cv=document.getElementById('canvas');
const ctx=cv.getContext('2d');
const pv=document.getElementById('preview');
const pctx=pv.getContext('2d');
const CW=()=>cv.width,CH=()=>cv.height;

// COORDS (Y-up to match Houdini)
function w2s(wx,wy){return[CW()/2+(wx-S.cam.x)*S.cam.z, CH()/2-(wy-S.cam.y)*S.cam.z];}
function s2w(sx,sy){return[S.cam.x+(sx-CW()/2)/S.cam.z, S.cam.y-(sy-CH()/2)/S.cam.z];}
const r4=v=>Math.round(v*1e4)/1e4;
function snapXY(wx,wy){if(!S.snap.on)return[wx,wy];const i=S.snap.inc;return[Math.round(wx/i)*i,Math.round(wy/i)*i];}

// UNDO
function pushUndo(){U.stack.push({layers:JSON.stringify(S.layers),activeId:S.activeId});if(U.stack.length>U.MAX)U.stack.shift();U.redo=[];}
function applyUndoState(st){S.layers=JSON.parse(st.layers);S.activeId=st.activeId;if(!getLayer(S.activeId))S.activeId='outline';S.selSet=[];}
function undo(){if(!U.stack.length)return;U.redo.push({layers:JSON.stringify(S.layers),activeId:S.activeId});applyUndoState(U.stack.pop());draw();}
function redo(){if(!U.redo.length)return;U.stack.push({layers:JSON.stringify(S.layers),activeId:S.activeId});applyUndoState(U.redo.pop());draw();}

// SPLINE
function getTangent(pts,i,a=0.5){const n=pts.length,p0=pts[(i-1+n)%n],p2=pts[(i+1)%n];return{x:a*(p2.x-p0.x),y:a*(p2.y-p0.y)};}

function crCtrl(p0,p1,p2,p3,a=0.5){
  /** Uses tangentOut/tangentIn for asymmetric handles; falls back to symmetric tangent then CR. */
  const tx1=p1.tangentOut?p1.tangentOut.x:(p1.tangent?p1.tangent.x:a*(p2.x-p0.x));
  const ty1=p1.tangentOut?p1.tangentOut.y:(p1.tangent?p1.tangent.y:a*(p2.y-p0.y));
  const tx2=p2.tangentIn ?p2.tangentIn.x :(p2.tangent?p2.tangent.x:a*(p3.x-p1.x));
  const ty2=p2.tangentIn ?p2.tangentIn.y :(p2.tangent?p2.tangent.y:a*(p3.y-p1.y));
  return{c1:{x:p1.x+tx1/3,y:p1.y+ty1/3},c2:{x:p2.x-tx2/3,y:p2.y-ty2/3}};
}

function bezPt(p1,c1,c2,p2,t){const m=1-t;return{x:m*m*m*p1.x+3*m*m*t*c1.x+3*m*t*t*c2.x+t*t*t*p2.x,y:m*m*m*p1.y+3*m*m*t*c1.y+3*m*t*t*c2.y+t*t*t*p2.y};}

function tracePath(ctx2,pts,closed,xf){
  if(pts.length<1)return;const tf=xf||w2s,n=pts.length;
  ctx2.moveTo(...tf(pts[0].x,pts[0].y));
  const segs=closed?n:n-1;
  for(let i=0;i<segs;i++){
    const p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];
    const[ex,ey]=tf(p2.x,p2.y);
    if(p1.smooth&&p2.smooth){const{c1,c2}=crCtrl(p0,p1,p2,p3);ctx2.bezierCurveTo(...tf(c1.x,c1.y),...tf(c2.x,c2.y),ex,ey);}
    else ctx2.lineTo(ex,ey);
  }
  if(closed)ctx2.closePath();
}

function bakeSpline(pts,closed,res){
  if(pts.length<1)return[];const n=pts.length,out=[];
  for(let i=0;i<(closed?n:n-1);i++){
    const p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];
    out.push([r4(p1.x),r4(p1.y)]);
    if(p1.smooth&&p2.smooth){const{c1,c2}=crCtrl(p0,p1,p2,p3);for(let j=1;j<res;j++){const{x,y}=bezPt(p1,c1,c2,p2,j/res);out.push([r4(x),r4(y)]);}}
  }
  return out;
}

// HIT SEGMENT — samples actual bezier curves, not chord lines
function hitSegment(sx,sy){
  /** Returns {idx, t} where idx is insertion index and t is bezier parameter at closest point. */
  const ly=activeLy();if(!ly||ly.type!=='poly')return null;
  const pts=ly.pts,n=pts.length;if(n<2)return null;
  const THRESH=14,SAMPLES=16;let bestD=THRESH,best=null;
  for(let i=0;i<(ly.closed?n:n-1);i++){
    const p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];
    if(p1.smooth&&p2.smooth){
      const{c1,c2}=crCtrl(p0,p1,p2,p3);
      for(let j=0;j<=SAMPLES;j++){
        const t=j/SAMPLES,pt=bezPt(p1,c1,c2,p2,t);
        const[bsx,bsy]=w2s(pt.x,pt.y),d=Math.hypot(sx-bsx,sy-bsy);
        if(d<bestD){bestD=d;best={idx:i+1,t};}
      }
    }else{
      const[x1,y1]=w2s(p1.x,p1.y),[x2,y2]=w2s(p2.x,p2.y);
      const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;if(l2<.001)continue;
      const t=Math.max(0,Math.min(1,((sx-x1)*dx+(sy-y1)*dy)/l2));
      const d=Math.hypot(sx-(x1+t*dx),sy-(y1+t*dy));
      if(d<bestD){bestD=d;best={idx:i+1,t};}
    }
  }
  return best;
}

function insertOnSegment(ly,hit){
  /** Split segment using de Casteljau, preserving curve shape exactly. */
  const n=ly.pts.length,segIdx=hit.idx-1,t=hit.t;
  const i1=segIdx%n,i2=(segIdx+1)%n;
  const p1=ly.pts[i1],p2=ly.pts[i2];
  const insertAt=segIdx+1;
  let newPt;

  if(p1.smooth&&p2.smooth){
    const p0=ly.pts[(i1-1+n)%n],p3=ly.pts[(i2+1)%n];
    const{c1,c2}=crCtrl(p0,p1,p2,p3);
    // de Casteljau subdivision
    const L=(a,b,u)=>({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u});
    const Q0=L(p1,c1,t),Q1=L(c1,c2,t),Q2=L(c2,p2,t);
    const R0=L(Q0,Q1,t),R1=L(Q1,Q2,t);
    const S_pt=L(R0,R1,t);

    // Tangents: tangentOut=3*(c1-anchor), tangentIn=3*(anchor-c2)
    const newP1Out={x:r4(3*(Q0.x-p1.x)),y:r4(3*(Q0.y-p1.y))};
    const newSIn  ={x:r4(3*(S_pt.x-R0.x)),y:r4(3*(S_pt.y-R0.y))};
    const newSOut ={x:r4(3*(R1.x-S_pt.x)),y:r4(3*(R1.y-S_pt.y))};
    const newP2In ={x:r4(3*(p2.x-Q2.x)),y:r4(3*(p2.y-Q2.y))};

    // Update p1 outgoing tangent, preserve incoming
    const p1In=p1.tangentIn||(p1.tangent?{...p1.tangent}:null);
    delete p1.tangent;p1.tangentOut=newP1Out;if(p1In)p1.tangentIn=p1In;

    // Update p2 incoming tangent, preserve outgoing
    const p2Out=p2.tangentOut||(p2.tangent?{...p2.tangent}:null);
    delete p2.tangent;p2.tangentIn=newP2In;if(p2Out)p2.tangentOut=p2Out;

    newPt={x:r4(S_pt.x),y:r4(S_pt.y),smooth:true,tangentIn:newSIn,tangentOut:newSOut};
  }else{
    // Straight segment: linear interpolation, no tangents
    newPt={x:r4(p1.x+(p2.x-p1.x)*t),y:r4(p1.y+(p2.y-p1.y)*t),smooth:false};
  }

  ly.pts.splice(insertAt,0,newPt);
  S.selSet=[{lid:ly.id,idx:insertAt}];
}

// LAYER HELPERS
const mkPoly=(pts,color,id,name)=>({id,name,type:'poly',closed:true,visible:true,color,pts});
const getLayer=id=>S.layers.find(l=>l.id===id)||null;
const activeLy=()=>getLayer(S.activeId);
const getPt=s=>{const ly=getLayer(s.lid);return ly?(ly.pts||[])[s.idx]||null:null;};
const selLast=()=>S.selSet.length?S.selSet[S.selSet.length-1]:null;
const inSelSet=s=>S.selSet.some(t=>t.lid===s.lid&&t.idx===s.idx);

function selBBox(){
  if(!S.selSet.length)return null;
  let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  for(const s of S.selSet){const p=getPt(s);if(!p)continue;mnX=Math.min(mnX,p.x);mnY=Math.min(mnY,p.y);mxX=Math.max(mxX,p.x);mxY=Math.max(mxY,p.y);}
  return mnX===Infinity?null:{minX:mnX,minY:mnY,maxX:mxX,maxY:mxY};
}

// TRANSFORM GIZMO — corners + edge midpoints + rotation
function gizmoHandles(bb){
  const cx=(bb.minX+bb.maxX)/2,cy=(bb.minY+bb.maxY)/2;
  return[
    {id:'nw',type:'scale',wx:bb.minX,wy:bb.maxY,anchor:{x:bb.maxX,y:bb.minY},axis:'xy'},
    {id:'ne',type:'scale',wx:bb.maxX,wy:bb.maxY,anchor:{x:bb.minX,y:bb.minY},axis:'xy'},
    {id:'se',type:'scale',wx:bb.maxX,wy:bb.minY,anchor:{x:bb.minX,y:bb.maxY},axis:'xy'},
    {id:'sw',type:'scale',wx:bb.minX,wy:bb.minY,anchor:{x:bb.maxX,y:bb.maxY},axis:'xy'},
    {id:'n', type:'scale',wx:cx,     wy:bb.maxY, anchor:{x:cx,     y:bb.minY},axis:'y'},
    {id:'s', type:'scale',wx:cx,     wy:bb.minY, anchor:{x:cx,     y:bb.maxY},axis:'y'},
    {id:'e', type:'scale',wx:bb.maxX,wy:cy,      anchor:{x:bb.minX,y:cy},     axis:'x'},
    {id:'w', type:'scale',wx:bb.minX,wy:cy,      anchor:{x:bb.maxX,y:cy},     axis:'x'},
  ];
}

function rotHandleSS(bb){
  const cs=[[bb.minX,bb.minY],[bb.maxX,bb.minY],[bb.minX,bb.maxY],[bb.maxX,bb.maxY]].map(([x,y])=>w2s(x,y));
  const topSy=Math.min(...cs.map(c=>c[1])),cx=cs.reduce((s,c)=>s+c[0],0)/4;
  return{stem:[cx,topSy],tip:[cx,topSy-46]};
}

function snapshotSel(){return S.selSet.map(s=>{const p=getPt(s);return p?{...s,x:p.x,y:p.y}:null;}).filter(Boolean);}

// LAYER MUTATIONS
function addFlag(){
  const fi=flagCount++,col=FLAG_COLS[fi%FLAG_COLS.length];
  const ins=S.layers.findIndex(l=>l.id==='inputs');
  pushUndo();S.layers.splice(ins>=0?ins:S.layers.length,0,mkPoly([],col,`flag_${fi}`,`Flag ${fi}`));
  S.activeId=`flag_${fi}`;S.selSet=[];draw();
}

function mirrorH(){
  const ly=activeLy();if(!ly)return;
  const pts=S.selSet.length?S.selSet.map(s=>getPt(s)).filter(Boolean):(ly.pts||[]);
  if(!pts.length)return;pushUndo();
  const xs=pts.map(p=>p.x),cx=(Math.min(...xs)+Math.max(...xs))/2;
  pts.forEach(p=>{p.x=r4(2*cx-p.x);if(p.tangent)p.tangent.x=-p.tangent.x;if(p.tangentOut)p.tangentOut.x=-p.tangentOut.x;if(p.tangentIn)p.tangentIn.x=-p.tangentIn.x;});draw();
}
function alignH(){
  /** Snap all selected points to their average Y (flatten horizontally). */
  if(!S.selSet.length)return;
  const pts=S.selSet.map(s=>getPt(s)).filter(Boolean);
  if(!pts.length)return;pushUndo();
  const avgY=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  pts.forEach(p=>p.y=r4(avgY));draw();
}
function alignV(){
  /** Snap all selected points to their average X (flatten vertically). */
  if(!S.selSet.length)return;
  const pts=S.selSet.map(s=>getPt(s)).filter(Boolean);
  if(!pts.length)return;pushUndo();
  const avgX=pts.reduce((s,p)=>s+p.x,0)/pts.length;
  pts.forEach(p=>p.x=r4(avgX));draw();
}
function mirrorV(){
  const pts=S.selSet.length?S.selSet.map(s=>getPt(s)).filter(Boolean):(ly.pts||[]);
  if(!pts.length)return;pushUndo();
  const ys=pts.map(p=>p.y),cy=(Math.min(...ys)+Math.max(...ys))/2;
  pts.forEach(p=>{p.y=r4(2*cy-p.y);if(p.tangent)p.tangent.y=-p.tangent.y;if(p.tangentOut)p.tangentOut.y=-p.tangentOut.y;if(p.tangentIn)p.tangentIn.y=-p.tangentIn.y;});draw();
}

// SHAPE PRIMITIVES
function commitShape(tool,x0,y0,x1,y1){
  const ly=activeLy();if(!ly||ly.type!=='poly')return;
  const mnX=Math.min(x0,x1),mxX=Math.max(x0,x1),mnY=Math.min(y0,y1),mxY=Math.max(y0,y1);
  const cx=(mnX+mxX)/2,cy=(mnY+mxY)/2,hw=(mxX-mnX)/2,hh=(mxY-mnY)/2;
  if(hw<0.001&&hh<0.001)return;
  let pts=[];
  if(tool==='rect'){
    pts=[{x:r4(mnX),y:r4(mnY),smooth:false},{x:r4(mxX),y:r4(mnY),smooth:false},
         {x:r4(mxX),y:r4(mxY),smooth:false},{x:r4(mnX),y:r4(mxY),smooth:false}];
  }else if(tool==='tri'){
    pts=[{x:r4(cx),y:r4(mxY),smooth:false},{x:r4(mxX),y:r4(mnY),smooth:false},{x:r4(mnX),y:r4(mnY),smooth:false}];
  }else if(tool==='ellipse'){
    const N=8;for(let i=0;i<N;i++){const a=i/N*Math.PI*2;pts.push({x:r4(cx+hw*Math.cos(a)),y:r4(cy+hh*Math.sin(a)),smooth:true});}
  }else if(tool==='capsule'){
    // K: bezier circle approximation constant = 4*(sqrt(2)-1)/3 ≈ 0.5523
    // Tangents are set so Catmull-Rom exactly matches a bezier circle arc.
    const K=4*(Math.sqrt(2)-1)/3;
    if(hw>=hh){
      const r=hh,t=r4(3*K*r);
      // Horizontal: 6 points, 2 per end cap + 2 flat joins
      // Clockwise: top-right-join → right-mid → bot-right-join → bot-left-join → left-mid → top-left-join
      pts=[
        {x:r4(cx+hw-r),y:r4(cy+r), smooth:true,tangent:{x:t,   y:0}},  // top-right join, tangent →
        {x:r4(cx+hw),  y:r4(cy),   smooth:true,tangent:{x:0,   y:-t}},  // rightmost,      tangent ↓
        {x:r4(cx+hw-r),y:r4(cy-r), smooth:true,tangent:{x:-t,  y:0}},  // bot-right join, tangent ←
        {x:r4(cx-hw+r),y:r4(cy-r), smooth:true,tangent:{x:-t,  y:0}},  // bot-left join,  tangent ←
        {x:r4(cx-hw),  y:r4(cy),   smooth:true,tangent:{x:0,   y:t}},   // leftmost,       tangent ↑
        {x:r4(cx-hw+r),y:r4(cy+r), smooth:true,tangent:{x:t,   y:0}},  // top-left join,  tangent →
      ];
    }else{
      const r=hw,t=r4(3*K*r);
      // Vertical: 6 points
      // Clockwise: top-mid → top-right-join → bot-right-join → bot-mid → bot-left-join → top-left-join
      pts=[
        {x:r4(cx),    y:r4(cy+hh),   smooth:true,tangent:{x:t,  y:0}},   // topmost,        tangent →
        {x:r4(cx+r),  y:r4(cy+hh-r), smooth:true,tangent:{x:0,  y:-t}},  // top-right join, tangent ↓
        {x:r4(cx+r),  y:r4(cy-hh+r), smooth:true,tangent:{x:0,  y:-t}},  // bot-right join, tangent ↓
        {x:r4(cx),    y:r4(cy-hh),   smooth:true,tangent:{x:-t, y:0}},   // bottommost,     tangent ←
        {x:r4(cx-r),  y:r4(cy-hh+r), smooth:true,tangent:{x:0,  y:t}},   // bot-left join,  tangent ↑
        {x:r4(cx-r),  y:r4(cy+hh-r), smooth:true,tangent:{x:0,  y:t}},   // top-left join,  tangent ↑
      ];
    }
  }
  if(!pts.length)return;pushUndo();ly.pts.push(...pts);draw();
}

// RENDER
function draw(){
  ctx.clearRect(0,0,CW(),CH());drawGrid();
  const al=activeLy();
  for(const ly of S.layers){if(!ly.visible||ly===al)continue;drawLayer(ly,false);}
  if(al)drawLayer(al,true);
  if(['rect','tri','ellipse','capsule'].includes(S.drag?.type))drawShapePreview();
  if(S.drag?.type==='marquee')drawMarquee();
  if(S.selSet.length>1)drawTransformGizmo();
  updatePreview();refreshJSON();buildLayerUI();updateShapeButtons();
}

function drawGrid(){
  ctx.save();
  ctx.strokeStyle='rgba(255,255,255,0.03)';ctx.lineWidth=0.5;
  for(let x=-1;x<=2;x+=0.02){const[sx]=w2s(x,0);ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,CH());ctx.stroke();}
  for(let y=-0.5;y<=0.8;y+=0.02){const[,sy]=w2s(0,y);ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(CW(),sy);ctx.stroke();}
  ctx.strokeStyle='rgba(255,255,255,0.09)';
  for(let x=-1;x<=2;x+=0.1){const[sx]=w2s(x,0);ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,CH());ctx.stroke();}
  for(let y=-0.5;y<=0.8;y+=0.1){const[,sy]=w2s(0,y);ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(CW(),sy);ctx.stroke();}
  ctx.strokeStyle='rgba(255,255,255,0.2)';ctx.lineWidth=1;
  {const[ax]=w2s(0,0);ctx.beginPath();ctx.moveTo(ax,0);ctx.lineTo(ax,CH());ctx.stroke();}
  {const[,ay]=w2s(0,0);ctx.beginPath();ctx.moveTo(0,ay);ctx.lineTo(CW(),ay);ctx.stroke();}
  const[bx0,by0]=w2s(0,0),[bx1,by1]=w2s(1,0.3);
  ctx.strokeStyle='rgba(255,255,255,0.07)';ctx.setLineDash([4,4]);
  ctx.strokeRect(Math.min(bx0,bx1),Math.min(by0,by1),Math.abs(bx1-bx0),Math.abs(by1-by0));ctx.setLineDash([]);
  if(S.snap.on&&S.cam.z*S.snap.inc>=7){
    const inc=S.snap.inc,[minWX,minWY]=s2w(0,CH()),[maxWX,maxWY]=s2w(CW(),0);
    ctx.fillStyle='rgba(255,255,255,0.2)';
    for(let x=Math.ceil(minWX/inc)*inc;x<=maxWX;x+=inc)for(let y=Math.ceil(minWY/inc)*inc;y<=maxWY;y+=inc){const[sx,sy]=w2s(x,y);ctx.beginPath();ctx.arc(sx,sy,1.3,0,Math.PI*2);ctx.fill();}
  }
  ctx.restore();
}

function drawLayer(ly,active){
  ctx.save();ctx.globalAlpha=active?1.0:0.35;
  if(ly.type==='poly'){
    if(ly.pts.length>1){ctx.beginPath();tracePath(ctx,ly.pts,ly.closed);ctx.strokeStyle=ly.color;ctx.lineWidth=active?2:1;ctx.stroke();if(active){ctx.fillStyle=ly.color+'18';ctx.fill();}}
    if(active)drawPolyPoints(ly);
  }else if(ly.type==='ports'){drawPorts(ly,active);}
  else if(ly.type==='icon'){drawIconBox(ly,active);}
  ctx.restore();
}

function drawPolyPoints(ly){
  const sl=selLast();
  if(sl&&sl.lid===ly.id&&S.selSet.length===1){const p=ly.pts[sl.idx];if(p&&p.smooth)drawHandles(ly.pts,sl.idx);}
  for(let i=0;i<ly.pts.length;i++){
    const p=ly.pts[i],[sx,sy]=w2s(p.x,p.y),isSel=inSelSet({lid:ly.id,idx:i});
    ctx.beginPath();ctx.arc(sx,sy,isSel?7:5,0,Math.PI*2);
    if(isSel){ctx.fillStyle='#fff';ctx.strokeStyle='#111';ctx.lineWidth=1.5;}
    else{ctx.fillStyle=p.smooth?'#4a9de0':'#d06060';ctx.strokeStyle='#111';ctx.lineWidth=1;}
    ctx.fill();ctx.stroke();
  }
}

function drawHandles(pts,idx){
  const p=pts[idx],autoT=getTangent(pts,idx);
  const tOut=p.tangentOut||(p.tangent||autoT);
  const tIn =p.tangentIn ||(p.tangent||autoT);
  const hasOut=!!(p.tangentOut||p.tangent),hasIn=!!(p.tangentIn||p.tangent);
  const hOut={x:p.x+tOut.x/3,y:p.y+tOut.y/3},hIn={x:p.x-tIn.x/3,y:p.y-tIn.y/3};
  const[hox,hoy]=w2s(hOut.x,hOut.y),[hix,hiy]=w2s(hIn.x,hIn.y),[px,py]=w2s(p.x,p.y);
  ctx.save();
  ctx.lineWidth=1;ctx.setLineDash([3,3]);
  ctx.strokeStyle='rgba(255,200,100,.4)';ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(hox,hoy);ctx.stroke();
  ctx.strokeStyle='rgba(255,130,60,.4)';ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(hix,hiy);ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(hox,hoy,4,0,Math.PI*2);ctx.fillStyle=hasOut?'#ffcc44':'#888';ctx.strokeStyle='#111';ctx.lineWidth=1;ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(hix,hiy,4,0,Math.PI*2);ctx.fillStyle=hasIn?'#ff8844':'#888';ctx.strokeStyle='#111';ctx.lineWidth=1;ctx.fill();ctx.stroke();
  ctx.restore();
}

function drawPorts(ly,active){
  for(let i=0;i<ly.pts.length;i++){
    const p=ly.pts[i],[sx,sy]=w2s(p.x,p.y),isSel=inSelSet({lid:ly.id,idx:i}),sz=active?7:5;
    ctx.beginPath();ctx.moveTo(sx,sy-sz);ctx.lineTo(sx+sz,sy);ctx.lineTo(sx,sy+sz);ctx.lineTo(sx-sz,sy);ctx.closePath();
    ctx.fillStyle=isSel?'#fff':ly.color;ctx.strokeStyle='#111';ctx.lineWidth=1;ctx.fill();ctx.stroke();
    if(active){
      const rad=p.angle*Math.PI/180,len=22;
      ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+Math.cos(rad)*len,sy+Math.sin(rad)*len);ctx.strokeStyle=ly.color;ctx.lineWidth=1.5;ctx.stroke();
      ctx.beginPath();ctx.arc(sx+Math.cos(rad)*len,sy+Math.sin(rad)*len,4,0,Math.PI*2);ctx.fillStyle=ly.color+'90';ctx.strokeStyle=ly.color;ctx.lineWidth=1;ctx.fill();ctx.stroke();
    }
  }
}

function drawIconBox(ly,active){
  if(ly.pts.length<2)return;
  // Normalise to [minX,minY,maxX,maxY]
  const p0=ly.pts[0],p1=ly.pts[1];
  const mnX=Math.min(p0.x,p1.x),mnY=Math.min(p0.y,p1.y),mxX=Math.max(p0.x,p1.x),mxY=Math.max(p0.y,p1.y);
  const corners=[[mnX,mnY],[mxX,mnY],[mxX,mxY],[mnX,mxY]];
  const[sx0,sy0]=w2s(mnX,mnY),[sx1,sy1]=w2s(mxX,mxY);
  ctx.strokeStyle=ly.color;ctx.lineWidth=1;ctx.setLineDash([3,3]);
  ctx.strokeRect(Math.min(sx0,sx1),Math.min(sy0,sy1),Math.abs(sx1-sx0),Math.abs(sy1-sy0));ctx.setLineDash([]);
  if(active){
    corners.forEach(([wx,wy])=>{
      const[sx,sy]=w2s(wx,wy);ctx.beginPath();ctx.arc(sx,sy,4,0,Math.PI*2);ctx.fillStyle=ly.color;ctx.strokeStyle='#111';ctx.lineWidth=1;ctx.fill();ctx.stroke();
    });
  }
}

function drawTransformGizmo(){
  const bb=selBBox();if(!bb)return;
  ctx.save();
  const[x0,y0]=w2s(bb.minX,bb.minY),[x1,y1]=w2s(bb.maxX,bb.maxY);
  ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
  ctx.strokeRect(Math.min(x0,x1),Math.min(y0,y1),Math.abs(x1-x0),Math.abs(y1-y0));ctx.setLineDash([]);
  // Edge and corner handles
  for(const h of gizmoHandles(bb)){
    const[hx,hy]=w2s(h.wx,h.wy);
    if(h.axis==='xy'){ctx.fillStyle='#fff';ctx.strokeStyle='#333';ctx.lineWidth=1;ctx.fillRect(hx-4,hy-4,8,8);ctx.strokeRect(hx-4,hy-4,8,8);}
    else{ctx.beginPath();ctx.arc(hx,hy,4,0,Math.PI*2);ctx.fillStyle='#aaa';ctx.strokeStyle='#333';ctx.lineWidth=1;ctx.fill();ctx.stroke();}
  }
  // Rotation handle
  const rh=rotHandleSS(bb);
  ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=1;ctx.setLineDash([3,3]);
  ctx.beginPath();ctx.moveTo(...rh.stem);ctx.lineTo(...rh.tip);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(...rh.tip,6,0,Math.PI*2);ctx.fillStyle='#4a9de0';ctx.strokeStyle='#111';ctx.fill();ctx.stroke();
  ctx.restore();
}

function drawShapePreview(){
  const d=S.drag;if(!d)return;
  let x0=d.startWx,y0=d.startWy,x1=d.curWx,y1=d.curWy;
  // Shift = uniform (square/circle)
  if(d.shift){const sz=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));x1=x0+(x1>x0?sz:-sz);y1=y0+(y1>y0?sz:-sz);}
  const mnX=Math.min(x0,x1),mxX=Math.max(x0,x1),mnY=Math.min(y0,y1),mxY=Math.max(y0,y1);
  const cx=(mnX+mxX)/2,cy=(mnY+mxY)/2,hw=(mxX-mnX)/2,hh=(mxY-mnY)/2;
  const tf=w2s;
  ctx.save();ctx.strokeStyle='rgba(232,160,32,.85)';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
  ctx.beginPath();
  if(d.type==='rect'){
    const[sx0,sy0]=tf(mnX,mnY),[sx1,sy1]=tf(mxX,mxY);
    ctx.rect(Math.min(sx0,sx1),Math.min(sy0,sy1),Math.abs(sx1-sx0),Math.abs(sy1-sy0));
  }else if(d.type==='tri'){
    ctx.moveTo(...tf(cx,mxY));ctx.lineTo(...tf(mxX,mnY));ctx.lineTo(...tf(mnX,mnY));ctx.closePath();
  }else if(d.type==='ellipse'){
    // approximate with bezier
    const[scx,scy]=tf(cx,cy),[srx]=tf(cx+hw,cy),[sry]=tf(cx,cy+hh);
    const rx=Math.abs(srx-scx),ry=Math.abs(sry-scy);
    ctx.ellipse(scx,scy,rx,ry,0,0,Math.PI*2);
  }else if(d.type==='capsule'){
    // Use ctx.arc for geometrically exact semicircle preview
    if(hw>=hh){
      const r=hh;
      const[rcx,rcy]=w2s(cx+hw-r,cy),[lcx,lcy]=w2s(cx-hw+r,cy);
      const sr=r*S.cam.z;
      ctx.moveTo(lcx,rcy-sr);
      ctx.lineTo(rcx,rcy-sr);
      ctx.arc(rcx,rcy,sr,-Math.PI/2,Math.PI/2,false);
      ctx.lineTo(lcx,lcy+sr);
      ctx.arc(lcx,lcy,sr,Math.PI/2,-Math.PI/2,false);
      ctx.closePath();
    }else{
      const r=hw;
      const[tcx,tcy]=w2s(cx,cy+hh-r),[bcx,bcy]=w2s(cx,cy-hh+r);
      const sr=r*S.cam.z;
      ctx.moveTo(tcx+sr,tcy);
      ctx.lineTo(bcx+sr,bcy);
      ctx.arc(bcx,bcy,sr,0,Math.PI,false);
      ctx.lineTo(tcx-sr,tcy);
      ctx.arc(tcx,tcy,sr,Math.PI,0,false);
      ctx.closePath();
    }
  }
  ctx.stroke();ctx.setLineDash([]);ctx.restore();
}

function drawMarquee(){
  const d=S.drag;if(!d||d.type!=='marquee')return;
  const[sx0,sy0]=w2s(d.startWx,d.startWy),[sx1,sy1]=w2s(d.curWx,d.curWy);
  ctx.save();ctx.fillStyle='rgba(100,160,255,.07)';ctx.strokeStyle='rgba(100,160,255,.6)';ctx.lineWidth=1;ctx.setLineDash([4,3]);
  ctx.fillRect(Math.min(sx0,sx1),Math.min(sy0,sy1),Math.abs(sx1-sx0),Math.abs(sy1-sy0));
  ctx.strokeRect(Math.min(sx0,sx1),Math.min(sy0,sy1),Math.abs(sx1-sx0),Math.abs(sy1-sy0));
  ctx.setLineDash([]);ctx.restore();
}

// PREVIEW
function updatePreview(){
  const dpr=window.devicePixelRatio||1;
  pv.width=pv.offsetWidth*dpr;pv.height=(pv.offsetHeight||84)*dpr;
  pctx.clearRect(0,0,pv.width,pv.height);pctx.fillStyle='#2a2a2a';pctx.fillRect(0,0,pv.width,pv.height);
  const outline=getLayer('outline');if(!outline||outline.pts.length<2)return;
  let mnX=0,mnY=0,mxX=1,mxY=0.3;
  for(const p of outline.pts){mnX=Math.min(mnX,p.x);mnY=Math.min(mnY,p.y);mxX=Math.max(mxX,p.x);mxY=Math.max(mxY,p.y);}
  const wR=mxX-mnX,hR=mxY-mnY,PAD=12*dpr;
  const scale=Math.min((pv.width-PAD*2)/wR,(pv.height-PAD*2)/hR)*0.88;
  const ox=PAD+((pv.width-PAD*2)-wR*scale)/2-mnX*scale,oy=PAD+((pv.height-PAD*2)-hR*scale)/2+mxY*scale;
  const tf=(wx,wy)=>[ox+wx*scale,oy-wy*scale],res=bakeRes();
  for(const ly of S.layers){
    if(!ly.id.startsWith('flag_')||!ly.visible||ly.pts.length<2)continue;
    pctx.beginPath();pctx.moveTo(...tf(ly.pts[0].x,ly.pts[0].y));
    for(let i=1;i<ly.pts.length;i++)pctx.lineTo(...tf(ly.pts[i].x,ly.pts[i].y));
    pctx.closePath();pctx.fillStyle='rgba(80,130,160,.28)';pctx.fill();
  }
  const baked=bakeSpline(outline.pts,true,res);
  if(baked.length){pctx.beginPath();pctx.moveTo(...tf(...baked[0]));for(let i=1;i<baked.length;i++)pctx.lineTo(...tf(...baked[i]));
    pctx.closePath();pctx.fillStyle='rgba(145,195,220,.65)';pctx.strokeStyle='#e8a020';pctx.lineWidth=2*dpr;pctx.fill();pctx.stroke();}
  for(const ly of S.layers){
    if((ly.id!=='inputs'&&ly.id!=='outputs')||!ly.visible)continue;
    for(const p of ly.pts){pctx.beginPath();pctx.arc(...tf(p.x,p.y),4*dpr,0,Math.PI*2);pctx.fillStyle='#777';pctx.fill();}
  }
}

// JSON
const bakeRes=()=>Math.max(4,parseInt(document.getElementById('bake-res').value)||12);
function buildJSON(){
  const name=document.getElementById('name-in').value||'custom_node',res=bakeRes();
  const outline=getLayer('outline');const flags={};let fi=0;
  for(const ly of S.layers){if(!ly.id.startsWith('flag_'))continue;flags[fi++]={outline:bakeSpline(ly.pts,true,res)};}
  const inp=getLayer('inputs'),out=getLayer('outputs'),ico=getLayer('icon');
  return{name,flags,outline:outline?bakeSpline(outline.pts,true,res):[],
    inputs:inp?inp.pts.map(p=>[r4(p.x),r4(p.y),p.angle]):[],
    outputs:out?out.pts.map(p=>[r4(p.x),r4(p.y),p.angle]):[],
    icon:ico?ico.pts.map(p=>[r4(p.x),r4(p.y)]):[]};
}
function refreshJSON(){document.getElementById('json-out').value=JSON.stringify(buildJSON(),null,2);}
function copyJSON(){navigator.clipboard.writeText(JSON.stringify(buildJSON(),null,2)).then(()=>{const b=document.querySelector('.act-btn');b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1600);});}
function dlJSON(){const name=document.getElementById('name-in').value||'myshape';const blob=new Blob([JSON.stringify(buildJSON(),null,2)],{type:'application/json'});Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:name+'.json'}).click();}
function importFile(e){const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{loadJSON(JSON.parse(ev.target.result));}catch(err){alert('JSON parse error: '+err.message);}};r.readAsText(file);e.target.value='';}
function loadJSON(json){
  document.getElementById('name-in').value=json.name||'myshape';
  S.layers=[];flagCount=0;
  if(json.outline)S.layers.push(mkPoly(json.outline.map(([x,y])=>({x,y,smooth:false})),'#e8a020','outline','Outline'));
  if(json.flags){const keys=Object.keys(json.flags).map(Number).sort((a,b)=>a-b);for(const k of keys){S.layers.push(mkPoly(json.flags[k].outline.map(([x,y])=>({x,y,smooth:false})),FLAG_COLS[k%FLAG_COLS.length],`flag_${k}`,`Flag ${k}`));flagCount=Math.max(flagCount,k+1);}}
  const pp=(id,name,col,arr,defA)=>S.layers.push({id,name,type:'ports',visible:true,color:col,pts:(arr||[]).map(([x,y,a])=>({x,y,angle:a??defA}))});
  pp('inputs','Inputs','#5db55d',json.inputs,90);pp('outputs','Outputs','#d05555',json.outputs,270);
  S.layers.push({id:'icon',name:'Icon',type:'icon',visible:true,color:'#888',pts:(json.icon||[]).map(([x,y])=>({x,y}))});
  S.activeId='outline';S.selSet=[];draw();
}

// LAYER UI
function buildLayerUI(){
  const list=document.getElementById('layer-list');list.innerHTML='';
  for(const ly of S.layers){
    const div=document.createElement('div');div.className='ly'+(ly.id===S.activeId?' active':'');
    div.onclick=e=>{if(e.target.classList.contains('ly-del')||e.target.classList.contains('ly-vis'))return;S.activeId=ly.id;S.selSet=[];draw();};
    const vis=document.createElement('div');vis.className='ly-vis'+(ly.visible?' on':'');vis.title='Toggle display only';
    vis.onclick=e=>{e.stopPropagation();ly.visible=!ly.visible;draw();};
    const dot=Object.assign(document.createElement('div'),{className:'ly-dot'});dot.style.background=ly.color;
    const nm=Object.assign(document.createElement('span'),{className:'ly-name',textContent:ly.name});
    div.append(vis,dot,nm);
    if(ly.id.startsWith('flag_')){
      const del=Object.assign(document.createElement('span'),{className:'ly-del',textContent:'x'});
      del.onclick=e=>{e.stopPropagation();pushUndo();S.layers=S.layers.filter(l=>l.id!==ly.id);if(S.activeId===ly.id)S.activeId='outline';draw();};
      div.append(del);
    }
    list.appendChild(div);
  }
}

// SMOOTH/CORNER (applies to all selected poly pts)
function setSmoothProp(smooth){
  if(!S.selSet.length)return;pushUndo();
  for(const sl of S.selSet){const ly=getLayer(sl.lid);if(!ly||ly.type!=='poly')continue;const p=ly.pts[sl.idx];if(!p)continue;p.smooth=smooth;if(!smooth){delete p.tangent;delete p.tangentIn;delete p.tangentOut;}}
  draw();
}
const smoothSel=()=>setSmoothProp(true),cornerSel=()=>setSmoothProp(false);

// TOOLS
const SHAPE_TOOLS=['rect','tri','ellipse','capsule'];
function updateShapeButtons(){
  /** Disable shape tools when the active poly layer already has points. */
  const ly=activeLy();
  const hasPts=ly&&ly.type==='poly'&&ly.pts.length>0;
  for(const id of['rect','tri','ellipse','capsule']){
    const btn=document.getElementById('tb-'+id);
    if(!btn)continue;
    btn.disabled=!!hasPts;
    if(hasPts&&SHAPE_TOOLS.includes(S.tool))setTool('select');
  }
}

function togglePanel(which){
  const content=document.getElementById('right-content');
  const previewSec=document.getElementById('preview-section');
  const jsonSec=document.getElementById('json-section');
  const tabP=document.getElementById('tab-preview');
  const tabJ=document.getElementById('tab-json');
  const sec=which==='preview'?previewSec:jsonSec;
  const tab=which==='preview'?tabP:tabJ;
  const isOpen=sec.style.display==='flex';
  sec.style.display=isOpen?'none':'flex';
  tab.classList.toggle('open',!isOpen);
  // Show/hide content pane based on whether any section is open
  const anyOpen=previewSec.style.display==='flex'||jsonSec.style.display==='flex';
  content.classList.toggle('hidden',!anyOpen);
  if(!isOpen)requestAnimationFrame(()=>draw());
}

function toggleHelp(){
  const el=document.getElementById('shortcuts');
  const btn=document.getElementById('help-toggle');
  const open=el.style.display==='none'||el.style.display==='';
  el.style.display=open?'block':'none';
  btn.classList.toggle('open',open);
}

function setTool(t){
  S.tool=t;S.selSet=[];S.drag=null;
  ['select','add','delete','rect','tri','ellipse','capsule'].forEach(id=>{
    const btn=document.getElementById('tb-'+id);if(btn)btn.classList.toggle('active',id===t);
  });
  cv.style.cursor=t==='add'?'crosshair':t==='delete'?'no-drop':SHAPE_TOOLS.includes(t)?'crosshair':'default';
  draw();
}
function toggleSnap(){S.snap.on=!S.snap.on;document.getElementById('tb-snap').classList.toggle('snap-on',S.snap.on);draw();}

// PRESETS
function drawPresetThumb(canvas,data){
  const c=canvas.getContext('2d');const outline=data.outline;
  if(!outline||outline.length<2){c.fillStyle='#1e1e1e';c.fillRect(0,0,canvas.width,canvas.height);return;}
  let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  for(const[x,y]of outline){mnX=Math.min(mnX,x);mnY=Math.min(mnY,y);mxX=Math.max(mxX,x);mxY=Math.max(mxY,y);}
  const wR=Math.max(mxX-mnX,0.01),hR=Math.max(mxY-mnY,0.01),PAD=5;
  const scale=Math.min((canvas.width-PAD*2)/wR,(canvas.height-PAD*2)/hR)*0.88;
  const ox=PAD+((canvas.width-PAD*2)-wR*scale)/2-mnX*scale,oy=PAD+((canvas.height-PAD*2)-hR*scale)/2+mxY*scale;
  const tf=(x,y)=>[ox+x*scale,oy-y*scale];
  c.fillStyle='#1e1e1e';c.fillRect(0,0,canvas.width,canvas.height);
  if(data.flags){for(const k of Object.keys(data.flags)){const fl=data.flags[k].outline;if(!fl||fl.length<2)continue;c.beginPath();c.moveTo(...tf(...fl[0]));for(let i=1;i<fl.length;i++)c.lineTo(...tf(...fl[i]));c.closePath();c.fillStyle='rgba(60,110,140,.35)';c.fill();}}
  c.beginPath();c.moveTo(...tf(...outline[0]));for(let i=1;i<outline.length;i++)c.lineTo(...tf(...outline[i]));c.closePath();
  c.fillStyle='rgba(145,195,220,.6)';c.strokeStyle='#e8a020';c.lineWidth=1.5;c.fill();c.stroke();
}
function openPresets(){
  const grid=document.getElementById('presets-grid');grid.innerHTML='';
  for(const[name,data]of Object.entries(PRESETS)){
    const cell=document.createElement('div');cell.className='preset-cell';
    const cv2=document.createElement('canvas');cv2.width=110;cv2.height=64;drawPresetThumb(cv2,data);
    const lbl=document.createElement('div');lbl.className='preset-name';lbl.textContent=name;
    cell.append(cv2,lbl);cell.onclick=()=>{pushUndo();loadJSON(JSON.parse(JSON.stringify(data)));closePresets();};
    grid.appendChild(cell);
  }
  document.getElementById('presets-overlay').classList.add('open');
}
function closePresets(){document.getElementById('presets-overlay').classList.remove('open');}

// HIT TESTING
const HIT_R=10,HANDLE_HIT_R=9;

function hitTransformHandle(sx,sy){
  if(S.selSet.length<2)return null;
  const bb=selBBox();if(!bb)return null;
  // Rotation first (screen-space, always wins)
  const rh=rotHandleSS(bb);if(Math.hypot(sx-rh.tip[0],sy-rh.tip[1])<12)return{type:'rotate'};
  for(const h of gizmoHandles(bb)){const[hsx,hsy]=w2s(h.wx,h.wy);if(Math.hypot(sx-hsx,sy-hsy)<HANDLE_HIT_R)return h;}
  return null;
}

function hitAngleTip(sx,sy){
  const ly=activeLy();if(!ly||ly.type!=='ports')return null;
  for(let i=0;i<ly.pts.length;i++){const p=ly.pts[i],[psx,psy]=w2s(p.x,p.y);const rad=p.angle*Math.PI/180;if(Math.hypot(sx-(psx+Math.cos(rad)*22),sy-(psy+Math.sin(rad)*22))<9)return{lid:ly.id,idx:i};}
  return null;
}

function hitIconCorner(sx,sy){
  /** Returns corner index 0-3 or null. */
  const ly=activeLy();if(!ly||ly.type!=='icon'||ly.pts.length<2)return null;
  const p0=ly.pts[0],p1=ly.pts[1];
  const mnX=Math.min(p0.x,p1.x),mnY=Math.min(p0.y,p1.y),mxX=Math.max(p0.x,p1.x),mxY=Math.max(p0.y,p1.y);
  const corners=[[mnX,mnY],[mxX,mnY],[mxX,mxY],[mnX,mxY]];
  for(let i=0;i<4;i++){const[wx,wy]=corners[i],[csx,csy]=w2s(wx,wy);if(Math.hypot(sx-csx,sy-csy)<9)return i;}
  return null;
}

function hitPoint(sx,sy){
  const ly=activeLy();if(!ly)return null;
  // Tangent handles — single poly pt selected
  if(S.selSet.length===1&&ly.type==='poly'){
    const sl=selLast(),p=ly.pts[sl.idx];
    if(p&&p.smooth){
      const autoT=getTangent(ly.pts,sl.idx);
      const tOut=p.tangentOut||(p.tangent||autoT),tIn=p.tangentIn||(p.tangent||autoT);
      const hOut={x:p.x+tOut.x/3,y:p.y+tOut.y/3},hIn={x:p.x-tIn.x/3,y:p.y-tIn.y/3};
      for(const[side,h]of[['out',hOut],['in',hIn]]){const[hsx,hsy]=w2s(h.x,h.y);if(Math.hypot(sx-hsx,sy-hsy)<HANDLE_HIT_R)return{lid:ly.id,idx:sl.idx,handle:side};}
    }
  }
  const pts=ly.pts||[];
  for(let i=0;i<pts.length;i++){const[px,py]=w2s(pts[i].x,pts[i].y);if(Math.hypot(sx-px,sy-py)<HIT_R)return{lid:ly.id,idx:i};}
  return null;
}

// ADD POINT HELPER
function addPointAt(wx,wy,sx,sy){
  const ly=activeLy();if(!ly)return;pushUndo();
  if(ly.type==='poly'){
    const[snx,sny]=snapXY(wx,wy),hit=hitSegment(sx,sy);
    if(hit&&ly.pts.length>=2){insertOnSegment(ly,hit);}
    else{ly.pts.push({x:r4(snx),y:r4(sny),smooth:true});S.selSet=[{lid:ly.id,idx:ly.pts.length-1}];}
  }else if(ly.type==='ports'){
    ly.pts.push({x:r4(wx),y:r4(wy),angle:ly.id==='inputs'?90:270});S.selSet=[{lid:ly.id,idx:ly.pts.length-1}];
  }
  draw();
}

// MOUSE
cv.addEventListener('mousedown',e=>{
  const{sx,sy,wx,wy}=evCoords(e);
  if(e.button===1){S.pan={mx:e.clientX,my:e.clientY,cx:S.cam.x,cy:S.cam.y};e.preventDefault();return;}
  if(e.button!==0)return;

  // Shape draw tools
  if(SHAPE_TOOLS.includes(S.tool)){
    const[snx,sny]=snapXY(wx,wy);
    S.drag={type:S.tool,startWx:snx,startWy:sny,curWx:snx,curWy:sny};return;
  }

  // Add tool
  if(S.tool==='add'){addPointAt(wx,wy,sx,sy);return;}

  // Alt+click = add point (in any tool mode)
  if(e.altKey&&!e.ctrlKey){e.preventDefault();addPointAt(wx,wy,sx,sy);return;}

  // Delete tool
  if(S.tool==='delete'){
    const hit=hitPoint(sx,sy);if(!hit)return;const l=getLayer(hit.lid);if(!l)return;
    pushUndo();(l.pts||[]).splice(hit.idx,1);S.selSet=[];draw();return;
  }

  // Select tool
  const th=hitTransformHandle(sx,sy);
  if(th){
    const bb=selBBox(),origPts=snapshotSel();pushUndo();
    if(th.type==='scale'){S.drag={type:'scale',handleId:th.id,anchor:th.anchor,axis:th.axis,origBBox:{...bb},origPts};}
    else{const cx=(bb.minX+bb.maxX)/2,cy=(bb.minY+bb.maxY)/2;S.drag={type:'rotate',centroid:{x:cx,y:cy},startAngle:Math.atan2(wy-cy,wx-cx),origPts};}
    draw();return;
  }

  // Icon corner drag
  const ic=hitIconCorner(sx,sy);
  if(ic!==null){
    const ly=activeLy();pushUndo();
    // Store all 4 corners; drag moves the hit corner, opposite corner is anchor
    const p0=ly.pts[0],p1=ly.pts[1];
    const mnX=Math.min(p0.x,p1.x),mnY=Math.min(p0.y,p1.y),mxX=Math.max(p0.x,p1.x),mxY=Math.max(p0.y,p1.y);
    const corners=[[mnX,mnY],[mxX,mnY],[mxX,mxY],[mnX,mxY]];
    const opp=corners[(ic+2)%4];
    S.drag={type:'icon',cornerIdx:ic,anchor:{x:opp[0],y:opp[1]},origW:mxX-mnX,origH:mxY-mnY};
    draw();return;
  }

  // Port angle tip
  const at=hitAngleTip(sx,sy);
  if(at){pushUndo();S.selSet=[{lid:at.lid,idx:at.idx}];S.drag={type:'angle',lid:at.lid,idx:at.idx};draw();return;}

  // Regular point
  const hit=hitPoint(sx,sy);
  if(hit){
    if(hit.handle){pushUndo();S.drag={type:'handle',side:hit.handle,breakSymmetry:false};draw();return;}
    const hitRef={lid:hit.lid,idx:hit.idx},alreadySel=inSelSet(hitRef);
    if(e.shiftKey){
      if(alreadySel)S.selSet=S.selSet.filter(s=>!(s.lid===hit.lid&&s.idx===hit.idx));
      else if(!S.selSet.length||S.selSet[0].lid===hit.lid)S.selSet.push(hitRef);
      S.drag=null;
    }else{
      S.selSet=alreadySel&&S.selSet.length>1?S.selSet:[hitRef];
      pushUndo();S.drag={type:'translate',startWx:wx,startWy:wy,origPts:snapshotSel()};
    }
    draw();return;
  }

  if(!e.shiftKey)S.selSet=[];
  S.drag={type:'marquee',startWx:wx,startWy:wy,curWx:wx,curWy:wy};draw();
});

cv.addEventListener('mousemove',e=>{
  const{sx,sy,wx,wy}=evCoords(e);
  const sn=S.snap.on?` [snap ${S.snap.inc}]`:'';
  document.getElementById('coord').textContent=`x:${wx.toFixed(3)}  y:${wy.toFixed(3)}  zoom:${S.cam.z.toFixed(0)}${sn}`;
  if(S.pan){S.cam.x=S.pan.cx-(e.clientX-S.pan.mx)/S.cam.z;S.cam.y=S.pan.cy+(e.clientY-S.pan.my)/S.cam.z;draw();return;}
  if(!S.drag)return;const d=S.drag;

  if(SHAPE_TOOLS.includes(d.type)){
    const[snx,sny]=snapXY(wx,wy);
    d.curWx=snx;d.curWy=sny;d.shift=e.shiftKey;
    draw();return;
  }

  if(d.type==='translate'){
    let dx=wx-d.startWx,dy=wy-d.startWy;
    if(S.snap.on&&d.origPts.length){const f=d.origPts[0],[snx,sny]=snapXY(f.x+dx,f.y+dy);dx=snx-f.x;dy=sny-f.y;}
    for(const op of d.origPts){const p=getPt(op);if(!p)continue;p.x=r4(op.x+dx);p.y=r4(op.y+dy);}

  }else if(d.type==='handle'){
    const sl=selLast();if(!sl)return;const ly=getLayer(sl.lid);if(!ly||ly.type!=='poly')return;
    const p=ly.pts[sl.idx];if(!p)return;
    const sign=d.side==='out'?1:-1;
    const newT={x:(wx-p.x)*3*sign,y:(wy-p.y)*3*sign};
    const isAsymmetric=!!(p.tangentIn||p.tangentOut);
    if(e.altKey){
      // Alt+drag = restore symmetry: both handles locked together
      p.tangent=newT;delete p.tangentOut;delete p.tangentIn;
    }else if(e.ctrlKey||isAsymmetric){
      // Ctrl+drag OR already broken = update only this side, preserve the other
      if(p.tangent){
        // Split symmetric into two before modifying one side
        p.tangentOut={...p.tangent};p.tangentIn={...p.tangent};delete p.tangent;
      }
      if(d.side==='out')p.tangentOut=newT;
      else p.tangentIn=newT;
    }else{
      // Symmetric: move both handles together
      p.tangent=newT;delete p.tangentOut;delete p.tangentIn;
    }

  }else if(d.type==='scale'){
    const{anchor,origBBox,handleId,axis,origPts}=d;
    const origH={nw:{x:origBBox.minX,y:origBBox.maxY},ne:{x:origBBox.maxX,y:origBBox.maxY},se:{x:origBBox.maxX,y:origBBox.minY},sw:{x:origBBox.minX,y:origBBox.minY},n:{x:(origBBox.minX+origBBox.maxX)/2,y:origBBox.maxY},s:{x:(origBBox.minX+origBBox.maxX)/2,y:origBBox.minY},e:{x:origBBox.maxX,y:(origBBox.minY+origBBox.maxY)/2},w:{x:origBBox.minX,y:(origBBox.minY+origBBox.maxY)/2}}[handleId];
    if(axis==='x'||axis==='y'){
      // Edge handle: scale one axis only
      const scX=axis==='x'?(origH.x===anchor.x?1:(wx-anchor.x)/(origH.x-anchor.x)):1;
      const scY=axis==='y'?(origH.y===anchor.y?1:(wy-anchor.y)/(origH.y-anchor.y)):1;
      for(const op of origPts){const p=getPt(op);if(!p)continue;p.x=r4(anchor.x+(op.x-anchor.x)*scX);p.y=r4(anchor.y+(op.y-anchor.y)*scY);}
    }else if(e.ctrlKey&&e.shiftKey){
      // Ctrl+Shift+drag corner = uniform scale around bbox centroid
      const cent={x:(origBBox.minX+origBBox.maxX)/2,y:(origBBox.minY+origBBox.maxY)/2};
      const origD=Math.hypot(origH.x-cent.x,origH.y-cent.y);
      const sc=origD>1e-5?Math.hypot(wx-cent.x,wy-cent.y)/origD:1;
      for(const op of origPts){const p=getPt(op);if(!p)continue;p.x=r4(cent.x+(op.x-cent.x)*sc);p.y=r4(cent.y+(op.y-cent.y)*sc);}
    }else if(e.shiftKey){
      // Shift+drag corner = uniform scale from anchor
      const origD=Math.hypot(origH.x-anchor.x,origH.y-anchor.y);
      const sc=origD>1e-5?Math.hypot(wx-anchor.x,wy-anchor.y)/origD:1;
      for(const op of origPts){const p=getPt(op);if(!p)continue;p.x=r4(anchor.x+(op.x-anchor.x)*sc);p.y=r4(anchor.y+(op.y-anchor.y)*sc);}
    }else{
      // Plain corner drag = non-uniform scale from anchor
      const scX=origH.x===anchor.x?1:(wx-anchor.x)/(origH.x-anchor.x);
      const scY=origH.y===anchor.y?1:(wy-anchor.y)/(origH.y-anchor.y);
      for(const op of origPts){const p=getPt(op);if(!p)continue;p.x=r4(anchor.x+(op.x-anchor.x)*scX);p.y=r4(anchor.y+(op.y-anchor.y)*scY);}
    }

  }else if(d.type==='rotate'){
    const{centroid,startAngle,origPts}=d;
    let angle=Math.atan2(wy-centroid.y,wx-centroid.x)-startAngle;
    if(e.shiftKey){const s15=15*Math.PI/180;angle=Math.round(angle/s15)*s15;}
    const cos=Math.cos(angle),sin=Math.sin(angle);
    for(const op of origPts){const p=getPt(op);if(!p)continue;const rx=op.x-centroid.x,ry=op.y-centroid.y;p.x=r4(centroid.x+rx*cos-ry*sin);p.y=r4(centroid.y+rx*sin+ry*cos);}

  }else if(d.type==='angle'){
    const ly=getLayer(d.lid),p=ly?.pts[d.idx];
    if(p){const[psx,psy]=w2s(p.x,p.y);p.angle=((Math.round(Math.atan2(sy-psy,sx-psx)*180/Math.PI)%360)+360)%360;}

  }else if(d.type==='icon'){
    // Drag corner: anchor is opposite corner, mouse sets the dragged corner.
    // Uniform: constrain to square using the larger axis delta.
    const ly=activeLy();if(!ly||ly.type!=='icon')return;
    const anc=d.anchor;
    let dx=wx-anc.x,dy=wy-anc.y;
    const sz=Math.max(Math.abs(dx),Math.abs(dy));
    dx=sz*(dx<0?-1:1);dy=sz*(dy<0?-1:1);
    ly.pts[0]={x:r4(anc.x),        y:r4(anc.y)};
    ly.pts[1]={x:r4(anc.x+dx),     y:r4(anc.y+dy)};

  }else if(d.type==='marquee'){d.curWx=wx;d.curWy=wy;}
  draw();
});

cv.addEventListener('mouseup',e=>{
  if(S.drag&&SHAPE_TOOLS.includes(S.drag.type)){
    let{startWx:x0,startWy:y0,curWx:x1,curWy:y1,shift,type}=S.drag;
    if(shift){const sz=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));x1=x0+(x1>x0?sz:-sz);y1=y0+(y1>y0?sz:-sz);}
    commitShape(type,x0,y0,x1,y1);
    S.drag=null;setTool('select');return;
  }
  if(S.drag?.type==='marquee'){
    const d=S.drag,x0=Math.min(d.startWx,d.curWx),x1=Math.max(d.startWx,d.curWx),y0=Math.min(d.startWy,d.curWy),y1=Math.max(d.startWy,d.curWy);
    const ly=activeLy();
    if(ly&&Math.abs(x1-x0)>0.004){const found=[];(ly.pts||[]).forEach((p,i)=>{if(p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1)found.push({lid:ly.id,idx:i});});if(found.length)S.selSet=e.shiftKey?[...S.selSet,...found]:found;}
  }
  S.drag=null;S.pan=null;draw();
});
cv.addEventListener('mouseleave',()=>{S.pan=null;});
cv.addEventListener('wheel',e=>{
  e.preventDefault();const{sx,sy}=evCoords(e);const[wx0,wy0]=s2w(sx,sy);
  S.cam.z=Math.min(3000,Math.max(60,S.cam.z*(e.deltaY<0?1.15:.87)));
  const[wx1,wy1]=s2w(sx,sy);S.cam.x+=wx0-wx1;S.cam.y+=wy0-wy1;draw();
},{passive:false});
function evCoords(e){const rect=cv.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;const[wx,wy]=s2w(sx,sy);return{sx,sy,wx,wy};}

// KEYBOARD
document.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
  if(e.key==='Escape'){closePresets();document.getElementById('about-overlay')?.classList.remove('open');S.selSet=[];draw();return;}
  if(e.ctrlKey||e.metaKey){
    if(e.key==='z'){e.preventDefault();undo();return;}
    if(e.key==='y'||(e.key==='Z'&&e.shiftKey)){e.preventDefault();redo();return;}
  }
  switch(e.key.toLowerCase()){
    case 'v':setTool('select');break;case 'a':setTool('add');break;case 'd':setTool('delete');break;
    case 'r':setTool('rect');break;case 't':setTool('tri');break;case 'e':setTool('ellipse');break;
    case 's':smoothSel();break;case 'c':cornerSel();break;case 'f':fitView();break;case 'g':toggleSnap();break;
    case 'delete':case 'backspace':
      if(!S.selSet.length)break;pushUndo();
      [...S.selSet].sort((a,b)=>b.idx-a.idx).forEach(sl=>{const ly=getLayer(sl.lid);if(ly)(ly.pts||[]).splice(sl.idx,1);});
      S.selSet=[];draw();break;
  }
});

// CAMERA
function fitView(){const w=document.getElementById('canvas-wrap');S.cam.x=0.5;S.cam.y=0.15;S.cam.z=Math.max(60,Math.min((w.clientWidth-60)/1.0,(w.clientHeight-60)/0.6)*0.88);draw();}
function resizeCanvas(){const w=document.getElementById('canvas-wrap');cv.width=w.clientWidth;cv.height=w.clientHeight;}

// INIT
async function init(){
  const names=await fetch('index.json').then(r=>r.json());
  await Promise.all(names.map(n=>fetch(`presets/${n}.json`).then(r=>r.json()).then(d=>{PRESETS[n]=d;})));
  loadJSON(JSON.parse(JSON.stringify(PRESETS['blunt'])));
  document.getElementById('name-in').value='myshape';
  resizeCanvas();fitView();
}
init();
window.addEventListener('resize',()=>{resizeCanvas();fitView();});