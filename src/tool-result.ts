// Extração de bytesOut do resultado de uma ferramenta (lado do coletor). O result
// do tool_execution_end tem content: (TextContent | ImageContent)[]. bytesOut é a
// soma dos bytes UTF-8 do texto enviado ao LLM — a métrica de "quanto essa
// ferramenta despejou no contexto". Imagens não contam como texto.

export function resultBytesOut(result: unknown): number {
	const content = (result as { content?: unknown } | undefined)?.content;
	if (!Array.isArray(content)) return 0;
	let bytes = 0;
	for (const part of content) {
		if (
			typeof part === "object" &&
			part !== null &&
			(part as { type?: string }).type === "text" &&
			typeof (part as { text?: string }).text === "string"
		) {
			bytes += Buffer.byteLength((part as { text: string }).text, "utf8");
		}
	}
	return bytes;
}
