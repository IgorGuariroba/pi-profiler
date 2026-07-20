import type { Mark, SpanKind, TurnUsage, ProviderStat } from "./spans.ts";
export type SpanStatus = "open" | "closed";
export interface TimelineSpan {
    spanId: string;
    span: SpanKind;
    status: SpanStatus;
    /** ts do marco open. */
    startedAt: number;
    /** ts do marco close, quando fechado. */
    endedAt?: number;
    /** endedAt - startedAt, quando fechado. */
    durationMs?: number;
    /** Campos do marco open, fora os de protocolo. */
    openFields: Record<string, unknown>;
    /** Campos do marco close, fora os de protocolo, quando fechado. */
    closeFields?: Record<string, unknown>;
}
export interface SessionFrame {
    sessionId: string;
    cwd?: string;
    model?: string;
    startReason?: string;
    shutdownReason?: string;
    startedAt?: number;
    endedAt?: number;
    durationMs?: number;
    /** true enquanto o Session span não fechou (sessão viva ou abortada). */
    incomplete: boolean;
}
export interface TurnRow {
    spanId: string;
    turnIndex: number;
    status: SpanStatus;
    startedAt: number;
    endedAt?: number;
    durationMs?: number;
    model?: string;
    usage?: TurnUsage;
    stopReason?: string;
    isError: boolean;
    provider?: ProviderStat;
    cacheHitRatio?: number;
}
export interface ContextRow {
    spanId: string;
    turnIndex: number;
    startedAt: number;
    tokens: number | null;
    contextWindow: number;
    compaction?: {
        tokensBefore: number;
        summary: string;
        firstKeptEntryId: string;
        reason?: string;
    };
}
export interface FileAggregate {
    path: string;
    reads: number;
    writes: number;
    edits: number;
    calls: number;
    wastedReads: number;
}
export interface CommandAggregate {
    command: string;
    calls: number;
    errors: number;
    avgDurationMs: number;
    outputTruncated: number;
    exitCodes: Record<string, number>;
}
export interface ToolRow {
    spanId: string;
    toolName: string;
    status: SpanStatus;
    startedAt: number;
    endedAt?: number;
    durationMs?: number;
    /** Args crus resumidos (strings grandes truncadas). */
    args: Record<string, unknown>;
    /** Bytes de saída, quando fechado. */
    bytesOut?: number;
    isError: boolean;
    exitCode?: number;
    outputTruncated?: boolean;
    wastedRead?: boolean;
}
export interface SessionSummary {
    /** Curva de ocupação: snapshots por turno. */
    contextCurve?: ContextRow[];
    /** Tokens vivos = totalTokens do último turno fechado com usage (aproximação v1). */
    liveTokens: number;
    /** Custo acumulado = soma de usage.cost.total dos turnos fechados. */
    totalCost: number;
    /** spanId do span ainda aberto mais recente, ou undefined se nada em voo. */
    runningSpanId?: string;
    /** Tipo do span em voo (ex.: "turn"), para o cabeçalho dizer o que executa agora. */
    runningSpan?: SpanKind;
    /** Turnos fechados em erro / total de turnos fechados. */
    errorTurns: number;
    closedTurns: number;
}
export interface Timeline {
    /** Todos os spans na ordem em que abriram. */
    spans: TimelineSpan[];
    /** Recorte do Session span, se presente. */
    session?: SessionFrame;
    /** Turnos derivados dos Turn spans, em ordem de abertura. */
    turns: TurnRow[];
    /** Execuções de ferramenta derivadas dos ToolCall spans, em ordem de abertura. */
    tools: ToolRow[];
    /** Snapshots de contexto, em ordem de turno. */
    contexts: ContextRow[];
    files: FileAggregate[];
    commands: CommandAggregate[];
    /** Pulso acumulado da sessão. */
    summary: SessionSummary;
}
export declare function projectTimeline(marks: Mark[]): Timeline;
