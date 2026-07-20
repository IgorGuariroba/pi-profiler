// Correlação de provider dentro de um turno + extração de campos da mensagem.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	TurnAccumulator,
	messageModel,
	messageUsage,
	messageIsError,
	messageStopReason,
} from "../src/turn-accumulator.ts";

test("sem respostas de provider, providerStat é undefined", () => {
	const acc = new TurnAccumulator(1, 0, 1000);
	assert.equal(acc.providerStat(), undefined);
});

test("uma resposta: retries=0 e latência do open até a resposta", () => {
	const acc = new TurnAccumulator(1, 0, 1000);
	acc.recordProviderResponse(200, 1500);
	assert.deepEqual(acc.providerStat(), { status: 200, retries: 0, latencyMs: 500 });
});

test("múltiplas respostas (retry): status da última, retries = extras", () => {
	const acc = new TurnAccumulator(1, 0, 1000);
	acc.recordProviderResponse(429, 1100);
	acc.recordProviderResponse(429, 1300);
	acc.recordProviderResponse(200, 1800);
	const stat = acc.providerStat();
	assert.equal(stat.status, 200);
	assert.equal(stat.retries, 2);
	assert.equal(stat.latencyMs, 800);
});

test("messageModel monta provider/model", () => {
	assert.equal(messageModel({ provider: "anthropic", model: "claude-x" }), "anthropic/claude-x");
	assert.equal(messageModel({ provider: "anthropic" }), undefined);
	assert.equal(messageModel(undefined), undefined);
});

test("messageUsage copia usage só quando bem-formado", () => {
	const usage = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { total: 0.1 } };
	assert.equal(messageUsage({ usage }), usage);
	assert.equal(messageUsage({}), undefined);
	assert.equal(messageUsage({ usage: { foo: 1 } }), undefined);
});

test("messageIsError detecta stopReason error e errorMessage", () => {
	assert.equal(messageIsError({ stopReason: "error" }), true);
	assert.equal(messageIsError({ errorMessage: "boom" }), true);
	assert.equal(messageIsError({ stopReason: "stop" }), false);
	assert.equal(messageIsError(undefined), false);
});

test("messageStopReason repassa o stopReason", () => {
	assert.equal(messageStopReason({ stopReason: "toolUse" }), "toolUse");
	assert.equal(messageStopReason({}), undefined);
});
