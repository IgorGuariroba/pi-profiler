// I/O da trilha: writer → arquivo real → reader (tail por polling). Cobre o
// caminho de fio no disco, permissão 0600, descoberta e ordenação por recência.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	TrailWriter,
	trailPath,
	profilesDir,
	listTrails,
	latestTrail,
} from "../src/trail.ts";
import { TrailReader } from "../src/reader.ts";
import { projectTimeline } from "../src/timeline.ts";
import { sessionOpen, sessionClose } from "../src/spans.ts";

function tmpHome() {
	return mkdtempSync(join(tmpdir(), "pi-profiler-"));
}

test("trailPath fica sob ~/.pi/profiles com o sessionId", () => {
	const home = "/fake/home";
	assert.equal(trailPath("s1", home), join(profilesDir(home), "s1.jsonl"));
});

test("writer cria o arquivo com permissão 0600", async () => {
	const home = tmpHome();
	const w = new TrailWriter("s1", home);
	w.write(sessionOpen({ sessionId: "s1", cwd: "/x", reason: "startup", ts: 1 }));
	await w.close();

	const s = await stat(w.path);
	assert.equal(s.mode & 0o777, 0o600);
});

test("writer → reader recupera os marcos escritos", async () => {
	const home = tmpHome();
	const w = new TrailWriter("s2", home);
	const open = sessionOpen({ sessionId: "s2", cwd: "/x", reason: "startup", ts: 1 });
	const close = sessionClose({ sessionId: "s2", reason: "quit", ts: 3 });
	w.write(open);
	w.write(close);
	await w.close();

	const reader = new TrailReader(w.path);
	const marks = await reader.poll();
	assert.deepEqual(marks, [open, close]);

	// A projeção sobre o que veio do disco produz o frame de sessão esperado.
	const tl = projectTimeline(marks);
	assert.equal(tl.session.incomplete, false);
	assert.equal(tl.session.durationMs, 2);
});

test("reader só entrega o delta a cada poll (tail incremental)", async () => {
	const home = tmpHome();
	const w = new TrailWriter("s3", home);
	const reader = new TrailReader(w.path);

	w.write(sessionOpen({ sessionId: "s3", cwd: "/x", reason: "startup", ts: 1 }));
	await drain(w);
	const first = await reader.poll();
	assert.equal(first.length, 1);
	assert.equal(first[0].kind, "open");

	// Nada novo entre polls.
	assert.deepEqual(await reader.poll(), []);

	w.write(sessionClose({ sessionId: "s3", reason: "quit", ts: 5 }));
	await w.close();
	const second = await reader.poll();
	assert.equal(second.length, 1);
	assert.equal(second[0].kind, "close");
});

test("poll de trilha inexistente retorna vazio, sem lançar", async () => {
	const reader = new TrailReader(join(tmpHome(), "nao-existe.jsonl"));
	assert.deepEqual(await reader.poll(), []);
});

test("listTrails ordena por recência e latestTrail pega a mais nova", async () => {
	const home = tmpHome();
	const a = new TrailWriter("antiga", home);
	a.write(sessionOpen({ sessionId: "antiga", cwd: "/x", reason: "startup", ts: 1 }));
	await a.close();
	await sleep(15);
	const b = new TrailWriter("nova", home);
	b.write(sessionOpen({ sessionId: "nova", cwd: "/x", reason: "startup", ts: 1 }));
	await b.close();

	const trails = await listTrails(home);
	assert.equal(trails.length, 2);
	assert.equal(trails[0].sessionId, "nova");

	const latest = await latestTrail(home);
	assert.equal(latest.sessionId, "nova");
});

test("listTrails de diretório inexistente retorna vazio", async () => {
	assert.deepEqual(await listTrails(join(tmpHome(), "vazio")), []);
});

// Espera o stream escoar para o disco antes de reler (o write é assíncrono).
function drain(writer) {
	return new Promise((resolve) => setTimeout(resolve, 20));
}
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
