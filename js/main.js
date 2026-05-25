import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Chamber } from './chamber.js';
import { MappingCatheter, AblationCatheter } from './catheters.js';
import { LesionSet } from './ablation.js';
import { EGM } from './egm.js';

const host = document.getElementById('canvas-host');

// ---- renderer / scene / camera ----
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
camera.position.set(10, 8, 95);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 35;
controls.maxDistance = 220;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x202028, 0.6); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(40,60,80); scene.add(key);
const fill = new THREE.DirectionalLight(0x88aaff, 0.4); fill.position.set(-60,-20,-40); scene.add(fill);

// ---- domain objects ----
const chamber = new Chamber(scene);
const mapCath = new MappingCatheter(scene);
const ablCath = new AblationCatheter(scene);
const lesions = new LesionSet(scene);
const egm = new EGM(document.getElementById('egm-canvas'));

// ---- state ----
let mode = 'navigate';          // navigate | map | ablate
let mapType = 'activation';
let autoMapping = false;
let sweep = [];                 // queue of surface target points
let sweepIdx = 0;

function fibonacciTargets(n){
  const pts = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for(let i=0;i<n;i++){
    const y = 1 - (i/(n-1))*2;
    const r = Math.sqrt(1 - y*y);
    const th = ga*i;
    const dir = new THREE.Vector3(Math.cos(th)*r, y, Math.sin(th)*r);
    pts.push(chamber.surfacePointForDir(dir));
  }
  // greedy nearest-neighbour ordering so the catheter drags smoothly across
  // the surface (small hops) rather than jumping across the chamber
  const ordered = [];
  const used = new Array(pts.length).fill(false);
  let cur = mapCath.tip.clone();
  for(let k=0;k<pts.length;k++){
    let best = -1, bd = Infinity;
    for(let i=0;i<pts.length;i++){
      if(used[i]) continue;
      const d = cur.distanceToSquared(pts[i]);
      if(d < bd){ bd = d; best = i; }
    }
    used[best] = true;
    ordered.push(pts[best]);
    cur = pts[best];
  }
  return ordered;
}

function startAutoMap(){
  sweep = fibonacciTargets(150);
  sweepIdx = 0;
  autoMapping = true;
  mapCath.setTarget(sweep[0]);
  setMode('map');
  updateAutoButton();
}
function stopAutoMap(){ autoMapping = false; updateAutoButton(); }

// ---- UI refs ----
const ui = {
  pointCount: document.getElementById('point-count'),
  lesionCount: document.getElementById('lesion-count'),
  autoBtn: document.getElementById('auto-map'),
  roLat: document.getElementById('ro-lat'),
  roVolt: document.getElementById('ro-volt'),
  roTissue: document.getElementById('ro-tissue'),
  hint: document.getElementById('mode-hint'),
};

function updateAutoButton(){
  ui.autoBtn.textContent = autoMapping ? '❚❚ Pause auto-map' : '▶ Start auto-map';
  ui.autoBtn.classList.toggle('active', autoMapping);
}

function setMode(m){
  mode = m;
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  controls.enabled = true;     // orbit always available; clicks are distinguished from drags
  ui.hint.textContent = ({
    navigate:'Drag to rotate · scroll to zoom',
    map:'Click the chamber to take a point · or use auto-map',
    ablate:'Click the chamber to deliver a simulated RF lesion',
  })[m];
}

document.querySelectorAll('.mode').forEach(b =>
  b.addEventListener('click', () => setMode(b.dataset.mode)));

document.getElementById('map-type').addEventListener('change', e => {
  mapType = e.target.value;
  chamber.recolor(mapType);
  renderLegend();
});
document.getElementById('map-speed').addEventListener('input', e => {
  mapCath.speed = parseFloat(e.target.value);
});
ui.autoBtn.addEventListener('click', () => autoMapping ? stopAutoMap() : startAutoMap());
document.getElementById('clear-map').addEventListener('click', () => {
  stopAutoMap();
  chamber.clearSamples();
  chamber.recolor(mapType);
  ui.pointCount.textContent = '0';
});
document.getElementById('clear-lesions').addEventListener('click', () => {
  lesions.clear();
  ui.lesionCount.textContent = '0';
});
document.getElementById('reset-case').addEventListener('click', () => {
  stopAutoMap();
  chamber.newCase();
  chamber.recolor(mapType);
  lesions.clear();
  ui.pointCount.textContent = '0';
  ui.lesionCount.textContent = '0';
});
document.getElementById('show-catheters').addEventListener('change', e => {
  mapCath.setVisible(e.target.checked);
  ablCath.setVisible(e.target.checked);
});
document.getElementById('show-shell').addEventListener('change', e => {
  chamber.setShellTranslucent(e.target.checked);
});

// ---- picking (distinguish click from orbit drag) ----
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downXY = null;

renderer.domElement.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if(!downXY) return;
  const moved = Math.hypot(e.clientX-downXY[0], e.clientY-downXY[1]);
  downXY = null;
  if(moved > 6) return;                       // it was a drag/orbit
  if(mode === 'navigate') return;

  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left)/r.width)*2 - 1;
  ndc.y = -((e.clientY - r.top)/r.height)*2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(chamber.mesh, false)[0];
  if(!hit) return;

  if(mode === 'map'){
    stopAutoMap();
    mapCath.setTarget(hit.point.clone());
    chamber.addSampleAtPoint(hit.point);
    chamber.recolor(mapType);
    ui.pointCount.textContent = String(chamber.samples.length);
  } else if(mode === 'ablate'){
    ablCath.setTarget(hit.point.clone());
    ablCath.fireRF();
    const dir = hit.point.clone().normalize();
    lesions.add(chamber.surfacePointForDir(dir));
    ui.lesionCount.textContent = String(lesions.count);
  }
});

// ---- legend ----
function renderLegend(){
  const el = document.getElementById('legend');
  const stops = [];
  for(let i=0;i<=6;i++) stops.push('#'+Chamber.valueToColor(i/6).getHexString());
  const grad = `linear-gradient(90deg, ${stops.join(',')})`;
  const labels = mapType === 'voltage'
    ? ['0.1 mV (scar)','1.5 mV (healthy)']
    : ['early','late'];
  el.innerHTML =
    `<div class="bar" style="background:${grad}"></div>` +
    `<div class="labels"><span>${labels[0]}</span><span>${labels[1]}</span></div>`;
}
renderLegend();

// ---- resize ----
function resize(){
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- main loop ----
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if(autoMapping && sweep.length){
    const reached = mapCath.update(dt);
    if(reached){
      chamber.addSampleAtPoint(mapCath.tip);
      chamber.recolor(mapType);
      ui.pointCount.textContent = String(chamber.samples.length);
      sweepIdx++;
      if(sweepIdx < sweep.length) mapCath.setTarget(sweep[sweepIdx]);
      else stopAutoMap();
    }
  } else {
    mapCath.update(dt);
  }
  ablCath.update(dt);

  // live readout + EGM feed from the mapping catheter's current contact
  const info = chamber.infoAtPoint(mapCath.tip);
  const ablInfo = chamber.infoAtPoint(ablCath.tip);
  ui.roLat.textContent = info.lat.toFixed(0) + ' ms';
  ui.roVolt.textContent = info.volt.toFixed(2) + ' mV';
  ui.roTissue.textContent = info.volt < 0.5 ? 'scar' : info.volt < 1.0 ? 'border zone' : 'healthy';
  egm.setInfo({
    map:{ lat:info.lat, volt:info.volt },
    abl:{ lat:ablInfo.lat, volt:ablInfo.volt },
    ablating: ablCath.ablating > 0,
  });
  egm.update(dt);

  controls.update();
  renderer.render(scene, camera);
}
animate();
