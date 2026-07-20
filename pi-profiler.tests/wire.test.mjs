// Formato de fio: round-trip (serializa → lê de volta → mesmos objetos) e parse
// resiliente a linha PARCIAL, que é o caso do tail ao vivo da TUI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeMark, parseChunk } from "../src/wire.ts";
import { sessionOpen, sessionClose } from "../src/spans.ts";

test("round-trip: encode → parseChunk recupera o mesmo marco", () => {
	const open = sessionOpen({ sessionId: "s1", cwd: "/x", reason: "startup", ts: 1 });
	const close = sessionClose({ sessionId: "s1", reason: "quit", ts: 5 });
	const wire = encodeMark(open) + encodeMark(close);

	const { marks, rest } = parseChunk(wire);
	assert.equal(rest, "");
	assert.deepEqual(marks, [open, close]);
});

test("linha parcial (sem \\n) não emite nada e vira rest", () => {
	const open = sessionOpen({ sessionId: "s", cwd: "/x", reason: "startup", ts: 1 });
	const line = encodeMark(open).slice(0, -1); // remove o \n final → parcial
	const cut = line.slice(0, 10); // corta no meio do JSON

	const { marks, rest } = parseChunk(cut);
	assert.deepEqual(marks, []);
	assert.equal(rest, cut);
});

test("parcial completada no chunk seguinte emite o marco", () => {
	const open = sessionOpen({ sessionId: "s", cwd: "/x", reason: "startup", ts: 1 });
	const wire = encodeMark(open); // termina em \n
	const half = wire.slice(0, 12);
	const tail = wire.slice(12);

	const first = parseChunk(half);
	assert.deepEqual(first.marks, []);

	const second = parseChunk(tail, first.rest);
	assert.deepEqual(second.marks, [open]);
	assert.equal(second.rest, "");
});

test("múltiplas linhas num chunk, com uma parcial ao final", () => {
	const a = sessionOpen({ sessionId: "a", cwd: "/x", reason: "startup", ts: 1 });
	const b = sessionClose({ sessionId: "a", reason: "quit", ts: 2 });
	const chunk = encodeMark(a) + encodeMark(b) + '{"partial":';

	const { marks, rest } = parseChunk(chunk);
	assert.deepEqual(marks, [a, b]);
	assert.equal(rest, '{"partial":');
});

test("linhas em branco são ignoradas", () => {
	const a = sessionOpen({ sessionId: "a", cwd: "/x", reason: "startup", ts: 1 });
	const chunk = "\n" + encodeMark(a) + "\n";
	const { marks } = parseChunk(chunk);
	assert.deepEqual(marks, [a]);
});

test("linha completa malformada é pulada sem derrubar o tail", () => {
	const a = sessionOpen({ sessionId: "a", cwd: "/x", reason: "startup", ts: 1 });
	const chunk = "{isso não é json}\n" + encodeMark(a);
	const { marks } = parseChunk(chunk);
	assert.deepEqual(marks, [a]);
});
