// Scrolling synthetic electrograms. Mapping leads change timing/amplitude with
// the catheter's local activation time and voltage; scar produces low,
// fractionated signals. Surface lead shows a P-QRS-T complex.

const CL = 600;            // cycle length (ms) -> 100 bpm
const PX_PER_SEC = 190;
const MS_PER_PX = 1000 / PX_PER_SEC;

const LEADS = [
  { name:'II',       type:'ecg',  color:'#7fd977' },
  { name:'Map d 1-2',type:'bip',  color:'#f2c14e', delay:0 },
  { name:'Map 3-4',  type:'bip',  color:'#f2c14e', delay:10 },
  { name:'Map 5-6',  type:'bip',  color:'#f2c14e', delay:20 },
  { name:'Abl d',    type:'abl',  color:'#ff8866' },
];

function wrap(t){ let m = ((t % CL) + CL) % CL; if(m > CL/2) m -= CL; return m; }
function gauss(x, s){ return Math.exp(-(x*x)/(2*s*s)); }
function biphasic(x, s){ return -(x/s) * Math.exp(-0.5*(x/s)*(x/s)) * 1.7; }

export class EGM {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.width = 0; this.height = 0;
    this.buffers = LEADS.map(() => null);
    this.info = { map:{lat:60, volt:1.2}, abl:{lat:60, volt:1.2}, ablating:false };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(r.width));
    this.height = Math.max(1, Math.floor(r.height));
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.buffers = LEADS.map(() => new Float32Array(this.width));
  }

  setInfo(info){ this.info = info; }

  _value(lead, t){
    const tau = wrap(t);
    if(lead.type === 'ecg'){
      return 0.16*gauss(tau+135,18)        // P
           - 0.12*gauss(tau+18,6)          // Q
           + 1.00*gauss(tau,8)             // R
           - 0.28*gauss(tau-22,9)          // S
           + 0.26*gauss(tau-220,42);       // T
    }
    const src = lead.type === 'abl' ? this.info.abl : this.info.map;
    const A = Math.max(0.1, Math.min(2.0, src.volt));
    const lat = src.lat + (lead.delay || 0);
    let v = A * biphasic(tau - lat, 7);
    if(A < 0.5){                            // scar -> fractionated, low amplitude
      v *= 0.6;
      v += 0.22*A*biphasic(tau - lat - 14, 5);
      v += 0.18*A*biphasic(tau - lat + 11, 5);
    }
    v += 0.07*gauss(tau, 11);               // small far-field ventricular
    if(lead.type === 'abl' && this.info.ablating) v *= 0.55;  // RF EGM attenuation
    return v + (Math.random()-0.5)*0.015;
  }

  update(dt){
    let k = Math.round(PX_PER_SEC * dt);
    if(k < 1) k = 1; if(k > 40) k = 40;
    for(let li=0; li<LEADS.length; li++){
      const buf = this.buffers[li];
      buf.copyWithin(0, k);
      for(let i=0; i<k; i++){
        buf[this.width - k + i] = this._value(LEADS[li], this.t + i*MS_PER_PX);
      }
    }
    this.t += k * MS_PER_PX;
    this._draw();
  }

  _draw(){
    const ctx = this.ctx, W = this.width, H = this.height;
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0,0,W,H);

    const rows = LEADS.length;
    const rh = H / rows;

    // grid
    ctx.strokeStyle = '#10161f';
    ctx.lineWidth = 1;
    for(let x=0; x<W; x+=Math.round(PX_PER_SEC*0.2)){   // 200 ms gridlines
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    }

    for(let li=0; li<rows; li++){
      const lead = LEADS[li];
      const base = rh*li + rh*0.55;
      const gain = lead.type === 'ecg' ? rh*0.34 : rh*0.20;

      ctx.strokeStyle = '#1c2735';
      ctx.beginPath(); ctx.moveTo(0, rh*li); ctx.lineTo(W, rh*li); ctx.stroke();

      ctx.fillStyle = lead.color;
      ctx.font = '11px Segoe UI, sans-serif';
      ctx.fillText(lead.name, 8, rh*li + 14);

      const buf = this.buffers[li];
      ctx.strokeStyle = lead.color;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for(let x=0; x<W; x++){
        const y = base - buf[x]*gain;
        if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
  }
}
