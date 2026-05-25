import * as THREE from 'three';

// Simulated RF lesion tags dropped on the chamber surface.
export class LesionSet {
  constructor(scene){
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lesions = [];
    this.geo = new THREE.SphereGeometry(1.7, 16, 12);
    this.mat = new THREE.MeshStandardMaterial({
      color:0x9b2d2d, roughness:0.6, metalness:0.1, emissive:0x2a0606,
    });
  }

  add(point){
    const m = new THREE.Mesh(this.geo, this.mat);
    // push the tag very slightly proud of the surface so it reads clearly
    m.position.copy(point).multiplyScalar(1.01);
    this.group.add(m);
    this.lesions.push(m);
    return this.lesions.length;
  }

  clear(){
    for(const m of this.lesions) this.group.remove(m);
    this.lesions.length = 0;
  }

  get count(){ return this.lesions.length; }
}
