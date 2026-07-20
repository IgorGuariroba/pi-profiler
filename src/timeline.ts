// Seam 2 — projeção span→visões (núcleo da TUI), função pura.
//
// Recebe um fluxo de marcos (open/close) e produz o modelo da timeline: pareia os
// marcos por `spanId` e classifica o estado de cada span. Ticket 1 cobre só o
// Session span e o pareamento genérico (incluindo órfãos); os demais spans e as
// visões de agregação entram nos tickets seguintes.

import type { Mark, SpanKind } from "./spans.ts";

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

export interface Timeline {
	/** Todos os spans na ordem em que abriram. */
	spans: TimelineSpan[];
	/** Recorte do Session span, se presente. */
	session?: SessionFrame;
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
	const timeline: Timeline = { spans };

	const sessionSpan = spans.find((s) => s.span === "session");
	if (sessionSpan) {
		timeline.session = toSessionFrame(sessionSpan);
	}

	return timeline;
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
