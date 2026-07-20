import { test } from "node:test";
import assert from "node:assert/strict";
import { contextOpen, contextClose } from "../src/spans.ts";
import { projectTimeline } from "../src/timeline.ts";
import { turnOpen, turnClose } from "../src/spans.ts";

test("Seam 1: snapshot grava tokens, janela, turno e compaction", () => {
	const input = { seq: 2, turnIndex: 1, tokens: 1200, contextWindow: 200000, ts: 9,
		compaction: { tokensBefore: 9000, summary: "sum", firstKeptEntryId: "e4", reason: "threshold" } };
	const open = contextOpen(input); const close = contextClose(input);
	assert.equal(open.spanId, close.spanId);
	assert.equal(open.tokens, 1200); assert.equal(open.contextWindow, 200000);
	assert.deepEqual(open.compaction, input.compaction);
});

test("Seam 2: curva preserva crescimento e salto de compaction", () => {
	const a = { seq: 1, turnIndex: 0, tokens: 1000, contextWindow: 10000, ts: 1 };
	const b = { seq: 2, turnIndex: 1, tokens: 400, contextWindow: 10000, ts: 2,
		compaction: { tokensBefore: 1800, summary: "s", firstKeptEntryId: "x" } };
	const tl = projectTimeline([contextOpen(a), contextClose(a), contextOpen(b), contextClose(b)]);
	assert.deepEqual(tl.contexts.map(x => x.tokens), [1000, 400]);
	assert.equal(tl.contexts[1].compaction.tokensBefore, 1800);
});

test("Seam 2: cache hit ratio = cacheRead / (cacheRead + input)", () => {
	const usage = { input: 100, output: 1, cacheRead: 900, cacheWrite: 0, totalTokens: 1001,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	const tl = projectTimeline([turnOpen({seq:1,turnIndex:0,ts:1}), turnClose({seq:1,ts:2,usage,isError:false})]);
	assert.equal(tl.turns[0].cacheHitRatio, 0.9);
});
