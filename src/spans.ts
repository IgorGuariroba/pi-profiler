// Seam 1 — mapeamento evento→span (núcleo do coletor), função pura.
//
// Cada span é escrito como dois MARCOS (open/close) correlacionados por `spanId`
// (ver CONTEXT.md e ADR 0003). Estas funções recebem entradas planas — extraídas
// de ctx/event pelo coletor — e devolvem o marco pronto. Não tocam disco nem o Pi.
//
// Ticket 1: apenas o Session span. Os demais tipos (turn/tool/context) entram nos
// tickets seguintes; o esquema já reserva o campo `span` para eles.

export type SpanKind = "session" | "turn" | "tool" | "context";
export type MarkKind = "open" | "close";

/** Versão do formato de fio da trilha. Bump quando o esquema mudar de forma incompatível. */
export const TRAIL_VERSION = 1 as const;

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

// Há um único Session span por trilha, então o spanId é o próprio sessionId.
export function sessionSpanId(sessionId: string): string {
	return sessionId;
}

export function sessionOpen(input: SessionOpenInput): Mark {
	const mark: Mark = {
		v: TRAIL_VERSION,
		kind: "open",
		span: "session",
		spanId: sessionSpanId(input.sessionId),
		ts: input.ts,
		sessionId: input.sessionId,
		cwd: input.cwd,
		reason: input.reason,
	};
	// Só grava `model` quando conhecido — evita poluir o marco com null.
	if (input.model !== undefined) mark.model = input.model;
	return mark;
}

export function sessionClose(input: SessionCloseInput): Mark {
	return {
		v: TRAIL_VERSION,
		kind: "close",
		span: "session",
		spanId: sessionSpanId(input.sessionId),
		ts: input.ts,
		reason: input.reason,
	};
}

// ── Turn span ────────────────────────────────────────────────────────────
// Um ciclo do LLM: open em turn_start, close em turn_end. O `Usage` vem PRONTO
// de message.usage (ADR/spec: o coletor não recomputa tokens, só copia). Os campos
// de provider (status/latência/retry) são embutidos no close, não um span próprio
// (ADR 0003 — request de provider vive dentro do Turn).

// Cópia verbatim do Usage do Pi. Mantida como shape aberto para não acoplar a
// trilha à versão exata do tipo do pi-ai; o coletor passa o objeto como veio.
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

// Resumo do(s) request(s) de provider observado(s) no turno. `retries` = número de
// tentativas ALÉM da primeira (requests - 1). `status` é o da última resposta.
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

export function turnSpanId(seq: number): string {
	return `turn-${seq}`;
}

export function turnOpen(input: TurnOpenInput): Mark {
	return {
		v: TRAIL_VERSION,
		kind: "open",
		span: "turn",
		spanId: turnSpanId(input.seq),
		ts: input.ts,
		turnIndex: input.turnIndex,
	};
}

export function turnClose(input: TurnCloseInput): Mark {
	const mark: Mark = {
		v: TRAIL_VERSION,
		kind: "close",
		span: "turn",
		spanId: turnSpanId(input.seq),
		ts: input.ts,
		isError: input.isError,
	};
	if (input.model !== undefined) mark.model = input.model;
	if (input.usage !== undefined) mark.usage = input.usage;
	if (input.stopReason !== undefined) mark.stopReason = input.stopReason;
	if (input.provider !== undefined) mark.provider = input.provider;
	return mark;
}
