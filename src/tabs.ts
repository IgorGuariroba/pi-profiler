import type { Timeline } from "./timeline.ts";
import { renderTimeline, type RenderTheme } from "./render.ts";

export type ProfilerTab = "timeline" | "files" | "commands" | "network" | "cost";
export const PROFILER_TABS: ProfilerTab[] = ["timeline", "files", "commands", "network", "cost"];

export function nextTab(current: ProfilerTab, delta: number): ProfilerTab {
	const index = PROFILER_TABS.indexOf(current);
	return PROFILER_TABS[(index + delta + PROFILER_TABS.length) % PROFILER_TABS.length];
}

export function renderTab(timeline: Timeline, tab: ProfilerTab, theme: RenderTheme): string[] {
	if (tab === "timeline") return renderTimeline(timeline, theme);
	const title = `Pi Profiler — ${tab}`;
	const lines = [theme.bold(theme.fg("accent", title)), theme.fg("dim", "  abas: 1 timeline · 2 arquivos · 3 comandos · 4 rede · 5 custo")];
	if (tab === "files") {
		lines.push("");
		for (const f of timeline.files) lines.push(`  ${f.path}  ${f.calls} chamadas  read ${f.reads}  write ${f.writes}  edit ${f.edits}${f.wastedReads ? `  desperdício ${f.wastedReads}` : ""}`);
	}
	if (tab === "commands") {
		lines.push("");
		for (const c of timeline.commands) lines.push(`  ${c.command}  ${c.calls}x  média ${c.avgDurationMs.toFixed(0)}ms  erros ${c.errors}${c.outputTruncated ? `  truncada ${c.outputTruncated}x` : ""}`);
	}
	if (tab === "network") {
		lines.push("");
		for (const t of timeline.turns) if (t.provider) lines.push(`  turno ${t.turnIndex}  HTTP ${t.provider.status}  ${t.provider.latencyMs ?? 0}ms  retries ${t.provider.retries}${t.provider.status === 429 ? "  ⚠ rate-limit" : ""}`);
	}
	if (tab === "cost") {
		lines.push("", `  total ${timeline.summary.totalCost.toFixed(4)} USD`);
		for (const t of timeline.turns) if (t.usage) lines.push(`  turno ${t.turnIndex}  ${t.usage.cost.total.toFixed(4)} USD  ${t.usage.totalTokens} tokens`);
	}
	if (lines.length === 2) lines.push(theme.fg("dim", "  nenhum dado ainda"));
	return lines;
}
