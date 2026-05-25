import * as THREE from 'three';

// Fixed transseptal-style entry point (lower/posterior aspect of the chamber).
export const ENTRY = new THREE.Vector3(4, -26, 20);
const _v3 = new THREE.Vector3();

function buildShaft(material){
  // placeholder geometry; rebuilt each frame to follow the tip
  const geo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([ENTRY.clone(), ENTRY.clone(), ENTRY.clone()]), 32, 0.7, 8, false);
  return new THREE.Mesh(geo, material);
}

function rebuildShaft(mesh, tip){
  const mid = ENTRY.clone().lerp(tip, 0.5);
  mid.multiplyScalar(0.7);                       // bow the shaft toward the centre
  const curve = new THREE.CatmullRomCurve3([ENTRY.clone(), mid, tip.clone()]);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.TubeGeometry(curve, 40, mesh.userData.radius, 10, false);
  return curve;
}

export class MappingCatheter {
  constructor(scene){
    this.group = new THREE.Group();
    this.tip = ENTRY.clone();
    this.target = ENTRY.clone();
    this.speed = 1.2;

    const shaftMat = new THREE.MeshStandardMaterial({ color:0x6f7a8a, roughness:0.5, metalness:0.3 });
    this.shaft = buildShaft(shaftMat);
    this.shaft.userData.radius = 0.7;
    this.group.add(this.shaft);

    // 8 ring electrodes (4 bipoles) near the distal tip
    this.electrodes = [];
    const eMat = new THREE.MeshStandardMaterial({ color:0xf2c14e, roughness:0.35, metalness:0.6, emissive:0x3a2c00 });
    for(let i=0;i<8;i++){
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), eMat);
      this.electrodes.push(m);
      this.group.add(m);
    }
    this.tipMarker = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 16, 12),
      new THREE.MeshStandardMaterial({ color:0x3fb950, emissive:0x0c3d18, roughness:0.4 }));
    this.group.add(this.tipMarker);

    scene.add(this.group);
    this._layout();
  }

  setTarget(v){ this.target.copy(v); }

  update(dt){
    const v = 95 * this.speed;                 // constant velocity (units/sec)
    const d = _v3.subVectors(this.target, this.tip);
    const dist = d.length();
    if(dist < 0.6 || v*dt >= dist){
      this.tip.copy(this.target); this._layout(); return true;
    }
    this.tip.addScaledVector(d.multiplyScalar(1/dist), v*dt);
    this._layout();
    return false;
  }

  _layout(){
    const curve = rebuildShaft(this.shaft, this.tip);
    // distribute electrodes over the last 18% of the shaft
    for(let i=0;i<this.electrodes.length;i++){
      const t = 0.82 + (i/(this.electrodes.length-1))*0.18;
      this.electrodes[i].position.copy(curve.getPoint(Math.min(t,0.999)));
    }
    this.tipMarker.position.copy(this.tip);
  }

  setVisible(v){ this.group.visible = v; }
}

export class AblationCatheter {
  constructor(scene){
    this.group = new THREE.Group();
    this.tip = ENTRY.clone();
    this.target = ENTRY.clone();
    this.ablating = 0;            // remaining seconds of RF

    const shaftMat = new THREE.MeshStandardMaterial({ color:0x8a8f98, roughness:0.45, metalness:0.35 });
    this.shaft = buildShaft(shaftMat);
    this.shaft.userData.radius = 0.85;
    this.group.add(this.shaft);

    this.tipElectrode = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 20, 16),
      new THREE.MeshStandardMaterial({ color:0xd9dde3, roughness:0.3, metalness:0.7, emissive:0x000000 }));
    this.group.add(this.tipElectrode);

    this.glow = new THREE.PointLight(0xff5522, 0, 18);
    this.group.add(this.glow);

    scene.add(this.group);
    this._layout();
  }

  setTarget(v){ this.target.copy(v); }
  fireRF(seconds=2.2){ this.ablating = seconds; }

  update(dt){
    const v = 150;                             // units/sec
    const d = _v3.subVectors(this.target, this.tip);
    const dist = d.length();
    if(dist > 0.6 && v*dt < dist){
      this.tip.addScaledVector(d.multiplyScalar(1/dist), v*dt);
    } else {
      this.tip.copy(this.target);
    }
    this._layout();

    const m = this.tipElectrode.material;
    if(this.ablating > 0){
      this.ablating -= dt;
      const pulse = 0.5 + 0.5*Math.sin(performance.now()*0.02);
      m.emissive.setRGB(0.55*pulse + 0.2, 0.06*pulse, 0);
      this.glow.intensity = 2.5*pulse + 0.5;
    } else {
      m.emissive.setRGB(0,0,0);
      this.glow.intensity = 0;
    }
    return this.tip.distanceTo(this.target) < 0.6;
  }

  _layout(){
    rebuildShaft(this.shaft, this.tip);
    this.tipElectrode.position.copy(this.tip);
    this.glow.position.copy(this.tip);
  }

  setVisible(v){ this.group.visible = v; }
}
