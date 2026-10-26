import { useEffect, useRef } from "react";
import { styled } from "@mui/material/styles";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AXIS_COLORS, buildRig, dotTexture, labelTexture, poseRig } from "./handRig";
import type { Rig } from "./handRig";

/**
 * 三维手模：Godot XR Tools 的 CC0 手部网格（26 骨、带指甲）。
 * 骨骼朝向由 handLocalPose 的 21 个掌系关节逐指解算，握持度、分指权重
 * 与右栏二维骨架同源；这里只负责打光、关键点、坐标轴和比例尺。
 */

const loader = new GLTFLoader();

const Host = styled("div")({
  position: "absolute",
  inset: 0,
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
  "&:active": { cursor: "grabbing" },
  "& canvas": { display: "block", width: "100%", height: "100%" },
});

const Scale = styled("div")({
  position: "absolute",
  bottom: 3,
  left: 0,
  right: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 1,
  pointerEvents: "none",
});

const Bracket = styled("div")({
  width: 44,
  height: 4,
  borderLeft: "1px solid #c8d4e6",
  borderRight: "1px solid #c8d4e6",
  borderBottom: "1px solid #c8d4e6",
  opacity: 0.75,
});

const ScaleText = styled("span")({
  fontSize: 9,
  lineHeight: "10px",
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  color: "#7f8ea3",
});

interface HandModelProps {
  side: "left" | "right";
  color: string;
  time: number;
}

export default function HandModel({ side, color, time }: HandModelProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<Rig | null>(null);
  const renderRef = useRef<() => void>(() => {});
  const timeRef = useRef(time);
  timeRef.current = time;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(20, 1, 0.01, 6);
    camera.position.set(0, 0, 1);

    // —— 轨道相机：按住拖动环绕手模，滚轮推拉，双击回到初始视角 ——
    const orbit = {
      target: new THREE.Vector3(),
      dist: 1,
      baseDist: 1,
      azimuth: 0,
      polar: Math.PI / 2,
      baseAzimuth: 0,
      basePolar: Math.PI / 2,
      dragging: false,
      px: 0,
      py: 0,
    };
    const applyCamera = () => {
      const r = Math.sin(orbit.polar) * orbit.dist;
      camera.position.set(
        orbit.target.x + r * Math.sin(orbit.azimuth),
        orbit.target.y + orbit.dist * Math.cos(orbit.polar),
        orbit.target.z + r * Math.cos(orbit.azimuth),
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(orbit.target);
    };

    scene.add(new THREE.HemisphereLight(0xc2e6ff, 0x071018, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(-0.7, 1.1, 1.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fe4ff, 0.55);
    fill.position.set(1.3, 0.1, 0.9);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffdcae, 1.15);
    rim.position.set(0.1, -0.5, -1.4);
    scene.add(rim);

    const dotTex = dotTexture();
    const dotMat = new THREE.SpriteMaterial({
      map: dotTex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      color: 0xffffff,
    });
    const lineGeo = new THREE.BufferGeometry();
    const linePos = new Float32Array(32 * 2 * 3);
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5),
      transparent: true,
      opacity: 0.26,
      depthTest: false,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    lines.renderOrder = 10;
    lines.frustumCulled = false;

    const axisGeo = new THREE.BufferGeometry();
    const axisPos = new Float32Array(6 * 3);
    const axisCol = new Float32Array(6 * 3);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Color(AXIS_COLORS[i]);
      for (let k = 0; k < 2; k++) axisCol.set([c.r, c.g, c.b], (i * 2 + k) * 3);
    }
    axisGeo.setAttribute("position", new THREE.BufferAttribute(axisPos, 3));
    axisGeo.setAttribute("color", new THREE.BufferAttribute(axisCol, 3));
    const axisMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });
    const axisLines = new THREE.LineSegments(axisGeo, axisMat);
    axisLines.renderOrder = 13;
    axisLines.frustumCulled = false;
    scene.add(axisLines);

    const labels = ["X", "Y", "Z"].map((text, i) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: labelTexture(text, AXIS_COLORS[i]),
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      sprite.scale.set(0.03, 0.03, 1);
      sprite.renderOrder = 14;
      scene.add(sprite);
      return sprite;
    });

    const tmp = new THREE.Vector3();

    renderRef.current = () => {
      const rig = rigRef.current;
      if (!rig) {
        renderer.render(scene, camera);
        return;
      }
      poseRig(rig, timeRef.current);

      rig.lineBones.forEach((seg, i) => {
        seg.a.getWorldPosition(tmp);
        linePos.set([tmp.x, tmp.y, tmp.z], i * 6);
        seg.b.getWorldPosition(tmp);
        linePos.set([tmp.x, tmp.y, tmp.z], i * 6 + 3);
      });
      lineGeo.attributes.position.needsUpdate = true;

      rig.wrist.getWorldPosition(tmp);
      const axisLen = 0.07;
      for (let i = 0; i < 3; i++) {
        const v = rig.axes[i];
        axisPos.set([tmp.x, tmp.y, tmp.z], i * 6);
        axisPos.set(
          [tmp.x + v.x * axisLen, tmp.y + v.y * axisLen, tmp.z + v.z * axisLen],
          i * 6 + 3,
        );
        labels[i].position.set(
          tmp.x + v.x * axisLen * 1.2,
          tmp.y + v.y * axisLen * 1.2,
          tmp.z + v.z * axisLen * 1.2,
        );
      }
      axisGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      orbit.dragging = true;
      orbit.px = e.clientX;
      orbit.py = e.clientY;
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        /* 合成事件或指针已释放 */
      }
      e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!orbit.dragging) return;
      const dx = e.clientX - orbit.px;
      const dy = e.clientY - orbit.py;
      orbit.px = e.clientX;
      orbit.py = e.clientY;
      const k = 0.008;
      orbit.azimuth -= dx * k;
      orbit.polar = Math.min(
        Math.max(orbit.polar - dy * k, 0.12),
        Math.PI - 0.12,
      );
      applyCamera();
      renderRef.current();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!orbit.dragging) return;
      orbit.dragging = false;
      try {
        if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
      } catch {
        /* 忽略 */
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbit.dist = Math.min(
        Math.max(orbit.dist * Math.exp(e.deltaY * 0.0012), orbit.baseDist * 0.55),
        orbit.baseDist * 2.4,
      );
      applyCamera();
      renderRef.current();
    };
    const onDoubleClick = () => {
      orbit.azimuth = orbit.baseAzimuth;
      orbit.polar = orbit.basePolar;
      orbit.dist = orbit.baseDist;
      applyCamera();
      renderRef.current();
    };

    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", onPointerUp);
    host.addEventListener("pointercancel", onPointerUp);
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("dblclick", onDoubleClick);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      renderRef.current();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    loader.loadAsync(`/models/hand-${side}.gltf`).then((gltf) => {
      if (disposed) return;
      const rig = buildRig(gltf, side, color);
      rigRef.current = rig;
      scene.add(rig.scene);
      scene.add(lines);
      // 关键点直接挂在骨骼上，21 个点随姿态自动跟随
      rig.dots.forEach((d, i) => {
        const sprite = new THREE.Sprite(dotMat);
        const r = i === 0 ? 0.0105 : 0.0088;
        sprite.scale.set(r, r, 1);
        sprite.renderOrder = 12;
        d.bone.add(sprite);
      });

      // 用蒙皮后的真实包围盒取景（静置半握拳，留出张开余量）
      poseRig(rig, timeRef.current);
      const mesh = rig.scene.getObjectByProperty("type", "SkinnedMesh") as THREE.SkinnedMesh | null;
      let radius = 0.1;
      if (mesh) {
        mesh.computeBoundingBox();
        const box = mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        radius = Math.max(size.x, size.y) * 0.5;
        const fov = (camera.fov * Math.PI) / 180;
        const dist = (radius * 2.0) / Math.tan(fov / 2);
        orbit.target.copy(center);
        orbit.dist = dist;
        orbit.baseDist = dist;
        orbit.azimuth = 0;
        orbit.polar = Math.PI / 2;
        orbit.baseAzimuth = 0;
        orbit.basePolar = Math.PI / 2;
        applyCamera();
        camera.updateProjectionMatrix();
      }
      resize();
    });

    return () => {
      disposed = true;
      ro.disconnect();
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerUp);
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("dblclick", onDoubleClick);
      rigRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
      lineGeo.dispose();
      axisGeo.dispose();
      dotTex.dispose();
      dotMat.dispose();
      lineMat.dispose();
      axisMat.dispose();
      labels.forEach((s) => {
        s.material.map?.dispose();
        s.material.dispose();
      });
    };
  }, [side, color]);

  useEffect(() => {
    renderRef.current();
  }, [time]);

  return (
    <Host ref={hostRef}>
      <Scale>
        <Bracket />
        <ScaleText>0.1 m</ScaleText>
      </Scale>
    </Host>
  );
}
