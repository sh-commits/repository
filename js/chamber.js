import * as THREE from 'three';

const R0 = 30;                 // nominal chamber radius (model units ~ mm)
const INFLUENCE = 11;          // IDW influence radius for painting (mm)
const UNMAPPED = new THREE.Color(0.20, 0.22, 0.26);

// Four pulmonary-vein ostia + appendage directions (left-atrium flavour)
const VEINS = [
  new THREE.Vector3( 0.55,  0.45, -0.70).normalize(),
  new THREE.Vector3(-0.55,  0.45, -0.70).normalize(),
  new THREE.Vector3( 0.60, -0.30, -0.74).normalize(),
  new THREE.Vector3(-0.60, -0.30, -0.74).normalize(),
];
const APPENDAGE = new THREE.Vector3(0.85, 0.25, 0.46).normalize();

function clamp(v, a, b){ return Math.min(b, Math.max(a, v)); }
function gauss(x, s){ return Math.exp(-(x*x)/(2*s*s)); }

// Deterministic organic radius for a unit direction — used for both the mesh
// and for placing catheter targets exactly on the surface.
function radiusForDir(d){
  const n1 = Math.sin(3*d.x+1.7)*Math.sin(3*d.y+0.3)*Math.sin(3*d.z+2.1);
  const n2 = Math.sin(5*d.y+4.0)*Math.cos(5*d.z+1.0);
  let r = R0*(1 + 0.10*n1 + 0.05*n2);
  for(const v of VEINS){
    const ang = Math.acos(clamp(d.dot(v),-1,1));
    r -= 4.5*gauss(ang, 0.13);     // vein ostia dimples
  }
  const aAng = Math.acos(clamp(d.dot(APPENDAGE),-1,1));
  r += 5.5*gauss(aAng, 0.16);      // appendage protrusion
  return r;
}

export class Chamber {
  constructor(scene){
    this.scene = scene;
    this.samples = [];           // {pos:Vector3, lat, volt}
    this.latMin = 0; this.latMax = 130;

    const geo = new THREE.SphereGeometry(1, 128, 96);
    const pos = geo.attributes.position;
    this.dirs = [];
    const dir = new THREE.Vector3();
    for(let i=0;i<pos.count;i++){
      dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const r = radiusForDir(dir);
      pos.setXYZ(i, dir.x*r, dir.y*r, dir.z*r);
      this.dirs.push(dir.clone());
    }
    geo.computeVertexNormals();

    const colors = new Float32Array(pos.count*3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geo = geo;
    this.colorAttr = geo.attributes.color;
    this.vpos = pos;

    this.material = new THREE.MeshStandardMaterial({
      vertexColors:true, roughness:0.78, metalness:0.05,
      transparent:true, opacity:0.62, side:THREE.DoubleSide, depthWrite:false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    scene.add(this.mesh);

    this.newCase();
  }

  // Randomise the underlying (hidden) physiology for a fresh "case".
  newCase(){
    this.focusDir = new THREE.Vector3().randomDirection();
    do { this.scarDir = new THREE.Vector3().randomDirection(); }
    while(this.scarDir.dot(this.focusDir) > 0.4);
    this.clearSamples();
  }

  // ---- hidden ground-truth fields (what the catheter "measures") ----
  trueLAT(dir){
    const ang = Math.acos(clamp(dir.dot(this.focusDir),-1,1));   // 0..PI from focus
    let lat = (ang/Math.PI)*110;
    const sAng = Math.acos(clamp(dir.dot(this.scarDir),-1,1));
    lat += 24*gauss(sAng, 0.4);            // conduction slows around scar
    return lat;
  }
  trueVoltage(dir){
    const sAng = Math.acos(clamp(dir.dot(this.scarDir),-1,1));
    return clamp(0.18 + 1.7*(1 - gauss(sAng, 0.45)), 0.05, 2.2);
  }

  surfacePointForDir(dir){
    const d = dir.clone().normalize();
    return d.multiplyScalar(radiusForDir(d));
  }

  // info under an arbitrary interior point (for live readout + EGMs)
  infoAtPoint(point){
    const dir = point.clone().normalize();
    return { lat:this.trueLAT(dir), volt:this.trueVoltage(dir), dir };
  }

  addSampleAtPoint(point){
    const dir = point.clone().normalize();
    const surf = this.surfacePointForDir(dir);
    const s = { pos:surf, lat:this.trueLAT(dir), volt:this.trueVoltage(dir) };
    this.samples.push(s);
    this._updateLatRange();
    return s;
  }

  _updateLatRange(){
    if(!this.samples.length) return;
    let mn=Infinity, mx=-Infinity;
    for(const s of this.samples){ mn=Math.min(mn,s.lat); mx=Math.max(mx,s.lat); }
    this.latMin = mn; this.latMax = Math.max(mx, mn+1);
  }

  clearSamples(){
    this.samples.length = 0;
    this.latMin = 0; this.latMax = 130;
    this.recolor('activation');
  }

  // EnSite/CARTO-style scale: early/scar = red ... late/healthy = purple
  static valueToColor(norm){
    const c = new THREE.Color();
    c.setHSL(clamp(norm,0,1)*0.80, 0.95, 0.5);
    return c;
  }

  recolor(mapType){
    const out = this.colorAttr.array;
    const useVolt = mapType === 'voltage';
    const vMin = 0.1, vMax = 1.5;
    const px = this.vpos;
    const tmp = new THREE.Vector3();
    const scratch = new THREE.Color();
    const R2 = INFLUENCE*INFLUENCE;
    const samples = this.samples;

    for(let i=0;i<px.count;i++){
      tmp.set(px.getX(i), px.getY(i), px.getZ(i));
      let wsum = 0, vsum = 0;
      for(let j=0;j<samples.length;j++){
        const s = samples[j];
        const d2 = tmp.distanceToSquared(s.pos);
        if(d2 > R2) continue;
        const w = 1/(d2 + 0.5);
        wsum += w;
        vsum += w * (useVolt ? s.volt : s.lat);
      }
      if(wsum === 0){
        out[i*3] = UNMAPPED.r; out[i*3+1] = UNMAPPED.g; out[i*3+2] = UNMAPPED.b;
      } else {
        const val = vsum/wsum;
        const norm = useVolt
          ? clamp((val - vMin)/(vMax - vMin), 0, 1)
          : clamp((val - this.latMin)/(this.latMax - this.latMin), 0, 1);
        scratch.setHSL(norm*0.80, 0.95, 0.5);
        out[i*3] = scratch.r; out[i*3+1] = scratch.g; out[i*3+2] = scratch.b;
      }
    }
    this.colorAttr.needsUpdate = true;
  }

  setShellTranslucent(on){
    this.material.opacity = on ? 0.62 : 1.0;
    this.material.depthWrite = !on;
    this.material.needsUpdate = true;
  }
}
