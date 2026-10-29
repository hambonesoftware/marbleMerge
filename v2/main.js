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
const room = {x:44,z:44,ground:-22};
const clock = new THREE.Clock();
let simTime=0, raceSpeed=1, paused=false, merges=0, finished=0;
let accumulator=0, followId=0, viewMode='follow', toastUntil=0;
let marbles=[], particles=[], rotor=null, rotorMesh=null;
let world, scene, camera, renderer;
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
  box(90,61,1,0,7,-44,wallMaterial,false);
  box(90,61,1,0,7,44,wallMaterial,false);
  box(1,61,90,-44,7,0,wallMaterial,false);
  box(1,61,90,44,7,0,wallMaterial,false);
  box(90,1,90,0,37,0,new THREE.MeshStandardMaterial({color:0xb9a184,roughness:.94}),false);
  for(let x=-39;x<=40;x+=9){
    for(const z of [-43.45,43.45]){
      box(.36,45,.38,x,2,z,decorative,false);
      box(1.1,1,1.1,x,23,z,decorative,false);
      box(1.1,1,1.1,x,-19,z,decorative,false);
    }
  }
  for(let z=-39;z<=40;z+=9){
    for(const x of [-43.45,43.45]){
      box(.36,45,.38,x,2,z,decorative,false);
      box(1.1,1,1.1,x,23,z,decorative,false);
    }
  }
  for(const z of [-43.42,43.42]){
    for(let x=-36;x<40;x+=18){
      const pane=glowPanel(x,12,z+(z<0?.24:-.24),5.4,10,0xffe4c0);
      if(z>0)pane.rotation.y=Math.PI;
      for(let dy of [-5,5])box(6.0,.24,.2,x,12+dy,z+(z<0?.3:-.3),decorative,false);
      box(.22,10.3,.2,x,12,z+(z<0?.3:-.3),decorative,false);
    }
  }
  const wallCollision=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(46,.5,46).setTranslation(0,room.ground-.5,0),wallCollision);
  for(const [x,z,w,d] of [[0,-44,45,.5],[0,44,45,.5],[-44,0,.5,45],[44,0,.5,45]]){
    world.createCollider(RAPIER.ColliderDesc.cuboid(w,32,d).setTranslation(x,7,z),wallCollision);
  }
  scene.background=new THREE.Color(0x796958);
  scene.fog=new THREE.FogExp2(0xb4a18c,.006);
  scene.add(new THREE.AmbientLight(0xf8e5cc,.9));
  scene.add(new THREE.HemisphereLight(0xfff1d4,0x564035,1.25));
  const sun=new THREE.DirectionalLight(0xfff0d5,2.2);sun.position.set(24,35,20);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left=-39;sun.shadow.camera.right=39;sun.shadow.camera.top=39;sun.shadow.camera.bottom=-39;sun.shadow.camera.near=.1;sun.shadow.camera.far=130;sun.shadow.bias=-.0005;scene.add(sun);
  const warm=new THREE.PointLight(0xffcc8b,80,78,2);warm.position.set(-17,25,-8);scene.add(warm);
  const stage=new THREE.PointLight(0xffebc7,60,55,2);stage.position.set(20,13,-4);scene.add(stage);
  // Brass-framed ceiling lamps and crown molding establish an actual room.
  for(const p of [[-19,-18],[13,-17],[21,19]]){
    lineCylinder(new THREE.Vector3(p[0],36,p[1]),new THREE.Vector3(p[0],31,p[1]),.095,darkIron);
    const fixture=cylinder(1.15,.35,p[0],30.7,p[1],brass,24);
    fixture.material=brass;
    mesh(new THREE.SphereGeometry(.49,16,12),new THREE.MeshStandardMaterial({color:0xffd9a0,emissive:0xffbd6b,emissiveIntensity:.75}),new THREE.Vector3(p[0],30.2,p[1]),false);
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
    for(let j=0;j<=slices;j++){
      const a=-Math.PI/4+(j/slices)*(Math.PI/2);
      const v=p.clone().addScaledVector(cross,Math.sin(a)*width).add(new THREE.Vector3(0,(1-Math.cos(a))*width,0));
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
function addTrough(points,width,seed){
  const curve=makeSpline(points);
  const data=troughGeometry(curve,width);
  mesh(data.geometry,basicWood(seed));
  collisionFromGeometry(data.geometry,null,.48);
  for(const edge of [data.edgeA,data.edgeB]){
    const curve=new THREE.CatmullRomCurve3(edge,false,'centripetal');
    mesh(new THREE.TubeGeometry(curve,180,.047,6,false),brass);
  }
  for(let i=0;i<6;i++){
    const t=.07+i*.17,p=curve.getPoint(t),right=new THREE.Vector3(curve.getTangent(t).z,0,-curve.getTangent(t).x).normalize();
    const underside=p.clone().add(new THREE.Vector3(0,-.22,0));
    lineCylinder(underside.clone().addScaledVector(right,-1.2),underside.clone().addScaledVector(right,1.2),.11,decorative);
    const x=underside.x+(right.x>.6?-.6:.6),z=underside.z;
    if(underside.y>room.ground+3)lineCylinder(new THREE.Vector3(x,room.ground,z),new THREE.Vector3(x,underside.y-.25,z),.09,darkIron);
  }
  return curve;
}
function buildFunnel(){
  const profile=[],sub=54;
  for(let i=0;i<=sub;i++){
    const f=i/sub,r=lerp(FUNNEL.inner,FUNNEL.r,f);
    const y=FUNNEL.top-FUNNEL.depth*(1-Math.pow(r/FUNNEL.r,1.55));
    profile.push(new THREE.Vector2(r,y));
  }
  const shape=new THREE.LatheGeometry(profile,112);
  shape.translate(FUNNEL.x,0,FUNNEL.z);
  mesh(shape,basicWood(202));
  collisionFromGeometry(shape,null,.38);
  const ring=new THREE.TorusGeometry(FUNNEL.r,.075,8,128);
  const rim=mesh(ring,brass,new THREE.Vector3(FUNNEL.x,FUNNEL.top+.07,FUNNEL.z));rim.rotation.x=Math.PI/2;
  // The open entrance is left clear. The rim is decoration, not a wall that teleports balls.
  const under=new THREE.MeshStandardMaterial({color:0x513b2d,roughness:.65,metalness:.06,side:THREE.DoubleSide});
  const skirt=new THREE.CylinderGeometry(5.1,3.8,1.15,48,1,true);
  mesh(skirt,under,new THREE.Vector3(FUNNEL.x,.62,FUNNEL.z));
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,x=FUNNEL.x+Math.cos(a)*7.1,z=FUNNEL.z+Math.sin(a)*7.1;
    lineCylinder(new THREE.Vector3(x,room.ground+1,z),new THREE.Vector3(x,5.8,z),.14,darkIron);
    const foot=box(.7,.35,.7,x,room.ground+.1,z,decorative);foot.castShadow=true;
  }
  return shape;
}
function buildWheel(){
  const center=new THREE.Vector3(17,-6.6,-8);
  const staticBody=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x,center.y,center.z));
  const rb=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(center.x,center.y,center.z).setLinearDamping(.8).setAngularDamping(.45));
  const joint=RAPIER.JointData.revolute({x:0,y:0,z:0},{x:0,y:0,z:0},{x:0,y:0,z:1});
  world.createImpulseJoint(joint,staticBody,rb,true);
  const group=new THREE.Group();group.position.copy(center);scene.add(group);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2,axis=new THREE.Vector3(Math.cos(a),Math.sin(a),0);
    const desc=RAPIER.ColliderDesc.cuboid(1.05,.245,.65)
      .setTranslation(axis.x*1.12,axis.y*1.12,0)
      .setRotation({x:0,y:0,z:Math.sin(a/2),w:Math.cos(a/2)})
      .setDensity(.22).setFriction(.58).setRestitution(.11);
    world.createCollider(desc,rb);
    const blade=new THREE.Mesh(new THREE.BoxGeometry(2.1,.49,1.3),basicWood(319+i));
    blade.position.set(axis.x*1.12,axis.y*1.12,0);blade.rotation.z=a;blade.castShadow=true;blade.receiveShadow=true;group.add(blade);
    const copper=new THREE.Mesh(new THREE.BoxGeometry(2.1,.06,1.33),brass);
    copper.position.set(axis.x*1.12,axis.y*1.12,0);copper.rotation.z=a;group.add(copper);
  }
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,1.7,24),brass);
  hub.rotation.x=Math.PI/2;hub.castShadow=true;group.add(hub);
  for(const zz of [-1.05,1.05]){
    const bearing=new THREE.Mesh(new THREE.CylinderGeometry(.66,.66,.21,32),darkIron);
    bearing.rotation.x=Math.PI/2;bearing.position.z=zz;group.add(bearing);
    lineCylinder(new THREE.Vector3(center.x,room.ground,center.z+zz*2),new THREE.Vector3(center.x,center.y,center.z+zz),.13,darkIron);
  }
  // Fixed wing supports are non-spinning; only the four contact paddles can rotate.
  rotor=rb;rotorMesh=group;
}
function buildCourse(){
  addTrough([
    [-16.8,22.8,-39],[-16.2,20.4,-34],[-15.6,17.5,-28],
    [-14.7,14.4,-21.5],[-13.5,11.6,-15.7],
    [-12.2,9.92,-10.5],[-11.7,9.58,-8.1]
  ],1.51,111);
  buildFunnel();
  addTrough([
    [-3.9,-4.1,-8],[-1.7,-4.2,-8],[3,-5.4,-8],
    [9,-7,-8],[17,-9.1,-8],[23,-12.8,-8],
    [29,-16,-8],[34,-18.5,-8]
  ],1.44,119);
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
function spawnMarble({color,tier=1,at,velocity,originalId=null,cooldown=0}){
  const r=radiusForTier(tier),id=originalId===null?nextId++:originalId;
  const rb=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(at.x,at.y,at.z)
    .setLinearDamping(.013).setAngularDamping(.09).setCcdEnabled(true));
  const density=5.5*Math.pow(START_RADIUS/r,1.4);
  const desc=RAPIER.ColliderDesc.ball(r).setDensity(density).setFriction(.62).setRestitution(.15);
  world.createCollider(desc,rb);
  if(velocity)rb.setLinvel(bodyVec(velocity),true);
  const group=createMarbleVisual(color,tier,id);
  const marble={id,color,tier,r,rb,group,stage:'approach',progress:0,cooldown:simTime+cooldown,finished:false,offCourseTime:0};
  marbles.push(marble);return marble;
}
function removeMarble(m){
  world.removeRigidBody(m.rb);scene.remove(m.group);
  m.group.traverse(child=>{if(child.isMesh){child.geometry.dispose();if(child.material?.map)child.material.map.dispose();child.material?.dispose();}});
  marbles=marbles.filter(x=>x!==m);
}
function startMarbles(){
  const track=makeSpline([
    [-16.8,22.8,-39],[-16.2,20.4,-34],[-15.6,17.5,-28],
    [-14.7,14.4,-21.5],[-13.5,11.6,-15.7],[-12.2,9.92,-10.5],[-11.7,9.58,-8.1]
  ]);
  for(let i=0;i<START_COUNT;i++){
    const row=Math.floor(i/3),col=i%3;
    const t=.012+row*.025,p=track.getPoint(t),tangent=track.getTangent(t);
    const lateral=new THREE.Vector3(tangent.z,0,-tangent.x).normalize();
    const a=(col-1)*.48,at=p.clone().addScaledVector(lateral,a);
    at.y+=.32+1.51*(1-Math.sqrt(1-Math.pow(a/1.51,2)))+.025;
    at.z-=.07*(i%2);
    spawnMarble({color:i%8,at,velocity:new THREE.Vector3(.001,0,.001),cooldown:3.5});
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
  $('pause').addEventListener('click',()=>{paused=!paused;$('pause').textContent=paused?'▶ RESUME':'Ⅱ PAUSE';});
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
function resetState(){marbles.slice().forEach(removeMarble);marbles=[];if(rotor){rotor.setLinvel({x:0,y:0,z:0},true);rotor.setAngvel({x:0,y:0,z:0},true);rotor.setTranslation({x:17,y:-6.6,z:-8},true);rotor.setRotation({x:0,y:0,z:0,w:1},true);}simTime=0;merges=0;finished=0;accumulator=0;nextId=0;startMarbles();$('toast').classList.remove('visible');}
function restart(){resetState();paused=false;$('pause').textContent='Ⅱ PAUSE';showToast('NEW RACE · 32 MARBLES');}
function mergePair(a,b){
  const pa=a.rb.translation(),pb=b.rb.translation(),va=a.rb.linvel(),vb=b.rb.linvel();
  const ma=Math.pow(a.r/START_RADIUS,1.6),mb=Math.pow(b.r/START_RADIUS,1.6),total=ma+mb;
  const at=new THREE.Vector3((pa.x*ma+pb.x*mb)/total,(pa.y*ma+pb.y*mb)/total,(pa.z*ma+pb.z*mb)/total);
  const vel=new THREE.Vector3((va.x*ma+vb.x*mb)/total,(va.y*ma+vb.y*mb)/total,(va.z*ma+vb.z*mb)/total);
  const winner=a.id===followId?a:b.id===followId?b:a;
  const tier=a.tier+1,color=winner.color,progress=Math.max(a.progress,b.progress),stage=a.stage==='lower'||b.stage==='lower'?'lower':a.stage==='funnel'||b.stage==='funnel'?'funnel':'approach';
  const wasSelected=selected===a||selected===b;
  removeMarble(a);removeMarble(b);
  const result=spawnMarble({color,tier,at,velocity:vel,originalId:winner.id,cooldown:3.4});
  result.progress=progress;result.stage=stage;
  if(wasSelected)chooseMarble(result);
  merges++;
  if(tier>=3)showToast(palette[color].name.toUpperCase()+' MERGED · '+Math.pow(2,tier-1)+'×',1.6);
}
function maybeMerge(){
  // Collisions are resolved by Rapier first. Merging only converts *real contact*;
  // identical-tier contacts are intentionally throttled to avoid 23 merges in five seconds.
  for(let i=0;i<marbles.length;i++){
    const a=marbles[i];if(a.finished||simTime<a.cooldown)continue;
    for(let j=i+1;j<marbles.length;j++){
      const b=marbles[j];if(b.finished||simTime<b.cooldown||a.tier!==b.tier)continue;
      const p=a.rb.translation(),q=b.rb.translation();
      const dx=p.x-q.x,dy=p.y-q.y,dz=p.z-q.z,dist2=dx*dx+dy*dy+dz*dz;
      const threshold=(a.r+b.r)*.975;
      if(dist2<threshold*threshold){mergePair(a,b);return;}
    }
  }
}
function updateProgress(m){
  if(m.finished)return;
  const p=m.rb.translation(),r=Math.hypot(p.x-FUNNEL.x,p.z-FUNNEL.z);
  if(m.stage==='approach'&&r<FUNNEL.r+.9&&p.y<10.7&&p.y>.1)m.stage='funnel';
  if(m.stage==='funnel'&&p.y<-2.3)m.stage='lower';
  let candidate;
  if(m.stage==='approach'){candidate=.33*clamp((p.z+39)/31,0,1);}
  else if(m.stage==='funnel'){candidate=.34+.32*clamp((FUNNEL.top-p.y)/FUNNEL.depth,0,1);}
  else{candidate=.69+.31*clamp((p.x+4)/38,0,1);}
  m.progress=Math.max(m.progress,candidate);
  if(m.stage==='lower'&&p.x>32.5&&p.y< -9){
    m.finished=true;m.progress=1;finished++;
    if(m===selected)showToast('FINISH · '+palette[m.color].name.toUpperCase()+' · '+formatTime(simTime),4);
  }
  if(p.y<room.ground-12){m.offCourseTime+=STEP;}else{m.offCourseTime=0;}
  if(m.offCourseTime>4){m.finished=true;}
}
function syncMeshes(){
  for(const m of marbles){
    const p=m.rb.translation(),q=m.rb.rotation();
    m.group.position.set(p.x,p.y,p.z);
    m.group.quaternion.set(q.x,q.y,q.z,q.w);
    m.group.visible=!m.finished||m.progress===1;
  }
  if(rotor&&rotorMesh){
    const p=rotor.translation(),q=rotor.rotation();
    rotorMesh.position.set(p.x,p.y,p.z);
    rotorMesh.quaternion.set(q.x,q.y,q.z,q.w);
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
    else{camDesired.set(-2,25,18);watchTarget.set(-14,14,-23);}
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
  $('scene-subtitle').textContent=stage==='funnel'?'Natural entry momentum · real funnel collisions':stage==='lower'?'Four paddles turn only when marbles hit':'Steeper oak trough · rolling rigid bodies';
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
async function boot(){
  try{
    setLoading('Loading WebAssembly rigid-body engine…');
    await RAPIER.init();
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
