// Seam 2 — projeção span→visões (núcleo da TUI), função pura.
//
// Recebe um fluxo de marcos (open/close) e produz o modelo da timeline: pareia os
// marcos por `spanId` e classifica o estado de cada span. Ticket 1 cobre só o
// Session span e o pareamento genérico (incluindo órfãos); os demais spans e as
// visões de agregação entram nos tickets seguintes.

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

// Recorte de um turno para a timeline e as agregações. Derivado dos Turn spans.
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
}

// Recorte de uma execução de ferramenta para a timeline. Derivado dos ToolCall
// spans. Um span aberto (sem close) é trabalho em voo; se a sessão morreu no meio,
// permanece aberto e é exibido como órfão/incompleto.
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
}

// Pulso acumulado da sessão, para o cabeçalho-resumo da TUI.
export interface SessionSummary {
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
	/** Pulso acumulado da sessão. */
	summary: SessionSummary;
}

const PROTOCOL_FIELDS = new Set(["v", "kind", "span", "spanId", "ts"]);

function payload(mark: Mark): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, val] of Object.entries(mark)) {
		if (!PROTOCOL_FIELDS.has(k)) out[k] = val;
	}
	return out;
}

// Um `open` sem `close` correspondente é um span órfão (a sessão morreu no meio):
// permanece com status "open" — a TUI o exibe como incompleto/abortado. Um `close`
// sem `open` (não deveria acontecer) é ignorado por não ter início a que anexar.
export function projectTimeline(marks: Mark[]): Timeline {
	const byId = new Map<string, TimelineSpan>();
	const order: string[] = [];

	for (const mark of marks) {
		if (mark.kind === "open") {
			const span: TimelineSpan = {
				spanId: mark.spanId,
				span: mark.span,
				status: "open",
				startedAt: mark.ts,
				openFields: payload(mark),
			};
			if (!byId.has(mark.spanId)) order.push(mark.spanId);
			byId.set(mark.spanId, span);
		} else {
			const span = byId.get(mark.spanId);
			if (!span) continue; // close órfão: nada a anexar
			span.status = "closed";
			span.endedAt = mark.ts;
			span.durationMs = mark.ts - span.startedAt;
			span.closeFields = payload(mark);
		}
	}

	const spans = order.map((id) => byId.get(id)!);
	const turns = spans.filter((s) => s.span === "turn").map(toTurnRow);
	const tools = spans.filter((s) => s.span === "tool").map(toToolRow);
	const timeline: Timeline = { spans, turns, tools, summary: summarize(spans, turns) };

	const sessionSpan = spans.find((s) => s.span === "session");
	if (sessionSpan) {
		timeline.session = toSessionFrame(sessionSpan);
	}

	return timeline;
}

function toTurnRow(span: TimelineSpan): TurnRow {
	const close = span.closeFields ?? {};
	const row: TurnRow = {
		spanId: span.spanId,
		turnIndex: Number(span.openFields.turnIndex ?? 0),
		status: span.status,
		startedAt: span.startedAt,
		isError: close.isError === true,
	};
	if (span.status === "closed") {
		row.endedAt = span.endedAt;
		row.durationMs = span.durationMs;
	}
	if (typeof close.model === "string") row.model = close.model;
	if (isTurnUsage(close.usage)) row.usage = close.usage;
	if (typeof close.stopReason === "string") row.stopReason = close.stopReason;
	if (isProviderStat(close.provider)) row.provider = close.provider;
	return row;
}

// Tokens vivos: totalTokens do último turno FECHADO que reportou usage — o valor
// mais recente de ocupação de contexto que temos sem o ContextSnapshot (ticket 4).
// Custo acumulado: soma dos custos totais dos turnos fechados. "Executando agora":
// o span aberto mais recente (o próprio Turn em voo, ou um span de outro tipo).
function summarize(spans: TimelineSpan[], turns: TurnRow[]): SessionSummary {
	let totalCost = 0;
	let liveTokens = 0;
	let errorTurns = 0;
	let closedTurns = 0;
	for (const turn of turns) {
		if (turn.status !== "closed") continue;
		closedTurns += 1;
		if (turn.isError) errorTurns += 1;
		if (turn.usage) {
			totalCost += turn.usage.cost.total;
			liveTokens = turn.usage.totalTokens;
		}
	}

	const summary: SessionSummary = { liveTokens, totalCost, errorTurns, closedTurns };
	// O span em voo mais recente que NÃO é a própria sessão (a sessão fica aberta a
	// vida toda; ela não é "o que executa agora").
	for (let i = spans.length - 1; i >= 0; i -= 1) {
		const s = spans[i];
		if (s.status === "open" && s.span !== "session") {
			summary.runningSpanId = s.spanId;
			summary.runningSpan = s.span;
			break;
		}
	}
	return summary;
}

function toToolRow(span: TimelineSpan): ToolRow {
	const close = span.closeFields ?? {};
	const row: ToolRow = {
		spanId: span.spanId,
		toolName: String(span.openFields.toolName ?? "?"),
		status: span.status,
		startedAt: span.startedAt,
		args: isRecord(span.openFields.args) ? span.openFields.args : {},
		isError: close.isError === true,
	};
	if (span.status === "closed") {
		row.endedAt = span.endedAt;
		row.durationMs = span.durationMs;
		if (typeof close.bytesOut === "number") row.bytesOut = close.bytesOut;
	}
	return row;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isTurnUsage(value: unknown): value is TurnUsage {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as TurnUsage).totalTokens === "number" &&
		typeof (value as TurnUsage).cost === "object"
	);
}

function isProviderStat(value: unknown): value is ProviderStat {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as ProviderStat).status === "number"
	);
}

function toSessionFrame(span: TimelineSpan): SessionFrame {
	const frame: SessionFrame = {
		sessionId: String(span.openFields.sessionId ?? span.spanId),
		incomplete: span.status !== "closed",
		startedAt: span.startedAt,
	};
	if (typeof span.openFields.cwd === "string") frame.cwd = span.openFields.cwd;
	if (typeof span.openFields.model === "string") frame.model = span.openFields.model;
	if (typeof span.openFields.reason === "string") frame.startReason = span.openFields.reason;
	if (span.status === "closed") {
		frame.endedAt = span.endedAt;
		frame.durationMs = span.durationMs;
		if (typeof span.closeFields?.reason === "string") {
			frame.shutdownReason = span.closeFields.reason;
		}
	}
	return frame;
}
