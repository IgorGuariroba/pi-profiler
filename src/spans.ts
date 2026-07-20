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
