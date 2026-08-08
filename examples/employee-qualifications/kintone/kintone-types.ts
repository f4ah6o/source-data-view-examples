export type KintoneApiMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface KintoneApi {
  (url: string, method: KintoneApiMethod, params: Record<string, unknown>): Promise<unknown>;
}

export interface KintoneIndexEvent {
  readonly type: string;
  readonly appId: number;
  readonly viewId: number;
  readonly [key: string]: unknown;
}

export interface KintoneGlobal {
  readonly api: KintoneApi;
  readonly events: {
    on(
      type: "app.record.index.show",
      handler: (event: KintoneIndexEvent) => KintoneIndexEvent | Promise<KintoneIndexEvent>,
    ): void;
  };
  readonly app: {
    getHeaderSpaceElement(): HTMLElement | null;
  };
}

declare global {
  const kintone: KintoneGlobal;
}
