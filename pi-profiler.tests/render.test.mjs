// Renderização da timeline: função pura, tema identidade → linhas de texto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTimeline } from "../src/render.ts";
import { projectTimeline } from "../src/timeline.ts";
import { sessionOpen, sessionClose } from "../src/spans.ts";

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
