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

// ── ToolCall span ───────────────────────────────────────────────────────────
// Uma execução de ferramenta: open em tool_execution_start, close em
// tool_execution_end. read/write/edit/bash e customs são todos ToolCall (ADR 0003).
// O toolCallId do Pi é o spanId natural (único por chamada). Args gravados crus
// (ADR 0004), mas strings gigantes (conteúdo de write/edit) são truncadas SÓ por
// tamanho, preservando o tamanho original em `_truncatedBytes`.

// Limite de bytes por campo string dos args, para o conteúdo de um write/edit não
// inflar a trilha. Não mexe na semântica — só corta o texto e anota o corte.
export const ARG_STRING_MAX_BYTES = 2048;

function utf8Bytes(s: string): number {
	return Buffer.byteLength(s, "utf8");
}

// Trunca uma string por bytes UTF-8, devolvendo o prefixo e o total original
// quando houve corte. Usada para os campos de args e reexportada para teste.
export function truncateArgString(
	text: string,
	maxBytes = ARG_STRING_MAX_BYTES,
): { value: string; truncatedBytes?: number } {
	const total = utf8Bytes(text);
	if (total <= maxBytes) return { value: text };
	// Corte conservador por code units; o resultado fica <= maxBytes em bytes.
	let slice = text.slice(0, maxBytes);
	while (utf8Bytes(slice) > maxBytes) slice = slice.slice(0, -1);
	return { value: slice, truncatedBytes: total };
}

// Copia os args crus truncando cada campo string grande de primeiro nível. Não
// recorre em estruturas aninhadas (os args das ferramentas built-in são planos:
// path/command/content/oldText/newText). Anota os campos cortados em
// `_truncated: { campo: bytesOriginais }`.
export function summarizeArgs(args: unknown): Record<string, unknown> {
	if (typeof args !== "object" || args === null) return { value: args };
	const out: Record<string, unknown> = {};
	const truncated: Record<string, number> = {};
	for (const [key, val] of Object.entries(args as Record<string, unknown>)) {
		if (typeof val === "string") {
			const { value, truncatedBytes } = truncateArgString(val);
			out[key] = value;
			if (truncatedBytes !== undefined) truncated[key] = truncatedBytes;
		} else {
			out[key] = val;
		}
	}
	if (Object.keys(truncated).length > 0) out._truncated = truncated;
	return out;
}

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

export function toolSpanId(toolCallId: string): string {
	return `tool-${toolCallId}`;
}

export function toolOpen(input: ToolOpenInput): Mark {
	return {
		v: TRAIL_VERSION,
		kind: "open",
		span: "tool",
		spanId: toolSpanId(input.toolCallId),
		ts: input.ts,
		toolName: input.toolName,
		args: summarizeArgs(input.args),
	};
}

export interface ContextSnapshotInput {
	seq: number;
	turnIndex: number;
	tokens: number | null;
	contextWindow: number;
	/** Tokens antes da última compaction, quando houve uma. */
	compaction?: { tokensBefore: number; summary: string; firstKeptEntryId: string; reason?: string };
	ts: number;
}

export function contextSpanId(seq: number): string {
	return `context-${seq}`;
}

// Snapshot é instantâneo: open e close no mesmo marco lógico, mantendo o contrato
// de spans e permitindo a TUI correlacionar a curva com os turnos.
export function contextOpen(input: ContextSnapshotInput): Mark {
	const mark: Mark = {
		v: TRAIL_VERSION, kind: "open", span: "context", spanId: contextSpanId(input.seq),
		ts: input.ts, turnIndex: input.turnIndex, tokens: input.tokens, contextWindow: input.contextWindow,
	};
	if (input.compaction !== undefined) mark.compaction = input.compaction;
	return mark;
}

export function contextClose(input: ContextSnapshotInput): Mark {
	return { ...contextOpen(input), kind: "close" };
}

export function toolClose(input: ToolCloseInput): Mark {
	const mark: Mark = {
		v: TRAIL_VERSION,
		kind: "close",
		span: "tool",
		spanId: toolSpanId(input.toolCallId),
		ts: input.ts,
		toolName: input.toolName,
		bytesOut: input.bytesOut,
		isError: input.isError,
	};
	if (input.exitCode !== undefined) mark.exitCode = input.exitCode;
	if (input.outputTruncated !== undefined) mark.outputTruncated = input.outputTruncated;
	return mark;
}
