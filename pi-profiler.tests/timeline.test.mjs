// Seam 2 — projeção span→visões (núcleo da TUI). Marcos sintéticos → modelo da
// timeline. Foca no pareamento open/close, órfãos e o recorte do Session frame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectTimeline } from "../src/timeline.ts";
import { sessionOpen, sessionClose } from "../src/spans.ts";

test("session fechada: frame completo com duração e motivo de shutdown", () => {
	const marks = [
		sessionOpen({ sessionId: "s1", cwd: "/proj", model: "anthropic/x", reason: "startup", ts: 1000 }),
		sessionClose({ sessionId: "s1", reason: "quit", ts: 4000 }),
	];
	const tl = projectTimeline(marks);

	assert.ok(tl.session);
	assert.equal(tl.session.sessionId, "s1");
	assert.equal(tl.session.cwd, "/proj");
	assert.equal(tl.session.model, "anthropic/x");
	assert.equal(tl.session.startReason, "startup");
	assert.equal(tl.session.shutdownReason, "quit");
	assert.equal(tl.session.startedAt, 1000);
	assert.equal(tl.session.endedAt, 4000);
	assert.equal(tl.session.durationMs, 3000);
	assert.equal(tl.session.incomplete, false);
});

test("session órfã: open sem close → incompleta, sem duração", () => {
	const marks = [
		sessionOpen({ sessionId: "s2", cwd: "/proj", reason: "startup", ts: 1000 }),
	];
	const tl = projectTimeline(marks);

	assert.ok(tl.session);
	assert.equal(tl.session.incomplete, true);
	assert.equal(tl.session.endedAt, undefined);
	assert.equal(tl.session.durationMs, undefined);
	assert.equal(tl.session.shutdownReason, undefined);
});

test("o span aparece na lista com status coerente", () => {
	const openOnly = projectTimeline([
		sessionOpen({ sessionId: "s", cwd: "/x", reason: "startup", ts: 1 }),
	]);
	assert.equal(openOnly.spans.length, 1);
	assert.equal(openOnly.spans[0].status, "open");
	assert.equal(openOnly.spans[0].span, "session");

	const closed = projectTimeline([
		sessionOpen({ sessionId: "s", cwd: "/x", reason: "startup", ts: 1 }),
		sessionClose({ sessionId: "s", reason: "quit", ts: 3 }),
	]);
	assert.equal(closed.spans[0].status, "closed");
	assert.equal(closed.spans[0].durationMs, 2);
});

test("close sem open é ignorado (nada a que anexar)", () => {
	const tl = projectTimeline([
		sessionClose({ sessionId: "ghost", reason: "quit", ts: 5 }),
	]);
	assert.equal(tl.spans.length, 0);
	assert.equal(tl.session, undefined);
});

test("sem Session span, timeline não tem frame de sessão", () => {
	const tl = projectTimeline([]);
	assert.equal(tl.session, undefined);
	assert.deepEqual(tl.spans, []);
});

test("ordem de abertura é preservada", () => {
	const marks = [
		sessionOpen({ sessionId: "s", cwd: "/x", reason: "startup", ts: 1 }),
		sessionClose({ sessionId: "s", reason: "quit", ts: 2 }),
	];
	const tl = projectTimeline(marks);
	assert.equal(tl.spans[0].spanId, "s");
});
