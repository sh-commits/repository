# EP MapSim — Cardiac Mapping & Ablation Simulator

A browser-based **educational simulator** inspired by 3D electroanatomic mapping
systems used in cardiac electrophysiology. It runs entirely client-side (static
GitHub Pages site, Three.js via CDN — no build step).

> ⚠️ **SIMULATION ONLY — NOT A MEDICAL DEVICE.**
> This software contains no patient data and is **not** cleared or validated for
> any medical use. All anatomy and signals are synthetic. It must **never** be
> used for clinical diagnosis, treatment, or to guide a real procedure.

## Features
- **3D chamber model** — organic, left-atrium-flavoured geometry you can rotate/zoom.
- **Mapping catheter** — multipolar catheter with a roving tip; auto-sweep builds
  the map progressively, or click to take individual points.
- **Activation (LAT) & bipolar voltage maps** — color-painted onto the surface
  via inverse-distance interpolation, using the familiar red→purple scale.
- **Electrograms** — scrolling synthetic intracardiac signals whose timing and
  amplitude follow the catheter's local activation time and tissue voltage
  (low/fractionated over simulated scar).
- **Simulated RF ablation** — drop lesion tags on the surface in Ablate mode.
- **New case** — randomises the hidden activation focus and scar region.

## Run locally
```bash
python3 -m http.server 8099
# open http://localhost:8099
```

## Usage
- **Navigate** — drag to rotate, scroll to zoom.
- **Map** — click the chamber for points, or press *Start auto-map*.
- **Ablate** — click the chamber to deliver a simulated RF lesion.

Switch between **LAT** and **Voltage** maps from the sidebar.
