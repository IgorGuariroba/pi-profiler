// Fio do coletor: registro dos handlers e escrita do Session span open/close numa
// trilha real, dentro de um HOME temporário. Usa pi/ctx falsos — não toca o Pi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { TrailReader } from "../src/reader.ts";
import { trailPath } from "../src/trail.ts";

// O coletor usa homedir() interno do trail.ts; para isolar, apontamos HOME para um
// diretório temporário antes de importar a factory (que só lê HOME em runtime).
function withTempHome() {
	const home = mkdtempSync(join(tmpdir(), "pi-profiler-home-"));
	const prev = process.env.HOME;
	process.env.HOME = home;
	return {
		home,
		restore() {
			if (prev === undefined) delete process.env.HOME;
			else process.env.HOME = prev;
		},
	};
}

function makePi() {
	const handlers = {};
	return {
		handlers,
		pi: { on: (name, fn) => { handlers[name] = fn; } },
	};
}

function makeCtx({ sessionId = "sess-1", cwd = "/proj", model } = {}) {
	return {
		cwd,
		model,
		sessionManager: { getSessionId: () => sessionId },
	};
}

test("registra os handlers de session_start e session_shutdown", async () => {
	const t = withTempHome();
	try {
		const { default: factory } = await import("../index.ts");
		const { handlers, pi } = makePi();
		factory(pi);
		assert.equal(typeof handlers.session_start, "function");
		assert.equal(typeof handlers.session_shutdown, "function");
	} finally {
		t.restore();
	}
});

test("session_start → shutdown grava open e close na trilha da sessão", async () => {
	const t = withTempHome();
	try {
		const { default: factory } = await import(`../index.ts?case=2`);
		const { handlers, pi } = makePi();
		factory(pi);

		const ctx = makeCtx({ sessionId: "sess-2", model: { provider: "anthropic", id: "x" } });
		await handlers.session_start({ reason: "startup" }, ctx);
		await handlers.session_shutdown({ reason: "quit" }, ctx);

		const path = trailPath("sess-2", homedir());
		const marks = await new TrailReader(path).poll();

		assert.equal(marks.length, 2);
		assert.equal(marks[0].kind, "open");
		assert.equal(marks[0].span, "session");
		assert.equal(marks[0].sessionId, "sess-2");
		assert.equal(marks[0].cwd, "/proj");
		assert.equal(marks[0].model, "anthropic/x");
		assert.equal(marks[0].reason, "startup");
		assert.equal(marks[1].kind, "close");
		assert.equal(marks[1].reason, "quit");
		assert.equal(marks[0].spanId, marks[1].spanId);
	} finally {
		t.restore();
	}
});

test("modelo desconhecido: o marco open não carrega model", async () => {
	const t = withTempHome();
	try {
		const { default: factory } = await import(`../index.ts?case=3`);
		const { handlers, pi } = makePi();
		factory(pi);

		const ctx = makeCtx({ sessionId: "sess-3", model: undefined });
		await handlers.session_start({ reason: "new" }, ctx);
		await handlers.session_shutdown({ reason: "quit" }, ctx);

		const path = trailPath("sess-3", homedir());
		const marks = await new TrailReader(path).poll();
		assert.equal("model" in marks[0], false);
	} finally {
		t.restore();
	}
});

test("registra os handlers de turno e provider", async () => {
	const t = withTempHome();
	try {
		const { default: factory } = await import(`../index.ts?case=turn-reg`);
		const { handlers, pi } = makePi();
		factory(pi);
		assert.equal(typeof handlers.turn_start, "function");
		assert.equal(typeof handlers.turn_end, "function");
		assert.equal(typeof handlers.after_provider_response, "function");
	} finally {
		t.restore();
	}
});

test("turno completo grava Turn open/close com usage e provider", async () => {
	const t = withTempHome();
	try {
		const { default: factory } = await import(`../index.ts?case=turn-full`);
		const { handlers, pi } = makePi();
		factory(pi);

		const ctx = makeCtx({ sessionId: "sess-turn" });
		await handlers.session_start({ reason: "startup" }, ctx);
		await handlers.turn_start({ turnIndex: 0 }, ctx);
		await handlers.after_provider_response({ status: 200, headers: {} }, ctx);
		await handlers.turn_end(
			{
				turnIndex: 0,
				message: {
					role: "assistant",
					provider: "anthropic",
					model: "claude-x",
					stopReason: "stop",
					usage: {
						input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.002 },
					},
				},
				toolResults: [],
			},
			ctx,
		);
		await handlers.session_shutdown({ reason: "quit" }, ctx);

		const path = trailPath("sess-turn", homedir());
		const marks = await new TrailReader(path).poll();
		const turnOpen = marks.find((m) => m.span === "turn" && m.kind === "open");
		const turnClose = marks.find((m) => m.span === "turn" && m.kind === "close");

		assert.ok(turnOpen);
		assert.ok(turnClose);
		assert.equal(turnOpen.spanId, turnClose.spanId);
		assert.equal(turnClose.model, "anthropic/claude-x");
		assert.equal(turnClose.usage.totalTokens, 15);
		assert.equal(turnClose.stopReason, "stop");
		assert.equal(turnClose.isError, false);
		assert.equal(turnClose.provider.status, 200);
		assert.equal(turnClose.provider.retries, 0);
	} finally {
		t.restore();
	}
});
