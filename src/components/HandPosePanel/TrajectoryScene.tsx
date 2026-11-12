import { useEffect, useRef } from "react";
import { styled } from "@mui/material/styles";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { generateTwoHands, type Pt } from "../../utils/handKeypoints";
import { DURATION } from "../../contexts/PlaybackContext";
import { buildRig, dotTexture, poseRig, type Rig } from "../Hud/handRig";

/**
 * 双手轨迹的三维合成视图。
 * 时间被映射成纵深：越新的轨迹越靠近镜头，旧轨迹退到画面深处，
 * 按住拖动可以环绕整条轨迹看它真正的立体走向；滚轮推拉，双击回到初始视角。
 */

const SAMPLES = 240;
/** 轨迹在时间方向上的总深度 */
const DEPTH = 0.84;
/** 轨迹窗里小手的世界尺寸 */
const HAND_SIZE = 0.19;

/** 相机缓慢巡游的大回环轨迹（灰色） */
function cameraPath(t: number): Pt {
  return {
    x: 0.5 + Math.sin(t * 0.105) * 0.15 + Math.sin(t * 0.41) * 0.02,
    y: 0.56 + Math.cos(t * 0.085) * 0.12 + Math.sin(t * 0.53) * 0.014,
  };
}

function rand(seed: number): number {
  const x = Math.sin(seed * 78.233 + 12.17) * 43758.5453;
  return x - Math.floor(x);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** 双手腕部 + 相机全程轨迹的采样点，带一点采集噪声 */
const paths = Array.from({ length: SAMPLES + 1 }, (_, i) => {
  const t = (i / SAMPLES) * DURATION;
  const h = generateTwoHands(t);
  const jitter = (p: Pt, s: number): Pt => ({
    x: p.x + (rand(s + i) - 0.5) * 0.005,
    y: p.y + (rand(s + i + 500) - 0.5) * 0.005,
  });
  return {
    cam: jitter(cameraPath(t), 1),
    left: jitter(h.left[0], 100),
    right: jitter(h.right[0], 200),
  };
});

const all = paths.flatMap((p) => [p.cam, p.left, p.right]);
const dataBox = {
  minX: Math.min(...all.map((p) => p.x)),
  maxX: Math.max(...all.map((p) => p.x)),
  minY: Math.min(...all.map((p) => p.y)),
  maxY: Math.max(...all.map((p) => p.y)),
};

const Host = styled("div")({
  position: "absolute",
  inset: 0,
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
  "&:active": { cursor: "grabbing" },
  "& canvas": { display: "block", width: "100%", height: "100%" },
});

const Gizmo = styled("svg")({
  position: "absolute",
  left: 4,
  bottom: 4,
  width: 36,
  height: 36,
  pointerEvents: "none",
});

interface Trail {
  get: (i: number) => Pt;
  doneGeo: THREE.BufferGeometry;
  todoGeo: THREE.BufferGeometry;
  glow: THREE.Sprite;
}

interface SceneHand {
  rig: Rig;
  group: THREE.Group;
  anchor: THREE.Vector3;
  side: "left" | "right";
}

interface TrajectorySceneProps {
  time: number;
  leftColor: string;
  rightColor: string;
  camColor: string;
}

export default function TrajectoryScene({
  time,
  leftColor,
  rightColor,
  camColor,
}: TrajectorySceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gizmoRef = useRef<SVGSVGElement>(null);
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
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1.6, 0.05, 20);

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

    // —— 环绕相机 ——
    const orbit = {
      target: new THREE.Vector3(0, 0, 0),
      dist: 2.35,
      baseDist: 2.35,
      azimuth: -0.34,
      polar: 1.34,
      baseAzimuth: -0.34,
      basePolar: 1.34,
      dragging: false,
      px: 0,
      py: 0,
    };

    // 小坐标轴随视角转动，读得出现下三根轴在世界里的方向
    const gLines = Array.from(
      gizmoRef.current?.querySelectorAll<SVGLineElement>("line") ?? [],
    );
    const gTexts = Array.from(
      gizmoRef.current?.querySelectorAll<SVGTextElement>("text") ?? [],
    );
    const axisDirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    const camRight = new THREE.Vector3();
    const camUp = new THREE.Vector3();
    const camForward = new THREE.Vector3();
    const updateGizmo = () => {
      camera.updateMatrixWorld();
      camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      camera.getWorldDirection(camForward);
      const L = 12;
      const ox = 8;
      const oy = 23;
      axisDirs.forEach((dir, i) => {
        const dx = dir.dot(camRight);
        const dy = -dir.dot(camUp);
        // 指向镜头的分量画成右下短划，轴才不会正面时缩成一个点
        const dz = -dir.dot(camForward) * 0.55;
        const x = ox + (dx + dz) * L;
        const y = oy + (dy + dz) * L;
        gLines[i]?.setAttribute("x2", clamp(x, 2, 34).toFixed(2));
        gLines[i]?.setAttribute("y2", clamp(y, 2, 33).toFixed(2));
        if (gTexts[i]) {
          // 字标压在窗口里，轴转到背面时也不会被裁掉
          const lx = clamp(ox + (dx + dz) * L * 1.3, 3, 31);
          const ly = clamp(oy + (dy + dz) * L * 1.3 + 2.5, 8, 34);
          gTexts[i].setAttribute("x", lx.toFixed(2));
          gTexts[i].setAttribute("y", ly.toFixed(2));
        }
      });
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
      updateGizmo();
    };
    applyCamera();

    const dotTex = dotTexture();
    const softTex = dotTexture(64, true);
    const spriteMats: THREE.SpriteMaterial[] = [];

    // —— 轨迹几何：横向铺满窗宽，时间方向做纵深 ——
    let halfW = 0.58;
    let halfH = 0.33;
    const mapping = { minX: dataBox.minX, maxX: dataBox.maxX, minY: dataBox.minY, maxY: dataBox.maxY };
    const mapX = (x: number) =>
      ((x - mapping.minX) / (mapping.maxX - mapping.minX) - 0.5) * 2 * halfW;
    const mapY = (y: number) =>
      (0.5 - (y - mapping.minY) / (mapping.maxY - mapping.minY)) * 2 * halfH;
    const zAt = (t: number) => (t / DURATION - 0.5) * DEPTH;

    const trails: Trail[] = [];
    const trailSpecs: { get: (i: number) => Pt; color: string }[] = [
      { get: (i) => paths[i].cam, color: camColor },
      { get: (i) => paths[i].left, color: leftColor },
      { get: (i) => paths[i].right, color: rightColor },
    ];

    const makeTrail = (get: (i: number) => Pt, colorHex: string): Trail => {
      const n = SAMPLES + 1;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const c = new THREE.Color(colorHex);
      for (let i = 0; i < n; i++) {
        const p = get(i);
        pos[i * 3] = mapX(p.x);
        pos[i * 3 + 1] = mapY(p.y);
        pos[i * 3 + 2] = zAt((i / SAMPLES) * DURATION);
        // 越新的轨迹越亮，静止视角也有前后层次
        const k = 0.55 + 0.45 * (i / SAMPLES);
        col[i * 3] = c.r * k;
        col[i * 3 + 1] = c.g * k;
        col[i * 3 + 2] = c.b * k;
      }
      const makeGeo = () => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        return g;
      };
      const doneGeo = makeGeo();
      const todoGeo = makeGeo();

      const todoPts = new THREE.Points(
        todoGeo,
        new THREE.PointsMaterial({
          map: dotTex,
          size: 0.0145,
          vertexColors: true,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          sizeAttenuation: true,
          blending: THREE.AdditiveBlending,
        }),
      );
      const donePts = new THREE.Points(
        doneGeo,
        new THREE.PointsMaterial({
          map: dotTex,
          size: 0.016,
          vertexColors: true,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          sizeAttenuation: true,
          blending: THREE.AdditiveBlending,
        }),
      );

      const todoLine = new THREE.Line(
        todoGeo,
        new THREE.LineDashedMaterial({
          color: new THREE.Color(colorHex),
          dashSize: 0.022,
          gapSize: 0.024,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        }),
      );
      todoLine.computeLineDistances();
      const doneLine = new THREE.Line(
        doneGeo,
        new THREE.LineBasicMaterial({
          color: new THREE.Color(colorHex),
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        }),
      );

      todoPts.renderOrder = 2;
      todoLine.renderOrder = 2;
      donePts.renderOrder = 3;
      doneLine.renderOrder = 3;
      todoPts.frustumCulled = false;
      donePts.frustumCulled = false;
      todoLine.frustumCulled = false;
      doneLine.frustumCulled = false;
      scene.add(todoLine, todoPts, doneLine, donePts);

      const glowMat = new THREE.SpriteMaterial({
        map: softTex,
        color: new THREE.Color(colorHex),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      spriteMats.push(glowMat);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(0.13, 0.13, 1);
      glow.renderOrder = 4;
      scene.add(glow);

      return { get, doneGeo, todoGeo, glow };
    };
    trailSpecs.forEach((s) => trails.push(makeTrail(s.get, s.color)));

    // —— 当前时刻的参考面：点阵 + 中轴，跟着播放位置在纵深里走 ——
    const gridGroup = new THREE.Group();
    const gridPtsGeo = new THREE.BufferGeometry();
    const gridMat = new THREE.PointsMaterial({
      map: dotTex,
      color: new THREE.Color("#4a90d9"),
      size: 0.0065,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const gridPoints = new THREE.Points(gridPtsGeo, gridMat);
    gridPoints.renderOrder = 1;
    gridPoints.frustumCulled = false;
    const crossGeo = new THREE.BufferGeometry();
    const crossMat = new THREE.LineBasicMaterial({
      color: new THREE.Color("#4a90d9"),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const cross = new THREE.LineSegments(crossGeo, crossMat);
    cross.renderOrder = 1;
    cross.frustumCulled = false;
    gridGroup.add(gridPoints, cross);
    scene.add(gridGroup);

    const buildGrid = () => {
      const xs: number[] = [];
      const ys: number[] = [];
      const step = 0.105;
      const cols = Math.max(2, Math.round((halfW * 2) / step));
      const rows = Math.max(2, Math.round((halfH * 2) / step));
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          xs.push(-halfW + (c / cols) * halfW * 2);
          ys.push(-halfH + (r / rows) * halfH * 2);
        }
      }
      const arr = new Float32Array(xs.length * 3);
      xs.forEach((x, i) => {
        arr[i * 3] = x;
        arr[i * 3 + 1] = ys[i];
        arr[i * 3 + 2] = 0;
      });
      gridPtsGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      gridPtsGeo.computeBoundingSphere();
      crossGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([
            -halfW, 0, 0, halfW, 0, 0,
            0, -halfH, 0, 0, halfH, 0,
          ]),
          3,
        ),
      );
      crossGeo.computeBoundingSphere();
    };
    buildGrid();

    // —— 两只手：腕关节落在当前轨迹点上，姿态与手窗同源 ——
    const hands: SceneHand[] = [];
    const loader = new GLTFLoader();
    const loadHand = async (side: "left" | "right", color: string) => {
      const gltf = await loader.loadAsync(`/models/hand-${side}.gltf`);
      if (disposed) return;
      const rig = buildRig(gltf, side, color, true);
      const group = new THREE.Group();
      group.add(rig.scene);
      scene.add(group);

      // 21 个关键点挂在骨骼上
      const dotMat = new THREE.SpriteMaterial({
        map: dotTex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        color: 0xffffff,
      });
      spriteMats.push(dotMat);
      rig.dots.forEach((d, i) => {
        const sprite = new THREE.Sprite(dotMat);
        const r = i === 0 ? 0.011 : 0.009;
        sprite.scale.set(r, r, 1);
        sprite.renderOrder = 12;
        d.bone.add(sprite);
      });

      // 缩放到轨迹窗里单手应有的体积，再把腕点挪到组原点
      poseRig(rig, timeRef.current);
      const mesh = rig.scene.getObjectByProperty(
        "type",
        "SkinnedMesh",
      ) as THREE.SkinnedMesh | null;
      let maxDim = 1;
      if (mesh) {
        mesh.computeBoundingBox();
        const size = mesh.boundingBox!.getSize(new THREE.Vector3());
        maxDim = Math.max(size.x, size.y, size.z) || 1;
      }
      group.scale.setScalar(HAND_SIZE / maxDim);
      group.updateMatrixWorld(true);
      const anchor = rig.wrist.getWorldPosition(new THREE.Vector3());
      hands.push({ rig, group, anchor, side });
      renderRef.current();
    };
    loadHand("left", leftColor);
    loadHand("right", rightColor);

    renderRef.current = () => {
      const t = timeRef.current;
      const idx = clamp(Math.round((t / DURATION) * SAMPLES), 0, SAMPLES);
      const zNow = zAt(t);

      for (const tr of trails) {
        tr.doneGeo.setDrawRange(0, idx + 1);
        tr.todoGeo.setDrawRange(idx, SAMPLES + 1 - idx);
        const p = tr.get(idx);
        tr.glow.position.set(mapX(p.x), mapY(p.y), zNow);
      }
      gridGroup.position.z = zNow;

      const cur = generateTwoHands(t);
      for (const h of hands) {
        const w = h.side === "left" ? cur.left[0] : cur.right[0];
        poseRig(h.rig, t);
        h.group.position.set(
          mapX(w.x) - h.anchor.x,
          mapY(w.y) - h.anchor.y,
          zNow - h.anchor.z,
        );
      }

      renderer.render(scene, camera);
    };

    // —— 交互：整窗拖动环绕，滚轮推拉，双击复位 ——
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
      orbit.azimuth -= dx * 0.007;
      orbit.polar = clamp(orbit.polar - dy * 0.007, 0.2, Math.PI - 0.2);
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
      orbit.dist = clamp(
        orbit.dist * Math.exp(e.deltaY * 0.0012),
        orbit.baseDist * 0.5,
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

      // 横向铺得比纵向多一点，环绕时深度方向也留出余量
      halfW = (w / h) * 0.44;
      halfH = 0.33;
      for (const tr of trails) {
        const pos = tr.doneGeo.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i <= SAMPLES; i++) {
          const p = tr.get(i);
          pos.setXY(i, mapX(p.x), mapY(p.y));
        }
        pos.needsUpdate = true;
        tr.doneGeo.computeBoundingSphere();
        tr.todoGeo.computeBoundingSphere();
        const todoPos = tr.todoGeo.getAttribute("position") as THREE.BufferAttribute;
        todoPos.needsUpdate = true;
        (tr.todoGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
      }
      buildGrid();

      renderRef.current();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    return () => {
      disposed = true;
      ro.disconnect();
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerUp);
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("dblclick", onDoubleClick);
      scene.traverse((o) => {
        const obj = o as THREE.Mesh & THREE.Points & THREE.Line;
        if (obj.isMesh || obj.isPoints || obj.isLine) {
          obj.geometry?.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m?.dispose());
        }
      });
      trails.forEach((tr) => {
        tr.doneGeo.dispose();
        tr.todoGeo.dispose();
      });
      gridPtsGeo.dispose();
      crossGeo.dispose();
      gridMat.dispose();
      crossMat.dispose();
      spriteMats.forEach((m) => m.dispose());
      dotTex.dispose();
      softTex.dispose();
      // dispose 只释放资源，上下文要显式丢掉，否则换配色几次就撞上浏览器上限
      renderer.forceContextLoss();
      renderer.dispose();
      renderer.domElement.remove();
      renderRef.current = () => {};
      hands.length = 0;
    };
  }, [leftColor, rightColor, camColor]);

  useEffect(() => {
    renderRef.current();
  }, [time]);

  return (
    <Host ref={hostRef}>
      <Gizmo ref={gizmoRef} viewBox="0 0 36 36" aria-hidden>
        <g strokeWidth="1.2">
          <line x1="8" y1="23" x2="20" y2="23" stroke="#ff5d5d" />
          <line x1="8" y1="23" x2="8" y2="11" stroke="#5fd08a" />
          <line x1="8" y1="23" x2="14" y2="29" stroke="#4da3ff" />
        </g>
        <text x="21" y="25" fontSize="7" fill="#ff5d5d">X</text>
        <text x="5" y="9" fontSize="7" fill="#5fd08a">Y</text>
        <text x="15" y="33" fontSize="7" fill="#4da3ff">Z</text>
      </Gizmo>
    </Host>
  );
}
