// Seam 2 — projeção dos Turn spans: turnos como barras, cabeçalho-resumo (tokens
// vivos, custo, o que executa agora), visão de rede e taxa de erro.
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectTimeline } from "../src/timeline.ts";
import { turnOpen, turnClose, sessionOpen } from "../src/spans.ts";

function usage(totalTokens, costTotal) {
	return {
		input: 100,
		output: 50,
		cacheRead: 900,
		cacheWrite: 10,
		totalTokens,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: costTotal },
	};
}

test("turno fechado vira uma barra com duração, modelo e tokens", () => {
	const tl = projectTimeline([
		turnOpen({ seq: 1, turnIndex: 0, ts: 1000 }),
		turnClose({ seq: 1, ts: 3000, model: "anthropic/x", usage: usage(1060, 0.004), stopReason: "stop", isError: false }),
	]);
	assert.equal(tl.turns.length, 1);
	const t = tl.turns[0];
	assert.equal(t.status, "closed");
	assert.equal(t.durationMs, 2000);
	assert.equal(t.model, "anthropic/x");
	assert.equal(t.usage.totalTokens, 1060);
});

test("cabeçalho-resumo acumula custo e usa tokens do último turno fechado", () => {
	const tl = projectTimeline([
		turnOpen({ seq: 1, turnIndex: 0, ts: 1 }),
		turnClose({ seq: 1, ts: 2, usage: usage(500, 0.01), isError: false }),
		turnOpen({ seq: 2, turnIndex: 1, ts: 3 }),
		turnClose({ seq: 2, ts: 4, usage: usage(1200, 0.02), isError: false }),
	]);
	assert.equal(tl.summary.totalCost, 0.03);
	assert.equal(tl.summary.liveTokens, 1200); // do último turno fechado
	assert.equal(tl.summary.closedTurns, 2);
});

test("um turno ainda aberto é 'o que executa agora'", () => {
	const tl = projectTimeline([
		sessionOpen({ sessionId: "s", cwd: "/x", reason: "startup", ts: 1 }),
		turnOpen({ seq: 1, turnIndex: 0, ts: 2 }),
	]);
	assert.equal(tl.summary.runningSpan, "turn");
	assert.equal(tl.summary.runningSpanId, "turn-1");
});

test("a sessão aberta não conta como 'executando agora'", () => {
	const tl = projectTimeline([
		sessionOpen({ sessionId: "s", cwd: "/x", reason: "startup", ts: 1 }),
		turnOpen({ seq: 1, turnIndex: 0, ts: 2 }),
		turnClose({ seq: 1, ts: 3, isError: false }),
	]);
	assert.equal(tl.summary.runningSpanId, undefined);
	assert.equal(tl.summary.runningSpan, undefined);
});

test("taxa de erro conta turnos fechados em erro", () => {
	const tl = projectTimeline([
		turnOpen({ seq: 1, turnIndex: 0, ts: 1 }),
		turnClose({ seq: 1, ts: 2, isError: false }),
		turnOpen({ seq: 2, turnIndex: 1, ts: 3 }),
		turnClose({ seq: 2, ts: 4, isError: true, stopReason: "error" }),
	]);
	assert.equal(tl.summary.errorTurns, 1);
	assert.equal(tl.summary.closedTurns, 2);
});

test("visão de rede: status e retries do provider ficam no turno", () => {
	const tl = projectTimeline([
		turnOpen({ seq: 1, turnIndex: 0, ts: 1 }),
		turnClose({ seq: 1, ts: 2, isError: false, provider: { status: 429, retries: 2, latencyMs: 800 } }),
	]);
	assert.equal(tl.turns[0].provider.status, 429);
	assert.equal(tl.turns[0].provider.retries, 2);
	assert.equal(tl.turns[0].provider.latencyMs, 800);
});

test("turno aberto (em voo) aparece sem duração e sem usage", () => {
	const tl = projectTimeline([turnOpen({ seq: 1, turnIndex: 0, ts: 1 })]);
	assert.equal(tl.turns[0].status, "open");
	assert.equal(tl.turns[0].durationMs, undefined);
	assert.equal(tl.turns[0].usage, undefined);
});

test("sem turnos, o resumo é zerado", () => {
	const tl = projectTimeline([]);
	assert.deepEqual(tl.turns, []);
	assert.equal(tl.summary.totalCost, 0);
	assert.equal(tl.summary.liveTokens, 0);
	assert.equal(tl.summary.closedTurns, 0);
});
