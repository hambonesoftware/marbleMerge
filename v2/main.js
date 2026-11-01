import * as THREE from 'three';
import RAPIER from 'rapier';

// Marble Merge 2.0 / physics workshop. World space: Y is vertical.
const $ = (id) => document.getElementById(id);
const loading = $('loading');
const setLoading = (message) => { $('loading-text').textContent = message; };
const palette = [
  {name:'Ruby',base:'#e84c70',swirl:'#fff0ce'},
  {name:'Amber',base:'#e9a148',swirl:'#fff2c4'},
  {name:'Lemon',base:'#f5cc55',swirl:'#fff9de'},
  {name:'Jade',base:'#45c89d',swirl:'#d5fff4'},
  {name:'Lagoon',base:'#37bfda',swirl:'#e4f9ff'},
  {name:'Sapphire',base:'#557bd7',swirl:'#cfe9ff'},
  {name:'Amethyst',base:'#9871cf',swirl:'#f3ddff'},
  {name:'Rose',base:'#e66bc7',swirl:'#ffddf3'}
];
const STEP = 1/120;
const START_COUNT = 32;
const START_RADIUS = .30;
const FUNNEL = {x:-2,z:-8,r:9.7,inner:.86,top:9.5,depth:9.2};
const WHEEL_CENTER = {x:17,y:-6.6,z:-7.45};
const room = {x:44,z:44,ground:-22};
const UPPER_POINTS = [
  [-37,72,-37],[-15,69,-37],[8,66,-36],[24,63,-32],
  [35,60,-22],[38,56,-3],[37,51,14],[32,47,29],
  [19,43,37],[-6,38,38],[-23,34,36],[-35,29,28],
  [-38,25,12],[-36,20,-5],[-29,16,-15],[-21,13,-18],
  [-16,11.2,-14],[-11.7,9.58,-8.1],[-10.0,8.70,-4.7]
];
const LOWER_POINTS = [
  [-3.9,-3.9,-8],[-1.7,-4.4,-8],[3,-5.4,-8],
  [9,-7,-8],[17,-9.1,-8],[23,-12.8,-8],
  [29,-16,-8],[34,-18.5,-8]
];
const UPPER_SAMPLES=720;
const upperCurve=new THREE.CatmullRomCurve3(UPPER_POINTS.map(p=>new THREE.Vector3(...p)),false,'catmullrom',.2);
const upperLength=upperCurve.getLength();
const upperPositions=Array.from({length:UPPER_SAMPLES+1},(_,i)=>upperCurve.getPointAt(i/UPPER_SAMPLES));
const clock = new THREE.Clock();
let simTime=0, raceSpeed=1, paused=false, merges=0, finished=0, winner=null;
let accumulator=0, followId=0, viewMode='follow', toastUntil=0;
let marbles=[], particles=[], rotor=null, rotorMesh=null, pendulums=[];
let world, scene, camera, renderer;
let diagnostic=false;
let nextId=0, selected=null;
const tempV=new THREE.Vector3();
const tempQ=new THREE.Quaternion();
const watchTarget=new THREE.Vector3(-3,3,-8);
const camDesired=new THREE.Vector3(0,20,29);
const woodCache=new Map();

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function bodyVec(v){return {x:v.x,y:v.y,z:v.z};}
function formatTime(t){const m=String(Math.floor(t/60)).padStart(2,'0');const s=(t%60).toFixed(1).padStart(4,'0');return m+':'+s;}
function radiusForTier(tier){return START_RADIUS*Math.min(2.15,Math.pow(1.17,tier-1));}
function showToast(message,duration=2.4){$('toast').textContent=message;$('toast').classList.add('visible');toastUntil=simTime+duration;}
function hideLoading(){loading.classList.add('hidden');}
function clearNode(n){while(n.firstChild)n.removeChild(n.firstChild);}

function noise(seed){let x=seed|0;return()=>{x=(Math.imul(x,1664525)+1013904223)|0;return(x>>>0)/4294967296;};}
function makeWoodTexture(seed,light='#bf8651',dark='#674124') {
  if(diagnostic)return new THREE.Texture();
  const key=seed+':'+light;
  if(woodCache.has(key))return woodCache.get(key);
  const rnd=noise(seed), can=document.createElement('canvas');can.width=512;can.height=512;
  const ctx=can.getContext('2d'),grad=ctx.createLinearGradient(0,0,512,0);
  grad.addColorStop(0,dark);grad.addColorStop(.15,light);grad.addColorStop(.51,'#deb17a');grad.addColorStop(.85,light);grad.addColorStop(1,dark);
  ctx.fillStyle=grad;ctx.fillRect(0,0,512,512);
  for(let i=0;i<160;i++){
    const x=rnd()*512, width=.35+rnd()*2.3,shift=rnd()*2000;
    ctx.beginPath();
    for(let y=-10;y<=522;y+=9){
      const xx=x+Math.sin(y*.012+shift)*(.7+5*rnd())+Math.sin(y*.038+shift*.6)*2;
      if(y===-10)ctx.moveTo(xx,y);else ctx.lineTo(xx,y);
    }
    ctx.strokeStyle=rnd()>.5?'rgba(67,36,13,.095)':'rgba(255,245,208,.16)';
    ctx.lineWidth=width;ctx.stroke();
  }
  for(let k=0;k<3;k++){
    const x=40+rnd()*430,y=rnd()*500;ctx.save();ctx.translate(x,y);ctx.rotate((rnd()-.5)*.25);
    for(let j=0;j<3;j++){ctx.beginPath();ctx.ellipse(0,0,5+j*7,12+j*12,0,0,Math.PI*2);ctx.strokeStyle='rgba(73,43,25,.10)';ctx.lineWidth=1.1;ctx.stroke();}
    ctx.restore();
  }
  const tex=new THREE.CanvasTexture(can);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  woodCache.set(key,tex);return tex;
}
function makeSwirlTexture(base,second,seed){
  if(diagnostic)return new THREE.Texture();
  const can=document.createElement('canvas');can.width=512;can.height=256;
  const ctx=can.getContext('2d'),rnd=noise(seed);
  const grad=ctx.createLinearGradient(0,0,0,256);grad.addColorStop(0,'#ffffff');grad.addColorStop(.2,base);grad.addColorStop(.8,base);grad.addColorStop(1,'#ffffff');
  ctx.fillStyle=grad;ctx.fillRect(0,0,512,256);
  for(let stripe=0;stripe<7;stripe++){
    const origin=stripe*98-130,width=14+rnd()*13,phase=rnd()*Math.PI*2;
    ctx.beginPath();
    for(let y=-25;y<=281;y+=3){
      const x=origin + y*.54 + 38*Math.sin(y*.023+phase);
      if(y===-25)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.strokeStyle=second;ctx.lineWidth=width;ctx.lineCap='round';ctx.globalAlpha=.88;ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=width*.25;ctx.stroke();
  }
  ctx.globalAlpha=.17;
  for(let i=0;i<220;i++){ctx.fillStyle=rnd()>.5?'#fff':'#58432d';ctx.beginPath();ctx.arc(rnd()*512,rnd()*256,.15+rnd()*1.4,0,Math.PI*2);ctx.fill();}
  const t=new THREE.CanvasTexture(can);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}
function basicWood(seed=9){return new THREE.MeshStandardMaterial({map:makeWoodTexture(seed),color:0xffe9cf,roughness:.45,metalness:.03,side:THREE.DoubleSide});}
const brass=new THREE.MeshStandardMaterial({color:0xb9975b,roughness:.29,metalness:.68});
const darkIron=new THREE.MeshStandardMaterial({color:0x3b3935,roughness:.47,metalness:.72});
const cream=new THREE.MeshStandardMaterial({color:0xe7d5b8,roughness:.9});
const darkPanel=new THREE.MeshStandardMaterial({color:0x674d3b,roughness:.85});
const decorative=new THREE.MeshStandardMaterial({color:0x9a6b48,roughness:.66});

function mesh(geom,mat,position=null,cast=true,receive=true){
  const item=new THREE.Mesh(geom,mat);if(position)item.position.copy(position);item.castShadow=cast;item.receiveShadow=receive;scene.add(item);return item;
}
function box(w,h,d,x,y,z,mat,cast=true){return mesh(new THREE.BoxGeometry(w,h,d),mat,new THREE.Vector3(x,y,z),cast);}
function cylinder(radius,depth,x,y,z,material,segments=16){
  return mesh(new THREE.CylinderGeometry(radius,radius,depth,segments),material,new THREE.Vector3(x,y,z));
}
function lineCylinder(a,b,rad,mat){
  const delta=new THREE.Vector3().subVectors(b,a);
  const obj=mesh(new THREE.CylinderGeometry(rad,rad,delta.length(),9),mat,a.clone().add(b).multiplyScalar(.5));
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return obj;
}
function glowPanel(x,y,z,sx,sy,color=0xffd8a0){
  const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false});
  const pane=mesh(new THREE.PlaneGeometry(sx,sy),m,new THREE.Vector3(x,y,z),false,false);return pane;
}
function buildRoom(){
  box(90,1,90,0,room.ground-.5,0,new THREE.MeshStandardMaterial({map:makeWoodTexture(25,'#94683f','#4c3021'),roughness:.8}),false);
  const wallMaterial=cream;
  box(90,124,1,0,39,-44,wallMaterial,false);
  box(90,124,1,0,39,44,wallMaterial,false);
  box(1,124,90,-44,39,0,wallMaterial,false);
  box(1,124,90,44,39,0,wallMaterial,false);
  box(90,1,90,0,101,0,new THREE.MeshStandardMaterial({color:0xb9a184,roughness:.94}),false);
  for(let x=-39;x<=40;x+=9){
    for(const z of [-43.45,43.45]){
      box(.36,120,.38,x,39,z,decorative,false);
      box(1.1,1,1.1,x,96,z,decorative,false);
      box(1.1,1,1.1,x,-19,z,decorative,false);
    }
  }
  for(let z=-39;z<=40;z+=9){
    for(const x of [-43.45,43.45]){
      box(.36,120,.38,x,39,z,decorative,false);
      box(1.1,1,1.1,x,96,z,decorative,false);
    }
  }
  for(const z of [-43.42,43.42]){
    for(let x=-36;x<40;x+=18)for(const h of [12,44,76]){
      const pane=glowPanel(x,h,z+(z<0?.24:-.24),5.4,10,0xffe4c0);
      if(z>0)pane.rotation.y=Math.PI;
      for(let dy of [-5,5])box(6.0,.24,.2,x,h+dy,z+(z<0?.3:-.3),decorative,false);
      box(.22,10.3,.2,x,h,z+(z<0?.3:-.3),decorative,false);
    }
  }
  // Tall continuous oak trim establishes three distinct gallery levels.
  for(const elevation of [-19,23,59,96]){
    for(const z of [-43.2,43.2])box(89,.44,.62,0,elevation,z,decorative,false);
    for(const x of [-43.2,43.2])box(.62,.44,89,x,elevation,0,decorative,false);
  }
  const wallCollision=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(46,.5,46).setTranslation(0,room.ground-.5,0),wallCollision);
  for(const [x,z,w,d] of [[0,-44,45,.5],[0,44,45,.5],[-44,0,.5,45],[44,0,.5,45]]){
    world.createCollider(RAPIER.ColliderDesc.cuboid(w,62,d).setTranslation(x,39,z),wallCollision);
  }
  scene.background=new THREE.Color(0x796958);
  scene.fog=new THREE.FogExp2(0xb4a18c,.006);
  scene.add(new THREE.AmbientLight(0xf8e5cc,.9));
  scene.add(new THREE.HemisphereLight(0xfff1d4,0x564035,1.25));
  const sun=new THREE.DirectionalLight(0xfff0d5,2.2);sun.position.set(24,94,20);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left=-75;sun.shadow.camera.right=75;sun.shadow.camera.top=75;sun.shadow.camera.bottom=-75;sun.shadow.camera.near=.1;sun.shadow.camera.far=230;sun.shadow.bias=-.0005;scene.add(sun);
  const warm=new THREE.PointLight(0xffcc8b,80,78,2);warm.position.set(-18,67,-12);scene.add(warm);
  const stage=new THREE.PointLight(0xffebc7,60,55,2);stage.position.set(20,33,-4);scene.add(stage);
  // Brass-framed ceiling lamps and crown molding establish an actual room.
  for(const p of [[-19,-18],[13,-17],[21,19]]){
    lineCylinder(new THREE.Vector3(p[0],100,p[1]),new THREE.Vector3(p[0],94,p[1]),.095,darkIron);
    const fixture=cylinder(1.15,.35,p[0],93.7,p[1],brass,24);
    fixture.material=brass;
    mesh(new THREE.SphereGeometry(.49,16,12),new THREE.MeshStandardMaterial({color:0xffd9a0,emissive:0xffbd6b,emissiveIntensity:.75}),new THREE.Vector3(p[0],93.2,p[1]),false);
  }
}
function collisionFromGeometry(geometry,parent=null,friction=.5){
  const vertices=geometry.getAttribute('position').array;
  const raw=geometry.getIndex();
  const indices=raw?new Uint32Array(raw.array):new Uint32Array(Array.from({length:vertices.length/3},(_,i)=>i));
  const body=parent || world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const desc=RAPIER.ColliderDesc.trimesh(new Float32Array(vertices),indices).setFriction(friction).setRestitution(.06);
  world.createCollider(desc,body);
  return body;
}
function makeSpline(points){
  return new THREE.CatmullRomCurve3(points.map(a=>new THREE.Vector3(...a)),false,'catmullrom',.2);
}
function troughGeometry(curve,width=1.35,samples=100,slices=14){
  const vertices=[],uvs=[],indices=[],edgeA=[],edgeB=[];
  for(let i=0;i<=samples;i++){
    const t=i/samples,p=curve.getPoint(t),dir=curve.getTangent(t);
    const cross=new THREE.Vector3(dir.z,0,-dir.x).normalize();
    const nextT=Math.min(.9999,t+.003),next=curve.getTangent(nextT);
    const chord=Math.max(.05,p.distanceTo(curve.getPoint(nextT)));
    const delta=Math.atan2(dir.x*next.z-dir.z*next.x,dir.x*next.x+dir.z*next.z);
    const curvature=delta/chord;
    // Rotate the entire 90-degree U-section into a banked corner. Both lips
    // remain open, so excessive lateral momentum can still throw a ball off.
    const bank=clamp(Math.atan(14*14*curvature/17),-.44,.44);
    const bankedCross=cross.clone().multiplyScalar(Math.cos(bank)).add(new THREE.Vector3(0,Math.sin(bank),0));
    const bankedUp=new THREE.Vector3(0,Math.cos(bank),0).addScaledVector(cross,-Math.sin(bank));
    for(let j=0;j<=slices;j++){
      const a=-Math.PI/4+(j/slices)*(Math.PI/2);
      const v=p.clone().addScaledVector(bankedCross,Math.sin(a)*width).addScaledVector(bankedUp,(1-Math.cos(a))*width);
      if(p.y>5&&p.y<13){
        const radial=Math.hypot(v.x-FUNNEL.x,v.z-FUNNEL.z);
        const blend=clamp((10.6-radial)/1.4,0,1);
        v.y=lerp(v.y,funnelHeight(radial),blend*blend*(3-2*blend));
      }
      vertices.push(v.x,v.y,v.z);uvs.push(t*10,j/slices);
      if(j===0)edgeA.push(v.clone());if(j===slices)edgeB.push(v.clone());
    }
  }
  for(let i=0;i<samples;i++)for(let j=0;j<slices;j++){
    const a=i*(slices+1)+j,b=a+slices+1;indices.push(a,b,a+1,b,b+1,a+1);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
  return {geometry:g,edgeA,edgeB};
}
function edgeGuardGeometry(edge,height=.43,openPaddleSide=false){
  const vertices=[],uv=[],indices=[];
  for(let i=0;i<edge.length;i++){
    const p=edge[i];
    // Feather the incoming sidewalls into the bowl instead of leaving a
    // full-height wall crossing the funnel mouth and trapping pairs.
    const approach=height>0&&p.y>5&&p.y<13;
    const taper=approach?clamp((Math.hypot(p.x-FUNNEL.x,p.z-FUNNEL.z)-8.65)/3,0,1):1;
    vertices.push(p.x,p.y,p.z,p.x,p.y+height*taper,p.z);
    uv.push(i/12,0,i/12,1);
    if(i>0){
      const x0=edge[i-1].x,x1=p.x;
      const atWheel=openPaddleSide&&(Math.max(x0,x1)>13.5&&Math.min(x0,x1)<20.5);
      if(!atWheel){const a=(i-1)*2,b=i*2;indices.push(a,b,a+1,b,b+1,a+1);}
    }
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geom.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geom.setIndex(indices);geom.computeVertexNormals();
  return geom;
}
function addTrough(points,width,seed){
  const curve=makeSpline(points);
  const data=troughGeometry(curve,width,Math.ceil(curve.getLength()*2.5));
  mesh(data.geometry,basicWood(seed));
  const underside=data.geometry.clone();underside.translate(0,-.18,0);
  mesh(underside,basicWood(seed+7));
  for(const edge of [data.edgeA,data.edgeB]){
    const side=edgeGuardGeometry(edge,-.18);
    mesh(side,basicWood(seed+8));
  }
  collisionFromGeometry(data.geometry,null,.48);
  for(const edge of [data.edgeA,data.edgeB]){
    const opening=seed===119&&edge===data.edgeA;
    const guard=edgeGuardGeometry(edge,.43,opening);
    mesh(guard,basicWood(seed+21));
    collisionFromGeometry(guard,null,.54);
    const rimSections=opening
      ?[edge.filter(p=>p.x<13.5),edge.filter(p=>p.x>20.5)]
      :[edge];
    for(const section of rimSections){
      if(section.length<2)continue;
      const rimCurve=new THREE.CatmullRomCurve3(section.map(p=>p.clone().add(new THREE.Vector3(0,.43*(p.y>5&&p.y<13?clamp((Math.hypot(p.x-FUNNEL.x,p.z-FUNNEL.z)-8.65)/3,0,1):1),0))),false,'centripetal');
      mesh(new THREE.TubeGeometry(rimCurve,Math.min(180,section.length*2),.031,6,false),brass);
    }
  }
  const bracketCount=Math.max(6,Math.ceil(curve.getLength()/22));
  for(let i=0;i<bracketCount;i++){
    const t=(i+.5)/bracketCount,p=curve.getPoint(t),right=new THREE.Vector3(curve.getTangent(t).z,0,-curve.getTangent(t).x).normalize();
    const underside=p.clone().add(new THREE.Vector3(0,-.22,0));
    lineCylinder(underside.clone().addScaledVector(right,-1.2),underside.clone().addScaledVector(right,1.2),.11,decorative);
    const x=underside.x+(right.x>.6?-.6:.6),z=underside.z;
    if(underside.y>room.ground+30){
      const dx=44-Math.abs(underside.x),dz=44-Math.abs(underside.z);
      const wallAnchor=dx<dz?new THREE.Vector3(Math.sign(underside.x)*43,underside.y-3,underside.z):
        new THREE.Vector3(underside.x,underside.y-3,Math.sign(underside.z)*43);
      lineCylinder(underside,wallAnchor,.14,darkIron);
    } else if(underside.y>room.ground+3){
      lineCylinder(new THREE.Vector3(x,room.ground,z),new THREE.Vector3(x,underside.y-.25,z),.09,darkIron);
    }
  }
  return curve;
}
// A trumpet steepens toward its throat. These same vertices drive rendering
// and physics; there is no scripted orbit or invisible funnel skirt.
function funnelHeight(radius){
  const distance=radius-FUNNEL.inner,span=FUNNEL.r-FUNNEL.inner;
  const baseSlope=.8,neck=.7;
  const extra=(FUNNEL.depth-baseSlope*span)/(1-Math.exp(-span/neck));
  return FUNNEL.top-FUNNEL.depth+baseSlope*distance+extra*(1-Math.exp(-distance/neck));
}
function funnelGeometry(){
  const profile=[];
  // Continuous neck, lightly flared at the discharge into the receiving trough.
  profile.push(new THREE.Vector2(1.02,-2.6),new THREE.Vector2(.90,-2.15),new THREE.Vector2(FUNNEL.inner,-1.7));
  for(let i=0;i<=80;i++){
    const r=lerp(FUNNEL.inner,FUNNEL.r,i/80);
    profile.push(new THREE.Vector2(r,funnelHeight(r)));
  }
  const shape=new THREE.LatheGeometry(profile,128);
  shape.translate(FUNNEL.x,0,FUNNEL.z);
  return shape;
}
function buildFunnel(){
  const shape=funnelGeometry();
  mesh(shape,basicWood(202));
  collisionFromGeometry(shape,null,.38);
  // A low physical rim with an opening at the west-side track entrance.
  const lip=new THREE.LatheGeometry([new THREE.Vector2(FUNNEL.r,FUNNEL.top),new THREE.Vector2(FUNNEL.r+.12,FUNNEL.top+.65)],120,4.98,Math.PI*2-.54);
  lip.translate(FUNNEL.x,0,FUNNEL.z);mesh(lip,basicWood(203));collisionFromGeometry(lip,null,.38);
  const ring=new THREE.TorusGeometry(FUNNEL.r,.075,8,128);
  const rim=mesh(ring,brass,new THREE.Vector3(FUNNEL.x,FUNNEL.top+.07,FUNNEL.z));rim.rotation.x=Math.PI/2;
  // Underside follows the bowl instead of presenting a misleading wide tube.
  const underside=shape.clone();underside.translate(0,-.16,0);
  mesh(underside,new THREE.MeshStandardMaterial({color:0x65442b,roughness:.65,side:THREE.BackSide}));
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,x=FUNNEL.x+Math.cos(a)*7.1,z=FUNNEL.z+Math.sin(a)*7.1;
    lineCylinder(new THREE.Vector3(x,room.ground+.35,z),new THREE.Vector3(x,funnelHeight(7.1)-.18,z),.14,darkIron);
    box(.7,.35,.7,x,room.ground+.1,z,decorative);
  }
  return shape;
}
function buildWheel(){
  const center=new THREE.Vector3(WHEEL_CENTER.x,WHEEL_CENTER.y,WHEEL_CENTER.z);
  const staticBody=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x,center.y,center.z));
  const rb=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(center.x,center.y,center.z).setLinearDamping(.8).setAngularDamping(.14));
  const joint=RAPIER.JointData.revolute({x:0,y:0,z:0},{x:0,y:0,z:0},{x:0,y:0,z:1});
  world.createImpulseJoint(joint,staticBody,rb,true);
  const group=new THREE.Group();group.position.copy(center);scene.add(group);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2,axis=new THREE.Vector3(Math.cos(a),Math.sin(a),0);
    const desc=RAPIER.ColliderDesc.cuboid(.85,.20,.61)
      .setTranslation(axis.x*1.08,axis.y*1.08,0)
      .setRotation({x:0,y:0,z:Math.sin(a/2),w:Math.cos(a/2)})
      .setDensity(.14).setFriction(.58).setRestitution(.11);
    world.createCollider(desc,rb);
    const blade=new THREE.Mesh(new THREE.BoxGeometry(1.7,.4,1.22),basicWood(319+i));
    blade.position.set(axis.x*1.08,axis.y*1.08,0);blade.rotation.z=a;blade.castShadow=true;blade.receiveShadow=true;group.add(blade);
    const copper=new THREE.Mesh(new THREE.BoxGeometry(1.7,.06,1.24),brass);
    copper.position.set(axis.x*1.08,axis.y*1.08,0);copper.rotation.z=a;group.add(copper);
  }
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,1.7,24),brass);
  hub.rotation.x=Math.PI/2;hub.castShadow=true;group.add(hub);
  world.createCollider(RAPIER.ColliderDesc.cylinder(.85,.43)
    .setRotation({x:Math.SQRT1_2,y:0,z:0,w:Math.SQRT1_2})
    .setDensity(.14).setFriction(.58).setRestitution(.11),rb);
  for(const zz of [-1.05,1.05]){
    const bearing=new THREE.Mesh(new THREE.CylinderGeometry(.66,.66,.21,32),darkIron);
    bearing.rotation.x=Math.PI/2;bearing.position.set(center.x,center.y,center.z+zz);scene.add(bearing);
    lineCylinder(new THREE.Vector3(center.x,room.ground,center.z+zz*2),new THREE.Vector3(center.x,center.y,center.z+zz),.13,darkIron);
  }
  // Fixed wing supports are non-spinning; only the four contact paddles can rotate.
  rotor=rb;rotorMesh=group;
}
function createPendulumGate(physicsWorld,location,direction,withVisual){
  const pivot=new THREE.Vector3(location.x,location.y+3.55,location.z);
  const axis=new THREE.Vector3(direction.z,0,-direction.x).normalize();
  const anchor=physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pivot.x,pivot.y,pivot.z));
  const body=physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(pivot.x,pivot.y,pivot.z).setLinearDamping(.55).setAngularDamping(.20));
  const hinge=RAPIER.JointData.revolute({x:0,y:0,z:0},{x:0,y:0,z:0},bodyVec(axis));
  physicsWorld.createImpulseJoint(hinge,anchor,body,true);
  physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(.085,1.36,.085)
    .setTranslation(0,-1.36,0).setDensity(.15).setFriction(.65),body);
  physicsWorld.createCollider(RAPIER.ColliderDesc.ball(.52)
    .setTranslation(0,-2.91,0).setDensity(.30).setFriction(.59).setRestitution(.15),body);
  if(!withVisual)return {body};
  const group=new THREE.Group();group.position.copy(pivot);scene.add(group);
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,2.73,14),darkIron);
  rod.position.y=-1.36;rod.castShadow=true;group.add(rod);
  const bob=new THREE.Mesh(new THREE.SphereGeometry(.52,24,16),basicWood(774));
  bob.position.y=-2.91;bob.castShadow=true;bob.receiveShadow=true;group.add(bob);
  const band=new THREE.Mesh(new THREE.TorusGeometry(.28,.075,8,24),brass);
  band.rotation.x=Math.PI/2;band.position.y=-2.91;group.add(band);
  const pivotHub=new THREE.Mesh(new THREE.SphereGeometry(.28,16,12),brass);
  group.add(pivotHub);
  const supportEnd=pivot.clone().addScaledVector(axis,2.5);
  lineCylinder(pivot,supportEnd,.13,darkIron);
  pendulums.push({body,group,pivot});
  return {body,group};
}
function buildCourse(){
  addTrough(UPPER_POINTS,1.51,111);
  buildFunnel();
  const gateT=.76,gateP=upperCurve.getPointAt(gateT),gateDir=upperCurve.getTangentAt(gateT);
  createPendulumGate(world,gateP,gateDir,true);
  addTrough(LOWER_POINTS,1.44,119);
  buildWheel();
  // Finish banner suspended above the final physical track.
  lineCylinder(new THREE.Vector3(32,-19,-10.3),new THREE.Vector3(32,-11,-10.3),.12,darkIron);
  lineCylinder(new THREE.Vector3(32,-19,-5.7),new THREE.Vector3(32,-11,-5.7),.12,darkIron);
  lineCylinder(new THREE.Vector3(32,-11,-10.3),new THREE.Vector3(32,-11,-5.7),.12,brass);
  const sign=box(2.6,.62,.13,32,-11,-8,decorative);sign.rotation.y=Math.PI/2;
}
function createMarbleVisual(color,tier,id){
  const r=radiusForTier(tier),group=new THREE.Group();
  const geo=new THREE.SphereGeometry(r,30,20);
  const texture=makeSwirlTexture(palette[color].base,palette[color].swirl,id*1429+color*731);
  const mat=new THREE.MeshPhysicalMaterial({map:texture,roughness:.17,metalness:.02,clearcoat:1,clearcoatRoughness:.11,envMapIntensity:.85});
  const ball=new THREE.Mesh(geo,mat);ball.castShadow=true;ball.receiveShadow=true;group.add(ball);
  const glint=new THREE.Mesh(new THREE.SphereGeometry(r*.13,8,6),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.23}));
  glint.position.set(-r*.28,r*.39,r*.76);group.add(glint);
  scene.add(group);return group;
}
function spawnMarble({color,tier=1,at,velocity,angularVelocity,orientation,physicalMass,originalId=null,cooldown=0}){
  const r=radiusForTier(tier),id=originalId===null?nextId++:originalId;
  const rb=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(at.x,at.y,at.z)
     .setLinearDamping(.15*Math.pow(START_RADIUS/r,.38)).setAngularDamping(.09).setCcdEnabled(true));
  const density=5.5*Math.pow(START_RADIUS/r,1.4);
  const desc=RAPIER.ColliderDesc.ball(r).setDensity(density).setFriction(.62).setRestitution(.15);
  if(orientation)rb.setRotation(orientation,true);
  if(physicalMass!==undefined)desc.setMass(physicalMass);
  const collider=world.createCollider(desc,rb);
  if(angularVelocity)rb.setAngvel(bodyVec(angularVelocity),true);
  if(velocity)rb.setLinvel(bodyVec(velocity),true);
  const group=createMarbleVisual(color,tier,id);
  const marble={id,color,tier,r,rb,collider,group,stage:'approach',progress:0,cooldown:simTime+cooldown,finished:false,offCourseTime:0};
  marbles.push(marble);return marble;
}
function removeMarble(m){
  world.removeRigidBody(m.rb);scene.remove(m.group);
  m.group.traverse(child=>{if(child.isMesh){child.geometry.dispose();if(child.material?.map)child.material.map.dispose();child.material?.dispose();}});
  marbles=marbles.filter(x=>x!==m);
}
function startMarbles(){
  const track=upperCurve;
  for(let i=0;i<START_COUNT;i++){
    const row=Math.floor(i/3),col=i%3;
    const t=(.4+row*.87)/upperLength,p=track.getPointAt(t),tangent=track.getTangentAt(t);
    const lateral=new THREE.Vector3(tangent.z,0,-tangent.x).normalize();
    const a=(col-1)*.72,at=p.clone().addScaledVector(lateral,a);
    at.y+=.32+1.51*(1-Math.sqrt(1-Math.pow(a/1.51,2)))+.025;
    at.z-=.07*(i%2);
    const marble=spawnMarble({color:i%8,at,velocity:new THREE.Vector3(.001,0,.001),cooldown:3.5});
    marble.upperIndex=Math.round(t*UPPER_SAMPLES);
  }
  selected=marbles[0];followId=selected.id;
}
function chooseMarble(m){
  if(!m)return;selected=m;followId=m.id;
  [...$('color-list').children].forEach(x=>x.classList.toggle('active',Number(x.dataset.color)===m.color));
}
function setupControls(){
  clearNode($('color-list'));
  palette.forEach((color,i)=>{
    const b=document.createElement('button');b.type='button';b.className='color-choice';b.style.setProperty('--c',color.base);b.dataset.color=i;b.title=color.name;
    b.setAttribute('aria-label','Follow '+color.name+' marble');b.addEventListener('click',()=>{
      const possibilities=marbles.filter(m=>m.color===i&&!m.finished).sort((a,b)=>b.progress-a.progress);
      if(possibilities.length){chooseMarble(possibilities[0]);viewMode='follow';syncViewButtons();}
    });$('color-list').append(b);
  });
  for(const mode of ['follow','wide','inside'])$(''+mode).addEventListener('click',()=>{viewMode=mode;syncViewButtons();});
  $('speed').addEventListener('click',()=>{raceSpeed=raceSpeed===1?1.5:raceSpeed===1.5?2:1;$('speed').textContent=raceSpeed+'×';});
  $('pause').addEventListener('click',()=>{
    if(simTime>=120||marbles.every(m=>m.finished)){restart();return;}
    paused=!paused;$('pause').textContent=paused?'▶ RESUME':'Ⅱ PAUSE';
  });
  $('reset').addEventListener('click',()=>restart());
  $('progress').addEventListener('pointerdown',e=>{
    const r=$('progress').getBoundingClientRect(),fraction=clamp((e.clientX-r.left)/r.width,0,1);
    const sorted=marbles.filter(m=>!m.finished).sort((a,b)=>Math.abs(a.progress-fraction)-Math.abs(b.progress-fraction));
    if(sorted[0]){chooseMarble(sorted[0]);viewMode='follow';syncViewButtons();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;$('pause').textContent='▶ RESUME';}});
  syncViewButtons();
}
function syncViewButtons(){for(const name of ['follow','wide','inside'])$(name).classList.toggle('active',viewMode===name);}
function resetState(){marbles.slice().forEach(removeMarble);marbles=[];if(rotor){rotor.setLinvel({x:0,y:0,z:0},true);rotor.setAngvel({x:0,y:0,z:0},true);rotor.setTranslation(WHEEL_CENTER,true);rotor.setRotation({x:0,y:0,z:0,w:1},true);}for(const gate of pendulums){
    gate.body.setLinvel({x:0,y:0,z:0},true);gate.body.setAngvel({x:0,y:0,z:0},true);
    gate.body.setTranslation(bodyVec(gate.pivot),true);
    gate.body.setRotation({x:0,y:0,z:0,w:1},true);
  }simTime=0;merges=0;finished=0;winner=null;accumulator=0;nextId=0;startMarbles();$('toast').classList.remove('visible');}
function restart(){resetState();paused=false;$('pause').textContent='Ⅱ PAUSE';showToast('NEW RACE · 32 MARBLES');}
function mergePair(a,b){
  const pa=new THREE.Vector3().copy(a.rb.translation()),pb=new THREE.Vector3().copy(b.rb.translation());
  const va=new THREE.Vector3().copy(a.rb.linvel()),vb=new THREE.Vector3().copy(b.rb.linvel());
  const ma=a.rb.mass(),mb=b.rb.mass(),total=ma+mb,tier=a.tier+1,r=radiusForTier(tier);
  const center=pa.clone().multiplyScalar(ma).addScaledVector(pb,mb).divideScalar(total);
  const vel=va.clone().multiplyScalar(ma).addScaledVector(vb,mb).divideScalar(total);
  // Intrinsic spin plus orbital angular momentum about the combined center.
  const angular=new THREE.Vector3().copy(a.rb.angvel()).multiplyScalar(.4*ma*a.r*a.r)
    .addScaledVector(new THREE.Vector3().copy(b.rb.angvel()),.4*mb*b.r*b.r)
    .add(pa.clone().sub(center).cross(va.clone().sub(vel).multiplyScalar(ma)))
    .add(pb.clone().sub(center).cross(vb.clone().sub(vel).multiplyScalar(mb)))
    .divideScalar(.4*total*r*r);
  // Find a nearby clear position before removing either original body. On
  // a crowded bend or in a narrow throat the merge waits instead of exploding.
  const shape=new RAPIER.Ball(r),rotation={x:0,y:0,z:0,w:1};
  let at=null;
  for(const rise of [0,.04,.10,.20,.35,.55]){
    const candidate=center.clone().add(new THREE.Vector3(0,rise,0));let blocked=false;
    world.intersectionsWithShape(bodyVec(candidate),rotation,shape,()=>{blocked=true;return false;},
      undefined,undefined,undefined,undefined,c=>c.handle!==a.collider.handle&&c.handle!==b.collider.handle);
    if(!blocked){at=candidate;break;}
  }
  if(!at)return false;
  const winner=a.id===followId?a:b.id===followId?b:a;
  const color=winner.color,progress=Math.max(a.progress,b.progress),stage=a.stage==='lower'||b.stage==='lower'?'lower':a.stage==='funnel'||b.stage==='funnel'?'funnel':'approach';
  const wasSelected=selected===a||selected===b,upperIndex=winner.upperIndex,orientation=winner.rb.rotation();
  removeMarble(a);removeMarble(b);
  const result=spawnMarble({color,tier,at,velocity:vel,angularVelocity:angular,orientation,physicalMass:total,originalId:winner.id,cooldown:3.4});
  result.progress=progress;result.stage=stage;result.upperIndex=upperIndex;
  if(wasSelected)chooseMarble(result);
  merges++;
  if(tier>=3)showToast(palette[color].name.toUpperCase()+' MERGED · '+Math.pow(2,tier-1)+'×',1.6);
  return true;
}
function maybeMerge(){
  for(let i=0;i<marbles.length;i++){
    const a=marbles[i];if(a.finished||simTime<a.cooldown)continue;
    for(let j=i+1;j<marbles.length;j++){
      const b=marbles[j];if(b.finished||simTime<b.cooldown||a.tier!==b.tier)continue;
      let touching=false;
      world.contactPair(a.collider,b.collider,manifold=>{
        for(let k=0;k<manifold.numContacts();k++)if(manifold.contactDist(k)<=.015)touching=true;
      });
      if(touching&&mergePair(a,b))return;
    }
  }
}
function upperFraction(m,p){
  let center=m.upperIndex??0;
  const start=Math.max(0,center-24),end=Math.min(UPPER_SAMPLES,center+30);
  let best=center,distance=Infinity;
  for(let i=start;i<=end;i++){
    const q=upperPositions[i],dx=p.x-q.x,dy=p.y-q.y,dz=p.z-q.z;
    const d=dx*dx+dy*dy+dz*dz;
    if(d<distance){distance=d;best=i;}
  }
  m.upperIndex=best;
  return best/UPPER_SAMPLES;
}
function updateProgress(m){
  if(m.finished)return;
  const p=m.rb.translation(),r=Math.hypot(p.x-FUNNEL.x,p.z-FUNNEL.z);
  if(m.stage==='approach'&&r<FUNNEL.r+.9&&p.y<10.7&&p.y>.1)m.stage='funnel';
  if(m.stage==='funnel'&&p.y<-2.3&&r<2)m.stage='lower';
  let candidate;
  if(m.stage==='approach'){candidate=.33*upperFraction(m,p);}
  else if(m.stage==='funnel'){candidate=.34+.32*clamp((FUNNEL.top-p.y)/FUNNEL.depth,0,1);}
  else{candidate=.69+.31*clamp((p.x+4)/38,0,1);}
  m.progress=Math.max(m.progress,candidate);
  if(m.stage==='lower'&&p.x>32.5&&p.y< -9){
    m.finished=true;m.progress=1;finished++;
    if(!winner){
      winner={name:palette[m.color].name,time:simTime,id:m.id};
      showToast('WINNER · '+winner.name.toUpperCase()+' · '+formatTime(simTime),4);
    }else if(m===selected)showToast('FINISH · '+palette[m.color].name.toUpperCase()+' · '+formatTime(simTime),2.8);
  }
  // Falling off is an elimination, not an error to auto-correct.
  if(p.y<room.ground+1.15){m.offCourseTime+=STEP;}else{m.offCourseTime=0;}
  if(m.offCourseTime>1.0){
    m.finished=true;m.eliminated=true;
    if(m===selected)showToast(palette[m.color].name.toUpperCase()+' OUT · FELL OFF THE TRACK',2.5);
  }
}
function syncMeshes(){
  for(const m of marbles){
    const p=m.rb.translation(),q=m.rb.rotation();
    m.group.position.set(p.x,p.y,p.z);
    m.group.quaternion.set(q.x,q.y,q.z,q.w);
    // DNFs stay in place when the clock expires; only off-track eliminations vanish.
    m.group.visible=!m.eliminated;
  }
  if(rotor&&rotorMesh){
    const p=rotor.translation(),q=rotor.rotation();
    rotorMesh.position.set(p.x,p.y,p.z);
    rotorMesh.quaternion.set(q.x,q.y,q.z,q.w);
  }
  for(const gate of pendulums){
    const p=gate.body.translation(),q=gate.body.rotation();
    gate.group.position.set(p.x,p.y,p.z);
    gate.group.quaternion.set(q.x,q.y,q.z,q.w);
  }
}
function updateCamera(dt){
  if(!selected||selected.finished)selected=marbles.filter(m=>!m.finished).sort((a,b)=>b.progress-a.progress)[0]||marbles[0];
  if(!selected)return;
  const p=selected.rb.translation(),v=selected.rb.linvel(),focus=new THREE.Vector3(p.x,p.y,p.z);
  const horizontal=new THREE.Vector3(v.x,0,v.z);
  if(horizontal.lengthSq()<.6)horizontal.set(0,0,1);else horizontal.normalize();
  if(viewMode==='wide'){
    if(selected.stage==='funnel'){camDesired.set(FUNNEL.x+18,24,FUNNEL.z+19);watchTarget.set(FUNNEL.x,5,FUNNEL.z);}
    else if(selected.stage==='lower'){camDesired.set(16,12,26);watchTarget.set(15,-9,-8);}
    else{
      camDesired.copy(focus).add(new THREE.Vector3(12,12,17));
      watchTarget.lerp(focus,1-Math.exp(-dt*4));
    }
  } else if(viewMode==='inside'){
    const look=new THREE.Vector3(p.x+horizontal.x*10,p.y+.2,p.z+horizontal.z*10);
    camDesired.copy(focus).add(new THREE.Vector3(0,.45,0)).addScaledVector(horizontal,-.32);
    watchTarget.lerp(look,1-Math.exp(-dt*9));
  } else {
    const dist=selected.stage==='funnel'?8.8:9.2;
    const height=selected.stage==='funnel'?5.5:4.4;
    camDesired.copy(focus).addScaledVector(horizontal,-dist).add(new THREE.Vector3(3.5,height,3));
    if(selected.stage==='funnel')camDesired.add(new THREE.Vector3(0,2,0));
    watchTarget.lerp(focus.clone().addScaledVector(horizontal,2),1-Math.exp(-dt*4));
  }
  camera.position.lerp(camDesired,1-Math.exp(-dt*2.8));
  camera.lookAt(watchTarget);
}
function renderBoard(){
  $('clock').textContent=formatTime(simTime);
  const active=marbles.filter(m=>!m.finished);
  $('alive').textContent=active.length;
  $('merges').textContent=merges;
  const ranking=marbles.slice().sort((a,b)=>b.progress-a.progress);
  const leader=ranking[0];$('leader').textContent=leader?palette[leader.color].name.toUpperCase()+' · '+Math.floor(leader.progress*100)+'%':'FINISHED';
  const board=$('progress-balls');clearNode(board);
  // One dot per active physical marble, ordered only by world-space completion.
  for(const m of ranking){
    const b=document.createElement('span');b.className='progress-marker'+(selected&&m.id===selected.id?' selected':'')+(m.finished?' gone':'');
    b.style.setProperty('--p',(m.progress*100)+'%');b.style.setProperty('--c',palette[m.color].base);b.style.setProperty('--row',((m.id%3)-1)*4+'px');
    b.style.zIndex=m===selected?'20':String(3+m.tier);
    const rank=Math.min(6,m.tier);
    b.style.width=(8+rank*1.5)+'px';b.style.height=(8+rank*1.5)+'px';
    b.title=palette[m.color].name+' · '+Math.round(m.progress*100)+'%';
    board.append(b);
  }
  const stage=selected?.stage;
  $('scene-title').textContent=stage==='funnel'?'GRAVITY VORTEX':stage==='lower'?'THE PADDLE RUN':'THE WOODEN RACE HALL';
  $('scene-subtitle').textContent=stage==='funnel'?'Natural entry momentum · real funnel collisions':stage==='lower'?'Four paddles turn only when marbles hit':'Wall circuit · open rails · gravity-powered racing';
  if(simTime>toastUntil)$('toast').classList.remove('visible');
}
let boardTimer=0;
function tick(){
  const dt=clamp(clock.getDelta(),0,.05);
  if(!paused){
    accumulator+=dt*raceSpeed;
    let count=0;
    while(accumulator>=STEP&&count<8){
      world.timestep=STEP;
      world.step();
      simTime+=STEP;
      for(const m of marbles)updateProgress(m);
      maybeMerge();
      if(simTime>=120||marbles.every(m=>m.finished)){
        for(const m of marbles)if(!m.finished){m.finished=true;m.dnf=true;}
        paused=true;$('pause').textContent='▶ RESTART';
        const label=winner?'RACE OVER · '+winner.name.toUpperCase()+' WON IN '+formatTime(winner.time):'RACE OVER · NO FINISHERS';
        showToast(label,12);
      }
      accumulator-=STEP;count++;
    }
    if(count===8)accumulator=Math.min(accumulator,STEP);
  }
  syncMeshes();
  updateCamera(dt);
  boardTimer+=dt;
  if(boardTimer>.1){boardTimer=0;renderBoard();}
  renderer.render(scene,camera);
  requestAnimationFrame(tick);
}

async function runPhysicsSelfTest(){return runCourseSelfTest();}

async function runCourseSelfTest(seed=1){
  // Build the actual playable course and exercise its real merge/progress rules.
  diagnostic=true;simTime=0;merges=0;finished=0;winner=null;marbles=[];pendulums=[];nextId=0;
  world=new RAPIER.World({x:0,y:-17,z:0});world.timestep=STEP;scene=new THREE.Scene();
  buildRoom();buildCourse();startMarbles();
  const random=noise(seed);
  for(const marble of marbles)marble.rb.setLinvel({x:(random()-.5)*.16,y:0,z:(random()-.5)*.16},true);
  const initialMass=marbles.reduce((sum,m)=>sum+m.rb.mass(),0);
  let wheelTravel=0,previousWheel=0,finite=true,maxTier=1;
  for(let i=0;i<120/STEP;i++){
    world.step();simTime+=STEP;
    for(const m of marbles){updateProgress(m);if(m.eliminated&&!m.failure)m.failure={stage:m.stage,progress:m.progress,p:m.rb.translation(),time:simTime};}
    maybeMerge();
    const q=rotor.rotation(),angle=2*Math.atan2(q.z,q.w);
    wheelTravel+=Math.abs(Math.atan2(Math.sin(angle-previousWheel),Math.cos(angle-previousWheel)));previousWheel=angle;
    for(const m of marbles){
      const p=m.rb.translation(),v=m.rb.linvel();
      if(![p.x,p.y,p.z,v.x,v.y,v.z].every(Number.isFinite))finite=false;
      maxTier=Math.max(maxTier,m.tier);
    }
    if(marbles.every(m=>m.finished))break;
    if(i%720===0){setLoading('LIVE-RULES TEST · '+Math.round(simTime)+' s · '+merges+' merges');await new Promise(resolve=>setTimeout(resolve,0));}
  }
  const finalMass=marbles.reduce((sum,m)=>sum+m.rb.mass(),0);
  const report={seed,finite,seconds:+simTime.toFixed(2),merges,maxTier,
    survivors:marbles.length,finishers:marbles.filter(m=>m.finished&&!m.eliminated&&!m.dnf).length,
    falls:marbles.filter(m=>m.eliminated).length,remaining:marbles.filter(m=>!m.finished).length,
    firstFinish:winner?.time??null,wheelTurns:+(wheelTravel/(Math.PI*2)).toFixed(2),
    massError:Math.abs(finalMass-initialMass)/initialMass,
    fallSamples:marbles.filter(m=>m.failure).slice(0,8).map(m=>m.failure),
    waiters:marbles.filter(m=>!m.finished).map(m=>({stage:m.stage,p:m.rb.translation()}))};
  report.pass=finite&&report.finishers>0&&report.remaining===0&&report.massError<.0001;
  setLoading((report.pass?'LIVE-RULES TEST PASS · ':'LIVE-RULES TEST NEEDS TUNING · ')+JSON.stringify(report));
  loading.classList.toggle('error',!report.pass);
  world.free();diagnostic=false;
  return report;
}

async function boot(){
  try{
    setLoading('Loading WebAssembly rigid-body engine…');
    await RAPIER.init();
    if(new URLSearchParams(location.search).has('physics-test')){await runPhysicsSelfTest();return;}
    if(new URLSearchParams(location.search).has('race-test')){await runCourseSelfTest(Number(new URLSearchParams(location.search).get('seed'))||1);return;}
    world=new RAPIER.World({x:0,y:-17,z:0});
    world.timestep=STEP;
    scene=new THREE.Scene();
    camera=new THREE.PerspectiveCamera(65,window.innerWidth/window.innerHeight,.08,200);
    camera.position.set(1,19,20);
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
    renderer.setSize(window.innerWidth,window.innerHeight);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.37;
    $('world').append(renderer.domElement);
    window.addEventListener('resize',()=>{
      camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
    });
    setLoading('Crafting oak room, vortex, and collision geometry…');
    buildRoom();buildCourse();
    setLoading('Spawning 32 dynamic glass marbles…');
    setupControls();startMarbles();chooseMarble(marbles[0]);renderBoard();
    hideLoading();requestAnimationFrame(tick);
  }catch(error){
    console.error('[Marble Merge 2.0] Startup failed:',error);
    setLoading('Physics failed to start: '+(error?.message||String(error)));
    loading.classList.add('error');
  }
}
boot();
