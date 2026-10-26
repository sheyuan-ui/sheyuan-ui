// 21 关键点手部骨架生成器（MediaPipe 拓扑）
//
// 手在"掌系"局部坐标里做三维正向运动学：掌心朝 +z（镜头方向）、手指朝 +y、
// 拇指侧为 +x，掌长为单位长度。每根手指用 Rodrigues 公式逐级叠加屈曲角，
// 因此握持时指尖会向掌心收拢并产生真实的透视缩短，而不是在同一平面里横扫。
// 局部坐标经翻滚/俯仰/偏航后做带轻微透视的正交投影，输出归一化屏幕坐标
// （y 向下）与深度 z，供渲染层做明暗与线宽调制。

export type Pt = { x: number; y: number; z?: number };
type V3 = { x: number; y: number; z: number };

const X_AXIS = v3(1, 0, 0);
const Y_AXIS = v3(0, 1, 0);
const Z_AXIS = v3(0, 0, 1);

/** 镜头焦距（以掌长为单位），越小透视越强 */
const FOCAL = 4.2;

const deg = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function v3(x: number, y: number, z: number): V3 {
  return { x, y, z };
}
const add = (a: V3, b: V3) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const mul = (a: V3, k: number) => v3(a.x * k, a.y * k, a.z * k);
function unit(a: V3): V3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return mul(a, 1 / l);
}

/** 绕任意单位轴旋转（Rodrigues 旋转公式） */
function rotAxis(p: V3, axis: V3, ang: number): V3 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const d = axis.x * p.x + axis.y * p.y + axis.z * p.z;
  const k = v3(
    axis.y * p.z - axis.z * p.y,
    axis.z * p.x - axis.x * p.z,
    axis.x * p.y - axis.y * p.x,
  );
  return v3(
    p.x * c + k.x * s + axis.x * d * (1 - c),
    p.y * c + k.y * s + axis.y * d * (1 - c),
    p.z * c + k.z * s + axis.z * d * (1 - c),
  );
}

interface FingerSpec {
  /** 指根（MCP / 拇指掌骨头）在掌系中的位置 */
  mcp: [number, number, number];
  /** 展开角（度，向拇指侧为正）：[张开, 满握] */
  spread: [number, number];
  /** 指节长度（掌长为单位）；拇指只有两段 */
  seg: number[];
  /** 各级满屈曲角（度） */
  flex: [number, number, number];
  /** 拇指内收：绕竖轴把拇指转向掌心前方（度） */
  oppose?: number;
}

// 顺序：拇指、食指、中指、无名指、小指
const FINGERS: FingerSpec[] = [
  { mcp: [0.34, 0.26, 0.12], spread: [46, 14], seg: [0.28, 0.24], flex: [24, 44, 22], oppose: -36 },
  { mcp: [0.29, 0.88, 0.02], spread: [10, 3], seg: [0.38, 0.24, 0.17], flex: [58, 64, 42] },
  { mcp: [0.10, 0.93, 0.0], spread: [2, -1], seg: [0.42, 0.28, 0.18], flex: [58, 66, 44] },
  { mcp: [-0.10, 0.90, -0.01], spread: [-6, -3], seg: [0.37, 0.25, 0.16], flex: [56, 62, 40] },
  { mcp: [-0.28, 0.82, -0.03], spread: [-14, -7], seg: [0.30, 0.20, 0.15], flex: [54, 58, 38] },
];

// 各指屈曲的先后次序（中指先动、小指最后），让握合不像机械夹爪
const CURL_LAG = [0.05, 0.02, 0, 0.04, 0.08];

/** 单指链式运动学，返回 [MCP, PIP, DIP, TIP]（拇指为 [MCP, IP, TIP]） */
function buildFinger(spec: FingerSpec, curl: number): V3[] {
  const spread = spec.spread[0] + (spec.spread[1] - spec.spread[0]) * curl;
  let dir = unit(v3(Math.sin(deg(spread)), Math.cos(deg(spread)), 0));
  if (spec.oppose) dir = rotAxis(dir, Y_AXIS, deg(spec.oppose * curl));

  // 屈曲轴位于掌平面内、垂直于手指：绕它旋转使指尖朝掌心（+z）收拢
  const axis = unit(v3(dir.y, -dir.x, 0));
  const mcp = v3(spec.mcp[0], spec.mcp[1], spec.mcp[2]);
  const pts: V3[] = [mcp];
  let cur = mcp;
  const n = spec.seg.length;
  for (let s = 0; s < n; s++) {
    const fi = Math.min(s + (n === 2 ? 1 : 0), 2);
    dir = rotAxis(dir, axis, deg(spec.flex[fi] * curl));
    cur = add(cur, mul(dir, spec.seg[s]));
    pts.push(cur);
  }
  return pts;
}

interface HandOptions {
  /** 手腕位置（归一化屏幕坐标，y 向下） */
  wrist: { x: number; y: number };
  /** 掌长占画面高度的比例 */
  palm: number;
  /** 左手：沿竖轴镜像 */
  mirror: boolean;
  /** 姿态角（弧度） */
  roll: number;
  yaw: number;
  pitch: number;
  /** 基础握持度 0（张开）.. 1（满握） */
  grip: number;
  /** 五指各自的握持权重，用于"食指伸出擦拭"这类手势 */
  gains?: number[];
}

/**
 * 掌系里的 21 个关键点：腕在原点，掌心朝 +z、手指朝 +y、拇指侧为 +x。
 * 三维手模按这组点逐指解算骨骼朝向，因此握持度、分指权重和展开角
 * 与二维骨架完全同源。
 */
function handLocalPose(
  opt: Pick<HandOptions, "grip" | "gains">,
  /** 三维手模用：整体收拢比例的缩放，避免网格自穿插、保留指节可读性 */
  curlScale = 1,
): V3[] {
  const local: V3[] = new Array(21);
  local[0] = v3(0, 0, 0); // 腕即掌系原点
  const thumbRoot = v3(0.2, 0.03, 0.04); // 拇指根部（CMC）

  let idx = 1;
  for (let f = 0; f < FINGERS.length; f++) {
    const gain = opt.gains?.[f] ?? 1;
    const curl = clamp((opt.grip * gain - CURL_LAG[f]) * curlScale, 0, 1);
    const chain = buildFinger(FINGERS[f], curl);
    const out = f === 0 ? [thumbRoot, ...chain] : chain;
    for (const p of out) {
      local[idx++] = p;
    }
  }
  return local;
}

/** 生成某时刻一只手的 21 个关键点（归一化屏幕坐标 + 深度） */
function generateHand(_t: number, opt: HandOptions): Pt[] {
  const local = handLocalPose(opt);
  const k = opt.palm;
  return local.map((p) => {
    let q = rotAxis(rotAxis(rotAxis(p, Z_AXIS, opt.roll), X_AXIS, opt.pitch), Y_AXIS, opt.yaw);
    if (opt.mirror) q = v3(-q.x, q.y, q.z);
    const persp = FOCAL / (FOCAL - q.z);
    return {
      x: opt.wrist.x + q.x * persp * k,
      y: opt.wrist.y - q.y * persp * k,
      z: q.z,
    };
  });
}

/** 整段素材时长（秒），用于把动作编排铺满一遍清洗流程 */
const CLIP = 60;

/**
 * 杯子在清洗流程中的走位：从水槽左侧拿起、绕台面移动到右侧冲水、再放回。
 * 主视图据此绘制杯子，双手与轨迹图共用同一条路线。
 */
function cupPose(t: number): { x: number; y: number; tilt: number } {
  const s = (((t % CLIP) + CLIP) % CLIP) / CLIP;
  return {
    x: 0.46 + Math.sin(s * Math.PI * 2 + 0.6) * 0.085 + Math.sin(t * 0.23) * 0.012,
    y: 0.5 + Math.sin(s * Math.PI * 2 * 1.6) * 0.05 + Math.cos(t * 0.31) * 0.01,
    tilt: Math.sin(t * 0.5) * 0.14,
  };
}

/**
 * 双手便捷封装：左手托握杯身随杯子走位，右手绕杯口擦洗。
 * 只依赖时间 t，任意时刻可独立求值，因此可拖动进度条或整段预采样轨迹。
 */
function handOptions(t: number): { left: HandOptions; right: HandOptions } {
  const cup = cupPose(t);

  // 动作幅度跟着底部标注的时间轴走：拧杯子、刷洗、倒水各有自己的窗口
  const leftRinse = phase(t, 9.5, 14, 0.7);
  const leftAdjust = phase(t, 23.1, 28, 0.7);
  const leftPour = phase(t, 38.2, 44, 0.9);
  const leftRelease = phase(t, 50, 55.5, 0.8);
  const rightFaucet = phase(t, 4.2, 9.5, 0.7);
  const rightScrub = phase(t, 14, 28, 0.9);
  const rightPutDown = phase(t, 28, 33.5, 0.7);
  const rightRinse = phase(t, 44, 50, 0.8);

  // 左手从左下方环抱杯身，右手从右上方伸到杯口擦洗
  const leftWrist = {
    x: cup.x - 0.058 + Math.sin(t * 0.5) * 0.004,
    y: cup.y + 0.05 + Math.cos(t * 0.62) * 0.004,
  };
  const a = t * 1.15;
  const rightWrist = {
    x: cup.x + 0.088 + Math.cos(a) * 0.02,
    y: cup.y - 0.115 + Math.sin(a) * 0.016,
  };

  const left: HandOptions = {
    wrist: leftWrist,
    palm: 0.116,
    mirror: true,
    // 镜像后 roll 为正时手指才指向画面右侧的杯子
    roll: 1.1 + Math.sin(t * 0.42) * 0.06 + cup.tilt * 0.35,
    yaw: 0.5 + Math.sin(t * 0.3) * 0.08,
    pitch: -0.18 + Math.sin(t * 0.25) * 0.05,
    // 倒水时握持不能松，杯子还在手里；放到台面后才逐渐张开
    grip:
      0.88 +
      Math.sin(t * 0.8) * 0.04 +
      leftRinse * 0.11 * Math.sin((t - 9.5) * 3.2) +
      leftAdjust * 0.07 * Math.sin((t - 23.1) * 2) +
      leftPour * 0.03 * Math.sin((t - 38.2) * 3.2) -
      leftRelease * 0.22,
    gains: [1, 0.95, 0.92, 0.9, 0.86],
  };

  const right: HandOptions = {
    wrist: rightWrist,
    palm: 0.112,
    mirror: false,
    // 手背朝上、手指朝左下伸向杯口
    roll: 2.32 + Math.sin(t * 0.55 + 1) * 0.08 - cup.tilt * 0.35,
    yaw: -0.35 + Math.sin(t * 0.36 + 2) * 0.1,
    pitch: 0.25 + Math.sin(t * 0.28) * 0.06,
    grip:
      0.6 +
      Math.sin(t * 0.9 + 0.6) * 0.06 +
      rightScrub * 0.12 * Math.sin((t - 14) * 2.7) +
      rightFaucet * 0.1 -
      rightPutDown * 0.14 +
      rightRinse * 0.07 * Math.sin((t - 44) * 2.6),
    // 食指伸出贴住杯壁摩擦，其余手指收拢；刷洗时食指反复屈伸
    gains: [
      1,
      0.25 + 0.12 * Math.sin(t * 1.6) + rightScrub * 0.16 * Math.sin((t - 14) * 2.7),
      0.9,
      0.96,
      1,
    ],
  };

  return { left, right };
}

export function generateTwoHands(t: number): { left: Pt[]; right: Pt[] } {
  const opt = handOptions(t);
  return { left: generateHand(t, opt.left), right: generateHand(t, opt.right) };
}

/** 三维手模用：某时刻单手在掌系里的 21 个关节（未投影） */
export function generateHandLocalPose(
  t: number,
  side: "left" | "right",
  curlScale = 1,
): V3[] {
  const opt = handOptions(t);
  return handLocalPose(side === "left" ? opt.left : opt.right, curlScale);
}

const smooth = (x: number) => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};

/** 动作时间窗：a 处淡入、b 之后淡出，过渡长 ramp 秒；窗口内为 1 */
function phase(t: number, a: number, b: number, ramp = 0.7): number {
  return smooth((t - a) / ramp) * (1 - smooth((t - b) / ramp));
}

interface HandMotion {
  /** 绕视轴（Z）的手腕翻转 */
  roll: number;
  /** 左右摆腕 */
  yaw: number;
  /** 前后压腕 */
  pitch: number;
}

/**
 * 手腕在展示姿态之上的动作（弧度），时间窗与底部标注的动作轴对齐：
 * 左手拧杯 / 倒水，右手拧龙头 / 画圈刷洗。三个手模共用同一份数据，
 * 轨迹窗的小手和左右手大窗在同一时刻的手势、朝向完全一致。
 */
export function handMotion(t: number, side: "left" | "right"): HandMotion {
  // 待命时也有极轻的呼吸，避免整个手像冻住
  const breathe = 0.02 * Math.sin(t * 0.9);

  if (side === "left") {
    const rinse = phase(t, 9.5, 14, 0.7);
    const adjust = phase(t, 23.1, 28, 0.7);
    const pour = phase(t, 38.2, 44, 0.9);
    const release = phase(t, 50, 55.5, 0.8);
    return {
      roll:
        breathe +
        rinse * 0.34 * Math.sin((t - 9.5) * 3.2) +
        adjust * 0.16 * Math.sin((t - 23.1) * 2) +
        pour * 0.44 +
        release * 0.1,
      pitch:
        0.02 * Math.sin(t * 0.7 + 1) +
        adjust * 0.07 * Math.cos((t - 23.1) * 2) +
        pour * 0.2,
      yaw:
        0.025 * Math.sin(t * 0.5 + 0.4) +
        rinse * 0.09 * Math.sin((t - 9.5) * 1.6) -
        pour * 0.08,
    };
  }

  const faucet = phase(t, 4.2, 9.5, 0.7);
  const scrub = phase(t, 14, 28, 0.9);
  const putDown = phase(t, 28, 33.5, 0.7);
  const rinse = phase(t, 44, 50, 0.8);
  return {
    roll:
      breathe +
      faucet * 0.26 * Math.sin((t - 4.2) * 3.4) +
      scrub * 0.22 * Math.sin((t - 14) * 2.7) +
      rinse * 0.24 * Math.sin((t - 44) * 3.2),
    pitch:
      0.02 * Math.sin(t * 0.6 + 2) +
      faucet * 0.1 * Math.sin((t - 4.2) * 2.2) +
      scrub * 0.15 * Math.cos((t - 14) * 2.7) +
      putDown * 0.09 -
      rinse * 0.07,
    yaw:
      0.02 * Math.sin(t * 0.45 + 1) +
      faucet * 0.09 * Math.sin((t - 4.2) * 1.8) +
      rinse * 0.07 * Math.sin((t - 44) * 2.4),
  };
}
