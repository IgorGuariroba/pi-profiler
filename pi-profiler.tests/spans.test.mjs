// Seam 1 — evento→span (núcleo do coletor). Função pura: entradas planas →
// marcos open/close. Não toca disco nem o Pi.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	sessionOpen,
	sessionClose,
	sessionSpanId,
	TRAIL_VERSION,
} from "../src/spans.ts";

test("o spanId do Session span é o próprio sessionId", () => {
	assert.equal(sessionSpanId("abc123"), "abc123");
});

test("sessionOpen produz um marco open completo", () => {
	const m = sessionOpen({
		sessionId: "abc123",
		cwd: "/home/user/proj",
		model: "anthropic/claude-sonnet-4-5",
		reason: "startup",
		ts: 1000,
	});
	assert.equal(m.v, TRAIL_VERSION);
	assert.equal(m.kind, "open");
	assert.equal(m.span, "session");
	assert.equal(m.spanId, "abc123");
	assert.equal(m.ts, 1000);
	assert.equal(m.sessionId, "abc123");
	assert.equal(m.cwd, "/home/user/proj");
	assert.equal(m.model, "anthropic/claude-sonnet-4-5");
	assert.equal(m.reason, "startup");
});

test("sessionOpen omite model quando desconhecido", () => {
	const m = sessionOpen({ sessionId: "s", cwd: "/x", reason: "new", ts: 1 });
	assert.equal("model" in m, false);
});

test("sessionClose produz um marco close com o mesmo spanId", () => {
	const m = sessionClose({ sessionId: "abc123", reason: "quit", ts: 2000 });
	assert.equal(m.kind, "close");
	assert.equal(m.span, "session");
	assert.equal(m.spanId, "abc123");
	assert.equal(m.ts, 2000);
	assert.equal(m.reason, "quit");
});

test("open e close de uma sessão compartilham o spanId", () => {
	const open = sessionOpen({ sessionId: "s9", cwd: "/x", reason: "startup", ts: 1 });
	const close = sessionClose({ sessionId: "s9", reason: "quit", ts: 9 });
	assert.equal(open.spanId, close.spanId);
});
