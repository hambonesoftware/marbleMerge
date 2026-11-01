import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const node={classList:{add(){},remove(){},toggle(){}},children:[],style:{},append(){},textContent:''};
const context=vm.createContext({THREE,RAPIER,console,setTimeout,URLSearchParams,location:{search:''},document:{getElementById:()=>node}});
const source=(await fs.readFile(new URL('../v2/main.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/boot\(\);\s*$/,'');
vm.runInContext(source,context);
const regression=vm.runInContext(`(()=>{
  diagnostic=true;world=new RAPIER.World({x:0,y:0,z:0});scene=new THREE.Scene();marbles=[];pendulums=[];simTime=0;merges=0;
  const a=spawnMarble({color:0,at:new THREE.Vector3(-.3,4,0),velocity:new THREE.Vector3(1,0,0),angularVelocity:new THREE.Vector3(0,0,3)});
  const b=spawnMarble({color:1,at:new THREE.Vector3(.3,4,0),velocity:new THREE.Vector3(3,0,0),angularVelocity:new THREE.Vector3(0,0,3)});
  const mass=a.rb.mass()+b.rb.mass();
  world.step();
  const expectedVelocity=(a.rb.linvel().x+b.rb.linvel().x)/2,expectedSpin=(a.rb.angvel().z+b.rb.angvel().z)/2*.3*.3/(radiusForTier(2)**2);
  const merged=mergePair(a,b),m=marbles[0];
  const result={merged,massError:Math.abs(m.rb.mass()-mass),expectedVelocity,velocity:m.rb.linvel().x,spin:m.rb.angvel().z,expectedSpin};
  world.free();world=new RAPIER.World({x:0,y:-17,z:0});scene=new THREE.Scene();marbles=[];pendulums=[];
  buildWheel();rotor.setTranslation({x:2,y:3,z:4},true);resetState();
  result.resetError=new THREE.Vector3().copy(rotor.translation()).distanceTo(new THREE.Vector3(WHEEL_CENTER.x,WHEEL_CENTER.y,WHEEL_CENTER.z));
  world.free();return result;
})()`,context);
assert.equal(regression.merged,true);
assert.ok(regression.massError<1e-5);
assert.ok(Math.abs(regression.velocity-regression.expectedVelocity)<1e-4);
assert.ok(Math.abs(regression.spin-regression.expectedSpin)<1e-3);
assert.ok(regression.resetError<1e-5);
console.log('Merge mass, linear momentum, spin and axle reset regressions passed');
const seeds=process.argv.slice(2).map(Number);
for(const seed of seeds.length?seeds:[1,7,42]){
 const report=await vm.runInContext(`runCourseSelfTest(${seed})`,context);
 console.log(JSON.stringify(report));
 assert.equal(report.pass,true,'Live course must finish, remain finite and conserve mass');
 assert.ok(report.merges>0,'Must exercise real merge rules');
}
