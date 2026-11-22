import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export interface ActionAnnotation {
  id: string;
  start: number;
  end: number;
  text: string;
  /** 该动作由哪只手主导，供底部标注条分列展示 */
  hand: "left" | "right";
  /** 动作短标题，显示在标注卡首行 */
  title: string;
  /** 该动作涉及的物体 */
  objects: string;
}

/** 作业规范评分：运行中为「暂评」，结束为「本次评分」，数据不足时为「--」 */
export type ScoreStatus = "provisional" | "final" | "insufficient";

export interface SessionScore {
  value: number | null;
  status: ScoreStatus;
  rule_version: string;
  model_version: string;
  /** 有效可评估事件数（评分分母） */
  effective_event_count: number;
  coverage_pct: number | null;
}

export const DURATION = 60;

const COMMIT_INTERVAL_MS = 1000 / 30;

const INITIAL_ANNOTATIONS: ActionAnnotation[] = [
  { id: "a1", start: 0, end: 4.2, hand: "left", title: "持握、固定", objects: "黄色杯子", text: "左手持握黄色杯子，将其固定在水槽上方。" },
  { id: "a2", start: 4.2, end: 9.5, hand: "right", title: "开水龙头", objects: "水龙头", text: "右手伸向水龙头，缓慢拧开，水流注入杯中。" },
  { id: "a3", start: 9.5, end: 14.0, hand: "left", title: "转动、冲洗", objects: "黄色杯子", text: "左手转动杯子，让杯壁均匀被水流冲刷。" },
  { id: "a4", start: 14.0, end: 18.3, hand: "right", title: "取洗碗刷", objects: "洗碗刷", text: "右手拿起洗碗刷，伸入杯子内部开始刷洗。" },
  { id: "a5", start: 18.3, end: 23.1, hand: "right", title: "刷洗内壁", objects: "洗碗刷、黄色杯子", text: "右手反复旋转刷洗杯子内壁，覆盖底部与侧壁。" },
  { id: "a6", start: 23.1, end: 28.0, hand: "left", title: "微调角度", objects: "黄色杯子", text: "左手配合微调杯子角度，便于刷洗到杯口边缘。" },
  { id: "a7", start: 28.0, end: 33.5, hand: "right", title: "放置刷子", objects: "洗碗刷", text: "右手抽出洗碗刷，置于台面上。" },
  { id: "a8", start: 33.5, end: 38.2, hand: "left", title: "冲净泡沫", objects: "黄色杯子", text: "左手将杯子移到水槽中央，用清水冲净残留泡沫。" },
  { id: "a9", start: 38.2, end: 44.0, hand: "left", title: "倒掉积水", objects: "黄色杯子", text: "左手倾斜杯子倒掉积水，确认内部干净。" },
  { id: "a10", start: 44.0, end: 50.0, hand: "right", title: "冲洗外壁、关水", objects: "水龙头、黄色杯子", text: "右手拧开水龙头冲洗杯子外壁后关闭水源。" },
  { id: "a11", start: 50.0, end: 55.5, hand: "left", title: "放回杯子", objects: "黄色杯子", text: "左手将清洗完成的黄色杯子平稳放回台面。" },
  { id: "a12", start: 55.5, end: 60.0, hand: "right", title: "双手归位", objects: "无", text: "双手回到初始姿态，等待下一轮清洗指令。" },
];

/** 界面占位分数，口径见设计说明 §5.1 / §7.5：不是 AI 置信度 */
const INITIAL_SCORE: SessionScore = {
  value: 92.0,
  status: "provisional",
  rule_version: "r1",
  model_version: "m1.1",
  effective_event_count: 48,
  coverage_pct: 87,
};

export function formatAnnotationTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ds = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ds}`;
}

interface PlaybackValue {
  duration: number;
  currentTime: number;
  seek: Dispatch<SetStateAction<number>>;
  isPlaying: boolean;
  setPlaying: (playing: boolean) => void;
  annotations: ActionAnnotation[];
  score: SessionScore;
}

const PlaybackContext = createContext<PlaybackValue | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [currentTime, setCurrentTime] = useState(0);
  // 默认即时序播放，主视图关键点动画随时间流动
  const [isPlaying, setPlaying] = useState(true);
  // 界面没有播放控制条，时间线默认循环，不会停在末尾
  const annotations = INITIAL_ANNOTATIONS;

  // The clock reads and writes this ref, never state, so a seek during
  // playback takes effect on the next frame.
  const timeRef = useRef(currentTime);

  const seek = useCallback((value: SetStateAction<number>) => {
    setCurrentTime((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      const clamped = Math.min(Math.max(next, 0), DURATION);
      timeRef.current = clamped;
      return clamped;
    });
  }, []);

  // The single playback clock, owned by the provider so exactly one loop can
  // advance time. Frame deltas are real elapsed time, so a throttled tab
  // resumes at the correct position instead of drifting.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();
    let lastCommit = last;
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      let next = timeRef.current + dt;
      if (next >= DURATION) next = 0;
      timeRef.current = next;
      // Committing on every frame re-renders the whole panel tree faster than
      // React can finish, which trips its nested-update guard.
      if (now - lastCommit >= COMMIT_INTERVAL_MS) {
        lastCommit = now;
        setCurrentTime(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const value: PlaybackValue = {
    duration: DURATION,
    currentTime,
    seek,
    isPlaying,
    setPlaying,
    annotations,
    score: INITIAL_SCORE,
  };

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used within PlaybackProvider");
  return ctx;
}
