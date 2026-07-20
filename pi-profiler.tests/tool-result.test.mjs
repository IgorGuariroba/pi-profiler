// bytesOut a partir do result do tool_execution_end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resultBytesOut } from "../src/tool-result.ts";

test("soma os bytes UTF-8 dos blocos de texto", () => {
	const result = { content: [{ type: "text", text: "abc" }, { type: "text", text: "de" }] };
	assert.equal(resultBytesOut(result), 5);
});

test("ignora blocos que não são texto (imagens)", () => {
	const result = {
		content: [
			{ type: "text", text: "hi" },
			{ type: "image", source: { data: "..." } },
		],
	};
	assert.equal(resultBytesOut(result), 2);
});

test("conta bytes UTF-8, não code units", () => {
	const result = { content: [{ type: "text", text: "café" }] }; // é = 2 bytes
	assert.equal(resultBytesOut(result), 5);
});

test("result sem content ou malformado → 0", () => {
	assert.equal(resultBytesOut({}), 0);
	assert.equal(resultBytesOut(undefined), 0);
	assert.equal(resultBytesOut({ content: "nope" }), 0);
});
