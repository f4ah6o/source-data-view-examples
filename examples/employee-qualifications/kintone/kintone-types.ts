export type KintoneApiMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface KintoneApi {
  (url: string, method: KintoneApiMethod, params: Record<string, unknown>): Promise<unknown>;
}

export interface KintoneIndexEvent {
  readonly type: "app.record.index.show" | "mobile.app.record.index.show";
  readonly appId: number;
  readonly viewId: number;
  readonly [key: string]: unknown;
}

export interface KintoneGlobal {
  readonly api: KintoneApi;
  readonly events: {
    on(
      type: readonly ["app.record.index.show", "mobile.app.record.index.show"],
      handler: (event: KintoneIndexEvent) => KintoneIndexEvent | Promise<KintoneIndexEvent>,
    ): void;
  };
}

declare global {
  const kintone: KintoneGlobal;
}
