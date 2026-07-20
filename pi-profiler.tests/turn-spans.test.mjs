// Seam 1 — evento→span para o Turn. Contabilidade: usage copiado verbatim,
// provider embutido, retries, stopReason/erro. Função pura.
import { test } from "node:test";
import assert from "node:assert/strict";
import { turnOpen, turnClose, turnSpanId } from "../src/spans.ts";

const USAGE = {
	input: 100,
	output: 50,
	cacheRead: 900,
	cacheWrite: 10,
	totalTokens: 1060,
	cost: { input: 0.001, output: 0.002, cacheRead: 0.0009, cacheWrite: 0.0001, total: 0.004 },
};

test("turnSpanId é derivado do seq monótono", () => {
	assert.equal(turnSpanId(3), "turn-3");
});

test("turnOpen carrega turnIndex e o spanId do seq", () => {
	const m = turnOpen({ seq: 1, turnIndex: 0, ts: 1000 });
	assert.equal(m.kind, "open");
	assert.equal(m.span, "turn");
	assert.equal(m.spanId, "turn-1");
	assert.equal(m.turnIndex, 0);
	assert.equal(m.ts, 1000);
});

test("turnClose copia usage verbatim, modelo, stopReason e provider", () => {
	const m = turnClose({
		seq: 1,
		ts: 3000,
		model: "anthropic/claude-sonnet-4-5",
		usage: USAGE,
		stopReason: "stop",
		isError: false,
		provider: { status: 200, retries: 0, latencyMs: 1200 },
	});
	assert.equal(m.kind, "close");
	assert.equal(m.spanId, "turn-1");
	assert.deepEqual(m.usage, USAGE);
	assert.equal(m.model, "anthropic/claude-sonnet-4-5");
	assert.equal(m.stopReason, "stop");
	assert.equal(m.isError, false);
	assert.deepEqual(m.provider, { status: 200, retries: 0, latencyMs: 1200 });
});

test("open e close do mesmo turno compartilham o spanId", () => {
	const open = turnOpen({ seq: 7, turnIndex: 2, ts: 1 });
	const close = turnClose({ seq: 7, ts: 9, isError: false });
	assert.equal(open.spanId, close.spanId);
});

test("turno com erro grava isError=true", () => {
	const m = turnClose({ seq: 2, ts: 5, isError: true, stopReason: "error" });
	assert.equal(m.isError, true);
	assert.equal(m.stopReason, "error");
});

test("turnClose sem usage/provider omite os campos", () => {
	const m = turnClose({ seq: 2, ts: 5, isError: false });
	assert.equal("usage" in m, false);
	assert.equal("provider" in m, false);
	assert.equal("model" in m, false);
});

test("provider com retries registra as tentativas além da primeira", () => {
	const m = turnClose({
		seq: 3,
		ts: 5,
		isError: false,
		provider: { status: 429, retries: 2 },
	});
	assert.equal(m.provider.status, 429);
	assert.equal(m.provider.retries, 2);
});
