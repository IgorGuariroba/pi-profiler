// Renderização da timeline: função pura, tema identidade → linhas de texto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTimeline } from "../src/render.ts";
import { projectTimeline } from "../src/timeline.ts";
import { sessionOpen, sessionClose, turnOpen, turnClose } from "../src/spans.ts";

function joined(marks) {
	return renderTimeline(projectTimeline(marks)).join("\n");
}

test("timeline vazia mostra estado de espera", () => {
	const out = joined([]);
	assert.match(out, /Pi Profiler/);
	assert.match(out, /aguardando spans/);
});

test("sessão encerrada mostra metadados e duração", () => {
	const out = joined([
		sessionOpen({ sessionId: "s1", cwd: "/proj", model: "anthropic/x", reason: "startup", ts: 1000 }),
		sessionClose({ sessionId: "s1", reason: "quit", ts: 4000 }),
	]);
	assert.match(out, /s1/);
	assert.match(out, /encerrada/);
	assert.match(out, /\/proj/);
	assert.match(out, /anthropic\/x/);
	assert.match(out, /quit/);
	assert.match(out, /3\.0s/);
});

test("sessão órfã é marcada como incompleta/abortada e em voo", () => {
	const out = joined([
		sessionOpen({ sessionId: "s2", cwd: "/proj", reason: "startup", ts: 1000 }),
	]);
	assert.match(out, /incompleta\/abortada/);
	assert.match(out, /em voo/);
});

function usage(totalTokens, costTotal) {
	return {
		input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: costTotal },
	};
}

test("turno fechado aparece como barra com tokens e custo", () => {
	const out = joined([
		turnOpen({ seq: 1, turnIndex: 0, ts: 1000 }),
		turnClose({ seq: 1, ts: 3000, model: "anthropic/x", usage: usage(1500, 0.004), stopReason: "stop", isError: false }),
	]);
	assert.match(out, /turno 0/);
	assert.match(out, /1\.5k tok/);
	assert.match(out, /\$0\.0040/);
	assert.match(out, /tokens vivos/);
	assert.match(out, /custo \$0\.0040/);
});

test("429 no provider é destacado como rate-limit", () => {
	const out = joined([
		turnOpen({ seq: 1, turnIndex: 0, ts: 1 }),
		turnClose({ seq: 1, ts: 2, isError: false, provider: { status: 429, retries: 2 } }),
	]);
	assert.match(out, /429 rate-limit/);
	assert.match(out, /2 retry/);
});

test("taxa de erro aparece no cabeçalho quando há turno com erro", () => {
	const out = joined([
		turnOpen({ seq: 1, turnIndex: 0, ts: 1 }),
		turnClose({ seq: 1, ts: 2, isError: true, stopReason: "error" }),
	]);
	assert.match(out, /erros 1\/1/);
});
