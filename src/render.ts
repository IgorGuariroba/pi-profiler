// Renderização da timeline em texto (lado da TUI). Separado do loop de terminal
// para poder ser testado como função pura: recebe o modelo da timeline e um tema
// mínimo, devolve as linhas a exibir.

import type { Timeline, TimelineSpan } from "./timeline.ts";

// Subconjunto do theme do pi-tui de que precisamos. O binário passa o theme real;
// os testes passam um tema identidade.
export interface RenderTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

export const identityTheme: RenderTheme = {
	fg: (_c, t) => t,
	bold: (t) => t,
};

function fmtDuration(ms: number | undefined): string {
	if (ms === undefined) return "…";
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function spanLine(span: TimelineSpan, theme: RenderTheme): string {
	const marker = span.status === "closed" ? theme.fg("success", "●") : theme.fg("warning", "◌");
	const dur = span.status === "closed" ? fmtDuration(span.durationMs) : theme.fg("warning", "em voo");
	return `  ${marker} ${theme.fg("muted", span.span)} ${theme.fg("dim", span.spanId)} ${dur}`;
}

// Produz as linhas da timeline. Cabeçalho com o frame de sessão (quando houver) e,
// abaixo, a lista de spans em ordem de abertura.
export function renderTimeline(timeline: Timeline, theme: RenderTheme = identityTheme): string[] {
	const lines: string[] = [];
	lines.push(theme.bold(theme.fg("accent", "Pi Profiler — timeline")));

	const s = timeline.session;
	if (s) {
		const state = s.incomplete
			? theme.fg("warning", "incompleta/abortada")
			: theme.fg("success", "encerrada");
		lines.push(
			`${theme.fg("muted", "sessão")} ${theme.fg("dim", s.sessionId)} ${state}`,
		);
		const meta: string[] = [];
		if (s.cwd) meta.push(`cwd ${s.cwd}`);
		if (s.model) meta.push(`modelo ${s.model}`);
		if (s.startReason) meta.push(`início ${s.startReason}`);
		if (s.shutdownReason) meta.push(`fim ${s.shutdownReason}`);
		if (!s.incomplete) meta.push(`duração ${fmtDuration(s.durationMs)}`);
		if (meta.length > 0) lines.push(theme.fg("dim", "  " + meta.join("  ·  ")));
	} else {
		lines.push(theme.fg("dim", "aguardando spans…"));
	}

	if (timeline.spans.length > 0) {
		lines.push("");
		for (const span of timeline.spans) lines.push(spanLine(span, theme));
	}

	return lines;
}
