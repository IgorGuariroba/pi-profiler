export type SpanKind = "session" | "turn" | "tool" | "context";
export type MarkKind = "open" | "close";
/** Versão do formato de fio da trilha. Bump quando o esquema mudar de forma incompatível. */
export declare const TRAIL_VERSION: 1;
export interface Mark {
    v: typeof TRAIL_VERSION;
    kind: MarkKind;
    span: SpanKind;
    spanId: string;
    ts: number;
    [field: string]: unknown;
}
export interface SessionOpenInput {
    sessionId: string;
    cwd: string;
    /** Modelo inicial "provider/id", se conhecido no início da sessão. */
    model?: string;
    /** Por que a sessão começou (reason do evento session_start). */
    reason: string;
    ts: number;
}
export interface SessionCloseInput {
    sessionId: string;
    /** Motivo do shutdown (reason do evento session_shutdown). */
    reason: string;
    ts: number;
}
export declare function sessionSpanId(sessionId: string): string;
export declare function sessionOpen(input: SessionOpenInput): Mark;
export declare function sessionClose(input: SessionCloseInput): Mark;
export interface TurnUsage {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
    };
}
export interface ProviderStat {
    status: number;
    retries: number;
    latencyMs?: number;
}
export interface TurnOpenInput {
    /** Sequencial monótono da trilha (o coletor mantém), garante spanId único. */
    seq: number;
    /** turnIndex do evento do Pi (pode reiniciar por run); guardado como display. */
    turnIndex: number;
    ts: number;
}
export interface TurnCloseInput {
    seq: number;
    ts: number;
    /** Modelo "provider/id" do turno, do message.provider+model. */
    model?: string;
    /** Cópia verbatim de message.usage, quando presente. */
    usage?: TurnUsage;
    /** stopReason da mensagem do assistente. */
    stopReason?: string;
    /** true quando o turno terminou em erro (stopReason "error" ou isError). */
    isError: boolean;
    /** Resumo do provider, quando houve ao menos uma resposta observada. */
    provider?: ProviderStat;
}
export declare function turnSpanId(seq: number): string;
export declare function turnOpen(input: TurnOpenInput): Mark;
export declare function turnClose(input: TurnCloseInput): Mark;
export declare const ARG_STRING_MAX_BYTES = 2048;
export declare function truncateArgString(text: string, maxBytes?: number): {
    value: string;
    truncatedBytes?: number;
};
export declare function summarizeArgs(args: unknown): Record<string, unknown>;
export interface ToolOpenInput {
    toolCallId: string;
    toolName: string;
    args: unknown;
    ts: number;
}
export interface ToolCloseInput {
    toolCallId: string;
    toolName: string;
    /** Bytes de texto do resultado (saída enviada ao LLM). */
    bytesOut: number;
    isError: boolean;
    exitCode?: number;
    outputTruncated?: boolean;
    ts: number;
}
export declare function toolSpanId(toolCallId: string): string;
export declare function toolOpen(input: ToolOpenInput): Mark;
export interface ContextSnapshotInput {
    seq: number;
    turnIndex: number;
    tokens: number | null;
    contextWindow: number;
    /** Tokens antes da última compaction, quando houve uma. */
    compaction?: {
        tokensBefore: number;
        summary: string;
        firstKeptEntryId: string;
        reason?: string;
    };
    ts: number;
}
export declare function contextSpanId(seq: number): string;
export declare function contextOpen(input: ContextSnapshotInput): Mark;
export declare function contextClose(input: ContextSnapshotInput): Mark;
export declare function toolClose(input: ToolCloseInput): Mark;
