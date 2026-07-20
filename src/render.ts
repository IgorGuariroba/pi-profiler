// Renderização da timeline em texto (lado da TUI). Separado do loop de terminal
// para poder ser testado como função pura: recebe o modelo da timeline e um tema
// mínimo, devolve as linhas a exibir.

import type { Timeline, TimelineSpan, TurnRow, ToolRow, SessionSummary } from "./timeline.ts";

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

function fmtCost(usd: number): string {
	return `$${usd.toFixed(4)}`;
}

function fmtTokens(n: number): string {
	if (n < 1000) return String(n);
	return `${(n / 1000).toFixed(1)}k`;
}

function fmtBytes(n: number): string {
	if (n < 1024) return `${n}B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
	return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

// Descreve o alvo de uma chamada de ferramenta a partir dos args crus: o comando
// do bash, o path de read/write/edit, ou o primeiro campo string disponível.
function toolTarget(tool: ToolRow): string | undefined {
	const a = tool.args;
	if (typeof a.command === "string") return a.command;
	if (typeof a.path === "string") return a.path;
	if (typeof a.pattern === "string") return a.pattern;
	for (const val of Object.values(a)) {
		if (typeof val === "string") return val;
	}
	return undefined;
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

	lines.push(summaryLine(timeline.summary, theme));

	if (timeline.turns.length > 0) {
		lines.push("");
		for (const turn of timeline.turns) lines.push(turnLine(turn, theme));
	}

	if (timeline.contexts.length > 0) {
		lines.push("");
		lines.push(theme.fg("muted", "  contexto por turno"));
		for (const point of timeline.contexts) {
			const tokens = point.tokens === null ? "?" : fmtTokens(point.tokens);
			const percent = point.tokens === null || point.contextWindow === 0 ? "?" : `${((point.tokens / point.contextWindow) * 100).toFixed(1)}%`;
			const compact = point.compaction ? theme.fg("warning", `  ↘ compact ${fmtTokens(point.compaction.tokensBefore)}→${tokens}`) : "";
			lines.push(`  t${point.turnIndex}  ${tokens}/${fmtTokens(point.contextWindow)}  ${percent}${compact}`);
		}
	}

	if (timeline.tools.length > 0) {
		lines.push("");
		for (const tool of timeline.tools) lines.push(toolLine(tool, theme));
	}

	if (timeline.turns.length === 0 && timeline.tools.length === 0 && timeline.spans.length > 0) {
		lines.push("");
		for (const span of timeline.spans) lines.push(spanLine(span, theme));
	}

	return lines;
}

function toolLine(tool: ToolRow, theme: RenderTheme): string {
	const marker =
		tool.status === "closed"
			? theme.fg(tool.isError ? "error" : "success", "●")
			: theme.fg("warning", "◌");
	const dur = tool.status === "closed" ? fmtDuration(tool.durationMs) : theme.fg("warning", "em voo");
	const bits: string[] = [theme.fg("toolTitle", tool.toolName), dur];
	const target = toolTarget(tool);
	if (target) bits.push(theme.fg("dim", target));
	if (tool.bytesOut !== undefined) bits.push(theme.fg("muted", fmtBytes(tool.bytesOut)));
	if (tool.isError) bits.push(theme.fg("error", "erro"));
	return `  ${marker} ${bits.join("  ")}`;
}

function summaryLine(summary: SessionSummary, theme: RenderTheme): string {
	const parts: string[] = [];
	parts.push(`tokens vivos ${theme.fg("accent", fmtTokens(summary.liveTokens))}`);
	parts.push(`custo ${theme.fg("accent", fmtCost(summary.totalCost))}`);
	if (summary.closedTurns > 0) {
		const errStyle = summary.errorTurns > 0 ? "error" : "muted";
		parts.push(theme.fg(errStyle, `erros ${summary.errorTurns}/${summary.closedTurns}`));
	}
	if (summary.runningSpan) {
		parts.push(theme.fg("warning", `executando ${summary.runningSpan}`));
	}
	return theme.fg("muted", "  " + parts.join("  ·  "));
}

function turnLine(turn: TurnRow, theme: RenderTheme): string {
	const marker =
		turn.status === "closed"
			? theme.fg(turn.isError ? "error" : "success", "●")
			: theme.fg("warning", "◌");
	const dur = turn.status === "closed" ? fmtDuration(turn.durationMs) : theme.fg("warning", "em voo");
	const bits: string[] = [`turno ${turn.turnIndex}`, dur];
	if (turn.model) bits.push(theme.fg("dim", turn.model));
	if (turn.usage) {
		bits.push(theme.fg("muted", `${fmtTokens(turn.usage.totalTokens)} tok`));
		if (turn.cacheHitRatio !== undefined) bits.push(theme.fg("muted", `cache ${(turn.cacheHitRatio * 100).toFixed(0)}%`));
		bits.push(theme.fg("muted", fmtCost(turn.usage.cost.total)));
	}
	if (turn.provider) {
		const net =
			turn.provider.status === 429
				? theme.fg("error", "429 rate-limit")
				: theme.fg("dim", `HTTP ${turn.provider.status}`);
		bits.push(net);
		if (turn.provider.retries > 0) bits.push(theme.fg("warning", `${turn.provider.retries} retry`));
	}
	if (turn.stopReason && turn.stopReason !== "stop") {
		bits.push(theme.fg("dim", turn.stopReason));
	}
	return `  ${marker} ${bits.join("  ")}`;
}
