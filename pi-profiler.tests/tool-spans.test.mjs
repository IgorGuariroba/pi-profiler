// Seam 1 — evento→span para o ToolCall. Args crus, truncagem só por tamanho,
// bytesOut e flag de erro. Função pura.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	toolOpen,
	toolClose,
	toolSpanId,
	summarizeArgs,
	truncateArgString,
	ARG_STRING_MAX_BYTES,
} from "../src/spans.ts";

test("toolSpanId deriva do toolCallId", () => {
	assert.equal(toolSpanId("call_42"), "tool-call_42");
});

test("toolOpen grava nome e args crus", () => {
	const m = toolOpen({ toolCallId: "c1", toolName: "bash", args: { command: "ls -la" }, ts: 1000 });
	assert.equal(m.kind, "open");
	assert.equal(m.span, "tool");
	assert.equal(m.spanId, "tool-c1");
	assert.equal(m.toolName, "bash");
	assert.equal(m.args.command, "ls -la");
	assert.equal(m.ts, 1000);
});

test("comando bash e path ficam completos (args crus, ADR 0004)", () => {
	const bash = toolOpen({ toolCallId: "c1", toolName: "bash", args: { command: 'psql -c "SELECT 1"' }, ts: 1 });
	assert.equal(bash.args.command, 'psql -c "SELECT 1"');
	const read = toolOpen({ toolCallId: "c2", toolName: "read", args: { path: "/etc/hosts", offset: 5 }, ts: 1 });
	assert.equal(read.args.path, "/etc/hosts");
	assert.equal(read.args.offset, 5);
});

test("toolClose grava bytesOut e isError", () => {
	const m = toolClose({ toolCallId: "c1", toolName: "bash", bytesOut: 340, isError: false, ts: 2000 });
	assert.equal(m.kind, "close");
	assert.equal(m.spanId, "tool-c1");
	assert.equal(m.bytesOut, 340);
	assert.equal(m.isError, false);
});

test("open e close do mesmo tool compartilham o spanId", () => {
	const open = toolOpen({ toolCallId: "c9", toolName: "read", args: {}, ts: 1 });
	const close = toolClose({ toolCallId: "c9", toolName: "read", bytesOut: 0, isError: false, ts: 9 });
	assert.equal(open.spanId, close.spanId);
});

test("ferramenta com erro grava isError=true", () => {
	const m = toolClose({ toolCallId: "c1", toolName: "bash", bytesOut: 0, isError: true, ts: 2 });
	assert.equal(m.isError, true);
});

// ── truncagem de args grandes (só por tamanho) ──────────────────────────
test("string dentro do limite não é truncada", () => {
	const r = truncateArgString("abc", 10);
	assert.equal(r.value, "abc");
	assert.equal(r.truncatedBytes, undefined);
});

test("string acima do limite é cortada e o total original é anotado", () => {
	const big = "x".repeat(5000);
	const r = truncateArgString(big, 2048);
	assert.equal(Buffer.byteLength(r.value, "utf8") <= 2048, true);
	assert.equal(r.truncatedBytes, 5000);
});

test("summarizeArgs trunca o content de um write e anota _truncated", () => {
	const content = "y".repeat(ARG_STRING_MAX_BYTES + 100);
	const args = summarizeArgs({ path: "/a.txt", content });
	assert.equal(args.path, "/a.txt");
	assert.equal(Buffer.byteLength(args.content, "utf8") <= ARG_STRING_MAX_BYTES, true);
	assert.equal(args._truncated.content, ARG_STRING_MAX_BYTES + 100);
});

test("summarizeArgs preserva campos não-string e args pequenos intactos", () => {
	const args = summarizeArgs({ command: "ls", timeout: 5000 });
	assert.equal(args.command, "ls");
	assert.equal(args.timeout, 5000);
	assert.equal("_truncated" in args, false);
});

test("summarizeArgs lida com args não-objeto", () => {
	assert.deepEqual(summarizeArgs("plain"), { value: "plain" });
	assert.deepEqual(summarizeArgs(null), { value: null });
});
