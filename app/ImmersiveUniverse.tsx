"use client";

// Immersive, multi-dimensional "Capability Universe" rendered with Three.js.
// Lazy-loaded on demand (three is only fetched when a user opens this view),
// so it never affects first paint or SSR. Supports drag-to-orbit, auto-rotate,
// and a real WebXR "Enter VR" session on capable devices/headsets.

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type XrSession = { end: () => Promise<void>; addEventListener: (type: string, listener: () => void) => void };
type XrSystem = { isSessionSupported: (mode: string) => Promise<boolean>; requestSession: (mode: string, options?: unknown) => Promise<XrSession> };

const NODES = [
  { label: "Learn", color: 0x72ddef, angle: 0 },
  { label: "Practise", color: 0xa889fa, angle: (Math.PI * 2) / 3 },
  { label: "Validate", color: 0x7be4bd, angle: (Math.PI * 4) / 3 },
];

function makeLabelSprite(text: string, color: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(9,15,26,0.85)";
    ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(6, 6, 244, 52, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e8eef8";
    ctx.font = "600 30px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 34);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  return sprite;
}

export default function ImmersiveUniverse({ onClose }: { onClose: () => void }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [vrSupported, setVrSupported] = useState(false);
  const [inVr, setInVr] = useState(false);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070d, 0.03);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.xr.enabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const group = new THREE.Group();
    scene.add(group);

    // Glowing capability core.
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.1, 3),
      new THREE.MeshStandardMaterial({ color: 0x143a55, emissive: 0x72ddef, emissiveIntensity: 0.8, metalness: 0.4, roughness: 0.2 }),
    );
    group.add(core);
    const coreWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.35, 1),
      new THREE.MeshBasicMaterial({ color: 0x9aedf7, wireframe: true, transparent: true, opacity: 0.25 }),
    );
    group.add(coreWire);

    // Lights.
    scene.add(new THREE.AmbientLight(0x334466, 1.2));
    const keyLight = new THREE.PointLight(0x72ddef, 40, 40);
    keyLight.position.set(4, 6, 6);
    scene.add(keyLight);
    const violet = new THREE.PointLight(0xa889fa, 25, 40);
    violet.position.set(-6, -3, 4);
    scene.add(violet);

    // Orbit rings + nodes.
    const orbitRadius = 3.2;
    const nodeMeshes: THREE.Object3D[] = [];
    NODES.forEach((node) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(orbitRadius, 0.012, 16, 128),
        new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.18 }),
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      const pivot = new THREE.Group();
      pivot.rotation.y = node.angle;
      group.add(pivot);
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 32, 32),
        new THREE.MeshStandardMaterial({ color: node.color, emissive: node.color, emissiveIntensity: 0.7, roughness: 0.3 }),
      );
      sphere.position.set(orbitRadius, 0, 0);
      pivot.add(sphere);
      const label = makeLabelSprite(node.label, node.color);
      label.position.set(orbitRadius, 0.6, 0);
      pivot.add(label);
      nodeMeshes.push(pivot);
    });

    // Starfield.
    const starCount = 900;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      starPositions[i * 3] = (Math.random() - 0.5) * 60;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 60;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(starPositions, 3)),
      new THREE.PointsMaterial({ color: 0x9fb4d6, size: 0.06, transparent: true, opacity: 0.7 }),
    );
    scene.add(stars);

    // Drag-to-orbit.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let targetRotY = 0;
    let targetRotX = 0.2;
    const onDown = (event: PointerEvent) => { dragging = true; lastX = event.clientX; lastY = event.clientY; };
    const onUp = () => { dragging = false; };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      targetRotY += (event.clientX - lastX) * 0.005;
      targetRotX += (event.clientY - lastY) * 0.005;
      targetRotX = Math.max(-0.6, Math.min(0.9, targetRotX));
      lastX = event.clientX;
      lastY = event.clientY;
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      nodeMeshes.forEach((pivot, index) => { pivot.rotation.y = NODES[index].angle + t * 0.35; });
      coreWire.rotation.y += 0.003;
      coreWire.rotation.x += 0.0015;
      stars.rotation.y += 0.0004;
      if (!renderer.xr.isPresenting) {
        targetRotY += 0.0015; // gentle auto-rotate
        group.rotation.y += (targetRotY - group.rotation.y) * 0.06;
        group.rotation.x += (targetRotX - group.rotation.x) * 0.06;
      }
      renderer.render(scene, camera);
    });

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const xr = (navigator as unknown as { xr?: XrSystem }).xr;
    let cancelled = false;
    if (xr) {
      xr.isSessionSupported("immersive-vr").then((supported) => { if (!cancelled) setVrSupported(supported); }).catch(() => {});
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  async function enterVr() {
    const xr = (navigator as unknown as { xr?: XrSystem }).xr;
    const renderer = rendererRef.current;
    if (!xr || !renderer) return;
    try {
      const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
      await renderer.xr.setSession(session as unknown as never);
      setInVr(true);
      session.addEventListener("end", () => setInVr(false));
    } catch {
      setVrSupported(false);
    }
  }

  return (
    <div className="immersive-overlay" role="dialog" aria-label="Immersive capability universe">
      <div className="immersive-canvas" ref={mountRef} />
      <div className="immersive-hud">
        <div className="immersive-caption"><strong>Capability Universe</strong><small>Drag to orbit. Learn, Practise and Validate in three dimensions.</small></div>
        <div className="immersive-actions">
          {vrSupported && <button className="button button-primary button-small" onClick={enterVr} disabled={inVr}>{inVr ? "In VR" : "Enter VR"}</button>}
          <button className="button button-secondary button-small" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
