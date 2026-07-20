// Seam 2 — projeção dos ToolCall spans: barras com duração, estado em voo e
// órfão (open sem close).
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectTimeline } from "../src/timeline.ts";
import { toolOpen, toolClose } from "../src/spans.ts";

test("tool fechado vira uma barra com duração e bytesOut", () => {
	const tl = projectTimeline([
		toolOpen({ toolCallId: "c1", toolName: "bash", args: { command: "ls" }, ts: 1000 }),
		toolClose({ toolCallId: "c1", toolName: "bash", bytesOut: 200, isError: false, ts: 1500 }),
	]);
	assert.equal(tl.tools.length, 1);
	const t = tl.tools[0];
	assert.equal(t.toolName, "bash");
	assert.equal(t.status, "closed");
	assert.equal(t.durationMs, 500);
	assert.equal(t.bytesOut, 200);
	assert.equal(t.args.command, "ls");
});

test("tool em voo (open sem close) fica aberto e sem duração", () => {
	const tl = projectTimeline([
		toolOpen({ toolCallId: "c2", toolName: "bash", args: { command: "sleep 40" }, ts: 1000 }),
	]);
	const t = tl.tools[0];
	assert.equal(t.status, "open");
	assert.equal(t.durationMs, undefined);
	assert.equal(t.bytesOut, undefined);
	// O comando fica visível já em voo.
	assert.equal(t.args.command, "sleep 40");
});

test("tool em voo é 'o que executa agora' no resumo", () => {
	const tl = projectTimeline([
		toolOpen({ toolCallId: "c2", toolName: "bash", args: {}, ts: 1000 }),
	]);
	assert.equal(tl.summary.runningSpan, "tool");
	assert.equal(tl.summary.runningSpanId, "tool-c2");
});

test("tool órfão (sessão morreu no meio) permanece aberto = incompleto", () => {
	// Só o open foi gravado; nunca veio o close.
	const tl = projectTimeline([
		toolOpen({ toolCallId: "c3", toolName: "read", args: { path: "/big" }, ts: 1000 }),
	]);
	assert.equal(tl.tools[0].status, "open");
	assert.equal(tl.spans[0].status, "open");
});

test("tool com erro marca isError", () => {
	const tl = projectTimeline([
		toolOpen({ toolCallId: "c4", toolName: "bash", args: { command: "false" }, ts: 1 }),
		toolClose({ toolCallId: "c4", toolName: "bash", bytesOut: 0, isError: true, ts: 2 }),
	]);
	assert.equal(tl.tools[0].isError, true);
});

test("ordem de abertura preservada entre múltiplos tools", () => {
	const tl = projectTimeline([
		toolOpen({ toolCallId: "a", toolName: "read", args: {}, ts: 1 }),
		toolOpen({ toolCallId: "b", toolName: "bash", args: {}, ts: 2 }),
		toolClose({ toolCallId: "a", toolName: "read", bytesOut: 10, isError: false, ts: 3 }),
	]);
	assert.deepEqual(tl.tools.map((t) => t.toolName), ["read", "bash"]);
});

test("sem tools, a lista é vazia", () => {
	assert.deepEqual(projectTimeline([]).tools, []);
});
