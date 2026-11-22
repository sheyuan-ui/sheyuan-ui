import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { WS_TOPICS } from "../contracts/api.ts";

export type WsTopic = (typeof WS_TOPICS)[keyof typeof WS_TOPICS];

const ALL_TOPICS: WsTopic[] = Object.values(WS_TOPICS);
const TOPIC_SET = new Set<string>(ALL_TOPICS);

function isTopic(value: string): value is WsTopic {
  return TOPIC_SET.has(value);
}

interface ClientState {
  topics: Set<WsTopic>;
}

export interface HubOptions {
  token?: string;
  path?: string;
}

/**
 * 管理服务 → 浏览器的推送通道。
 * 连接时可用 ?topics=device.status,upload.progress 指定主题，缺省订阅全部。
 * 消息格式：{ topic, data, sent_at }
 */
export class Hub {
  private readonly wss: WebSocketServer;
  private readonly states = new WeakMap<WebSocket, ClientState>();
  private readonly token: string | undefined;

  constructor(server: HttpServer, options: HubOptions = {}) {
    this.token = options.token;
    this.wss = new WebSocketServer({ server, path: options.path ?? "/ws" });
    this.wss.on("connection", (socket, request) => {
      this.handleConnection(socket, request.url ?? "/ws");
    });
  }

  publish(topic: WsTopic, data: unknown): void {
    const message = JSON.stringify({ topic, data, sent_at: new Date().toISOString() });
    for (const client of this.wss.clients) {
      const state = this.states.get(client);
      if (!state || !state.topics.has(topic)) continue;
      if (client.readyState !== WebSocket.OPEN) continue;
      client.send(message);
    }
  }

  close(): void {
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
  }

  private handleConnection(socket: WebSocket, requestUrl: string): void {
    const url = new URL(requestUrl, "http://localhost");

    if (this.token !== undefined && url.searchParams.get("token") !== this.token) {
      socket.close(1008, "unauthorized");
      return;
    }

    const requested = (url.searchParams.get("topics") ?? "")
      .split(",")
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0);

    const invalid = requested.filter((topic) => !isTopic(topic));
    if (invalid.length > 0) {
      socket.close(1008, `unknown topics: ${invalid.join(",")}`);
      return;
    }

    const state: ClientState = {
      topics: new Set(requested.length > 0 ? (requested as WsTopic[]) : ALL_TOPICS),
    };
    this.states.set(socket, state);

    socket.send(JSON.stringify({ type: "ready", topics: [...state.topics] }));
    socket.on("message", (raw) => this.handleMessage(socket, state, raw.toString()));
    socket.on("error", () => socket.terminate());
  }

  private handleMessage(socket: WebSocket, state: ClientState, raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw) as unknown;
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "消息必须为 JSON" }));
      return;
    }

    if (typeof message !== "object" || message === null) {
      socket.send(JSON.stringify({ type: "error", message: "消息必须为对象" }));
      return;
    }

    const { type, topics } = message as { type?: unknown; topics?: unknown };
    if (type !== "subscribe" && type !== "unsubscribe") {
      socket.send(JSON.stringify({ type: "error", message: "type 必须为 subscribe/unsubscribe" }));
      return;
    }
    if (!Array.isArray(topics) || topics.some((topic) => typeof topic !== "string")) {
      socket.send(JSON.stringify({ type: "error", message: "topics 必须为字符串数组" }));
      return;
    }

    const invalid = (topics as string[]).filter((topic) => !isTopic(topic));
    if (invalid.length > 0) {
      socket.send(JSON.stringify({ type: "error", message: `未知主题：${invalid.join(",")}` }));
      return;
    }

    for (const topic of topics as WsTopic[]) {
      if (type === "subscribe") state.topics.add(topic);
      else state.topics.delete(topic);
    }
    socket.send(JSON.stringify({ type: "subscribed", topics: [...state.topics] }));
  }
}