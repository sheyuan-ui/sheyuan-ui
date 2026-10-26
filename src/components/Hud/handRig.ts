import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { generateHandLocalPose, handMotion } from "../../utils/handKeypoints";

/**
 * 三维手模的共用装配：骨骼映射、展示朝向、蒙皮材质与逐指解算。
 * 姿态窗的单手视图和轨迹窗里的双手都从这里取 rig，保证两者同一套比例与朝向。
 */

/** MediaPipe 21 点 -> 模型骨骼。拇指 4 节，其余手指多出的掌骨并入掌心。 */
export const FINGERS: {
  prefix: string;
  bones: { name: string; from: number; to: number }[];
  dots: { name: string; index: number }[];
}[] = [
  {
    prefix: "Thumb",
    bones: [
      { name: "Metacarpal", from: 1, to: 2 },
      { name: "Proximal", from: 2, to: 3 },
      { name: "Distal", from: 3, to: 4 },
    ],
    dots: [
      { name: "Metacarpal", index: 1 },
      { name: "Proximal", index: 2 },
      { name: "Distal", index: 3 },
      { name: "Tip", index: 4 },
    ],
  },
  ...["Index", "Middle", "Ring", "Little"].map((prefix, f) => {
    const base = 5 + f * 4;
    return {
      prefix,
      bones: [
        { name: "Proximal", from: base, to: base + 1 },
        { name: "Intermediate", from: base + 1, to: base + 2 },
        { name: "Distal", from: base + 2, to: base + 3 },
      ],
      dots: [
        { name: "Proximal", index: base },
        { name: "Intermediate", index: base + 1 },
        { name: "Distal", index: base + 2 },
        { name: "Tip", index: base + 3 },
      ],
    };
  }),
];

export interface ChainBone {
  bone: THREE.Bone;
  bindLocal: THREE.Quaternion;
  parentBindWorld: THREE.Quaternion;
  restDir: THREE.Vector3;
  from: number;
  to: number;
}

export interface Rig {
  side: "left" | "right";
  scene: THREE.Object3D;
  wrist: THREE.Bone;
  wristBindWorld: THREE.Quaternion;
  wristParentBindWorldInv: THREE.Quaternion;
  chains: ChainBone[];
  dots: { bone: THREE.Bone; index: number }[];
  lineBones: { a: THREE.Bone; b: THREE.Bone }[];
  qRoot: THREE.Quaternion;
  /** 掌系三个方向在世界里的朝向：拇指、手指、掌心 */
  axes: THREE.Vector3[];
}

export function dotTexture(size = 64, soft = false): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (soft) {
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(0.42, "rgba(255,255,255,0.14)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.34, "rgba(255,255,255,0.96)");
    g.addColorStop(0.55, "rgba(255,255,255,0.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function labelTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "700 38px 'Roboto Mono', Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // 深色描边，让字母压在浅色手模上也读得清
  ctx.lineJoin = "round";
  ctx.lineWidth = 7;
  ctx.strokeStyle = "rgba(2,8,16,0.85)";
  ctx.strokeText(text, 32, 34);
  ctx.fillStyle = color;
  ctx.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const AXIS_COLORS = ["#ff5d5d", "#5fd08a", "#4da3ff"];

/** 展示朝向：手背朝向镜头、略带侧转与俯仰，让三根坐标轴都露出来 */
export const DISPLAY: Record<"left" | "right", { roll: number; yaw: number; pitch: number }> = {
  left: { roll: -0.18, yaw: 0.46, pitch: 0.26 },
  right: { roll: 0.28, yaw: -0.42, pitch: 0.26 },
};

export function buildRig(
  gltf: GLTF,
  side: "left" | "right",
  color: string,
  mini = false,
): Rig {
  const scene = gltf.scene;
  const suffix = side === "left" ? "_L" : "_R";
  const bones: Record<string, THREE.Bone> = {};
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
  });
  scene.updateMatrixWorld(true);

  const at = (name: string) => bones[name + suffix].getWorldPosition(new THREE.Vector3());
  const wrist = bones["Wrist" + suffix];
  const wristPos = at("Wrist");
  const middleMcp = at("Middle_Proximal");
  const indexMcp = at("Index_Proximal");
  const littleMcp = at("Little_Proximal");
  const thumbTip = at("Thumb_Tip");

  // 静置是半握拳：手指方向 = 腕->中指根，拇指侧 = 小指根->食指根
  const fingers = middleMcp.clone().sub(wristPos).normalize();
  const thumb = indexMcp.clone().sub(littleMcp);
  thumb.addScaledVector(fingers, -thumb.dot(fingers)).normalize();
  const across = new THREE.Vector3().crossVectors(thumb, fingers).normalize();
  // 拇指尖在 cross(thumb,fingers) 的哪一侧决定了这只手的手性：
  // 掌面法向 = -cross 的手与 +cross 的手互为镜像，不能靠旋转互相重合。
  const palmSign = thumbTip.clone().sub(wristPos).dot(across) > 0 ? 1 : -1;
  const palm = across.clone().multiplyScalar(palmSign);

  // 展示朝向：先摆好拇指(x)、手指(y)两轴，掌面(z)由手性推出，
  // 这样 model/world 两组基的手性一致，qRoot 一定是纯旋转而不是镜像。
  const qDisplay = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(DISPLAY[side].pitch, DISPLAY[side].yaw, DISPLAY[side].roll, "YXZ"),
  );
  const axes = [
    new THREE.Vector3(1, 0, 0).applyQuaternion(qDisplay).normalize(),
    new THREE.Vector3(0, 1, 0).applyQuaternion(qDisplay).normalize(),
  ];
  axes.push(
    new THREE.Vector3()
      .crossVectors(axes[0], axes[1])
      .multiplyScalar(palmSign)
      .normalize(),
  );

  const modelBasis = new THREE.Matrix4().makeBasis(thumb, fingers, palm);
  const worldBasis = new THREE.Matrix4().makeBasis(axes[0], axes[1], axes[2]);
  const qRoot = new THREE.Quaternion()
    .setFromRotationMatrix(
      new THREE.Matrix4().multiplyMatrices(worldBasis, modelBasis.clone().transpose()),
    )
    .normalize();

  const parentBindWorld = (b: THREE.Bone) =>
    b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();

  const chains: ChainBone[] = [];
  const lineBones: { a: THREE.Bone; b: THREE.Bone }[] = [];
  const dots: { bone: THREE.Bone; index: number }[] = [{ bone: wrist, index: 0 }];

  for (const finger of FINGERS) {
    const chain: THREE.Bone[] = [];
    finger.bones.forEach((spec, i) => {
      const bone = bones[`${finger.prefix}_${spec.name}${suffix}`];
      const nextName = finger.bones[i + 1]?.name ?? "Tip";
      const child = bones[`${finger.prefix}_${nextName}${suffix}`];
      const restDir = child
        .getWorldPosition(new THREE.Vector3())
        .sub(bone.getWorldPosition(new THREE.Vector3()))
        .normalize();
      chains.push({
        bone,
        bindLocal: bone.quaternion.clone(),
        parentBindWorld: parentBindWorld(bone),
        restDir,
        from: spec.from,
        to: spec.to,
      });
      chain.push(bone);
    });
    chain.push(bones[`${finger.prefix}_Tip${suffix}`]);
    for (let i = 0; i + 1 < chain.length; i++) lineBones.push({ a: chain[i], b: chain[i + 1] });
    for (const d of finger.dots) {
      dots.push({ bone: bones[`${finger.prefix}_${d.name}${suffix}`], index: d.index });
    }
  }

  // 掌心骨架：腕 -> 四指根、指根横弓，方便看出掌面朝向
  const mcps = ["Index", "Middle", "Ring", "Little"].map(
    (n) => bones[`${n}_Proximal${suffix}`],
  );
  for (const mcp of mcps) lineBones.push({ a: wrist, b: mcp });
  for (let i = 0; i + 1 < mcps.length; i++) lineBones.push({ a: mcps[i], b: mcps[i + 1] });

  const mesh = scene.getObjectByProperty("type", "SkinnedMesh") as THREE.SkinnedMesh | null;
  if (mesh) {
    mesh.material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      roughness: 0.43,
      metalness: 0.04,
      clearcoat: 0.32,
      clearcoatRoughness: 0.6,
      sheen: 0.18,
      sheenColor: new THREE.Color(color).multiplyScalar(0.5),
      // 轨迹窗里只有几十像素，补一点自发光才不至于糊成一团
      emissive: new THREE.Color(color).multiplyScalar(mini ? 0.14 : 0),
    });
    mesh.frustumCulled = false;
  }

  return {
    side,
    scene,
    wrist,
    wristBindWorld: wrist.getWorldQuaternion(new THREE.Quaternion()),
    wristParentBindWorldInv: parentBindWorld(wrist).invert(),
    chains,
    dots,
    lineBones,
    qRoot,
    axes,
  };
}

/** 按 21 点姿态旋转骨骼；骨骼长度不变，关节位置就是模型自身的关节 */
export function poseRig(rig: Rig, t: number) {
  const points = generateHandLocalPose(t, rig.side, 0.72);
  // 展示姿态之外再叠一层随时间的手腕动作：拧杯、刷洗、倒水都从这里来
  const m = handMotion(t, rig.side);
  const qMotion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(m.pitch, m.yaw, m.roll, "YXZ"),
  );
  const qBase = qMotion.clone().multiply(rig.qRoot);
  rig.wrist.quaternion
    .copy(rig.wristParentBindWorldInv)
    .multiply(qBase)
    .multiply(rig.wristBindWorld);

  // 掌系三轴跟着手腕一起转，手指才会顺着新的掌心方向屈伸
  const axes = rig.axes.map((a) => a.clone().applyQuaternion(qMotion));

  const accum = new Map<THREE.Bone, THREE.Quaternion>();
  accum.set(rig.wrist, qBase);

  for (const cb of rig.chains) {
    const parentA = accum.get(cb.bone.parent as THREE.Bone) ?? qBase;
    const local = new THREE.Vector3(
      points[cb.to].x - points[cb.from].x,
      points[cb.to].y - points[cb.from].y,
      points[cb.to].z - points[cb.from].z,
    ).normalize();
    // 掌系 -> 世界
    const target = new THREE.Vector3(
      local.x * axes[0].x + local.y * axes[1].x + local.z * axes[2].x,
      local.x * axes[0].y + local.y * axes[1].y + local.z * axes[2].y,
      local.x * axes[0].z + local.y * axes[1].z + local.z * axes[2].z,
    ).normalize();

    const current = cb.restDir.clone().applyQuaternion(parentA);
    const bend = new THREE.Quaternion().setFromUnitVectors(current, target);
    // 关节的弯折发生在世界空间：local = (parentPosed)^-1 · bend · parentPosed · bindLocal
    const parentPosed = parentA.clone().multiply(cb.parentBindWorld);
    cb.bone.quaternion
      .copy(parentPosed)
      .invert()
      .multiply(bend)
      .multiply(parentPosed)
      .multiply(cb.bindLocal);
    accum.set(cb.bone, bend.clone().multiply(parentA).normalize());
  }

  rig.scene.updateMatrixWorld(true);
}
