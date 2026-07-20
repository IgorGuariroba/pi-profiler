// Seam 1 — mapeamento evento→span (núcleo do coletor), função pura.
//
// Cada span é escrito como dois MARCOS (open/close) correlacionados por `spanId`
// (ver CONTEXT.md e ADR 0003). Estas funções recebem entradas planas — extraídas
// de ctx/event pelo coletor — e devolvem o marco pronto. Não tocam disco nem o Pi.
//
// Ticket 1: apenas o Session span. Os demais tipos (turn/tool/context) entram nos
// tickets seguintes; o esquema já reserva o campo `span` para eles.
/** Versão do formato de fio da trilha. Bump quando o esquema mudar de forma incompatível. */
export const TRAIL_VERSION = 1;
// Há um único Session span por trilha, então o spanId é o próprio sessionId.
export function sessionSpanId(sessionId) {
    return sessionId;
}
export function sessionOpen(input) {
    const mark = {
        v: TRAIL_VERSION,
        kind: "open",
        span: "session",
        spanId: sessionSpanId(input.sessionId),
        ts: input.ts,
        sessionId: input.sessionId,
        cwd: input.cwd,
        reason: input.reason,
    };
    // Só grava `model` quando conhecido — evita poluir o marco com null.
    if (input.model !== undefined)
        mark.model = input.model;
    return mark;
}
export function sessionClose(input) {
    return {
        v: TRAIL_VERSION,
        kind: "close",
        span: "session",
        spanId: sessionSpanId(input.sessionId),
        ts: input.ts,
        reason: input.reason,
    };
}
export function turnSpanId(seq) {
    return `turn-${seq}`;
}
export function turnOpen(input) {
    return {
        v: TRAIL_VERSION,
        kind: "open",
        span: "turn",
        spanId: turnSpanId(input.seq),
        ts: input.ts,
        turnIndex: input.turnIndex,
    };
}
export function turnClose(input) {
    const mark = {
        v: TRAIL_VERSION,
        kind: "close",
        span: "turn",
        spanId: turnSpanId(input.seq),
        ts: input.ts,
        isError: input.isError,
    };
    if (input.model !== undefined)
        mark.model = input.model;
    if (input.usage !== undefined)
        mark.usage = input.usage;
    if (input.stopReason !== undefined)
        mark.stopReason = input.stopReason;
    if (input.provider !== undefined)
        mark.provider = input.provider;
    return mark;
}
// ── ToolCall span ───────────────────────────────────────────────────────────
// Uma execução de ferramenta: open em tool_execution_start, close em
// tool_execution_end. read/write/edit/bash e customs são todos ToolCall (ADR 0003).
// O toolCallId do Pi é o spanId natural (único por chamada). Args gravados crus
// (ADR 0004), mas strings gigantes (conteúdo de write/edit) são truncadas SÓ por
// tamanho, preservando o tamanho original em `_truncatedBytes`.
// Limite de bytes por campo string dos args, para o conteúdo de um write/edit não
// inflar a trilha. Não mexe na semântica — só corta o texto e anota o corte.
export const ARG_STRING_MAX_BYTES = 2048;
function utf8Bytes(s) {
    return Buffer.byteLength(s, "utf8");
}
// Trunca uma string por bytes UTF-8, devolvendo o prefixo e o total original
// quando houve corte. Usada para os campos de args e reexportada para teste.
export function truncateArgString(text, maxBytes = ARG_STRING_MAX_BYTES) {
    const total = utf8Bytes(text);
    if (total <= maxBytes)
        return { value: text };
    // Corte conservador por code units; o resultado fica <= maxBytes em bytes.
    let slice = text.slice(0, maxBytes);
    while (utf8Bytes(slice) > maxBytes)
        slice = slice.slice(0, -1);
    return { value: slice, truncatedBytes: total };
}
// Copia os args crus truncando cada campo string grande de primeiro nível. Não
// recorre em estruturas aninhadas (os args das ferramentas built-in são planos:
// path/command/content/oldText/newText). Anota os campos cortados em
// `_truncated: { campo: bytesOriginais }`.
export function summarizeArgs(args) {
    if (typeof args !== "object" || args === null)
        return { value: args };
    const out = {};
    const truncated = {};
    for (const [key, val] of Object.entries(args)) {
        if (typeof val === "string") {
            const { value, truncatedBytes } = truncateArgString(val);
            out[key] = value;
            if (truncatedBytes !== undefined)
                truncated[key] = truncatedBytes;
        }
        else {
            out[key] = val;
        }
    }
    if (Object.keys(truncated).length > 0)
        out._truncated = truncated;
    return out;
}
export function toolSpanId(toolCallId) {
    return `tool-${toolCallId}`;
}
export function toolOpen(input) {
    return {
        v: TRAIL_VERSION,
        kind: "open",
        span: "tool",
        spanId: toolSpanId(input.toolCallId),
        ts: input.ts,
        toolName: input.toolName,
        args: summarizeArgs(input.args),
    };
}
export function contextSpanId(seq) {
    return `context-${seq}`;
}
// Snapshot é instantâneo: open e close no mesmo marco lógico, mantendo o contrato
// de spans e permitindo a TUI correlacionar a curva com os turnos.
export function contextOpen(input) {
    const mark = {
        v: TRAIL_VERSION, kind: "open", span: "context", spanId: contextSpanId(input.seq),
        ts: input.ts, turnIndex: input.turnIndex, tokens: input.tokens, contextWindow: input.contextWindow,
    };
    if (input.compaction !== undefined)
        mark.compaction = input.compaction;
    return mark;
}
export function contextClose(input) {
    return { ...contextOpen(input), kind: "close" };
}
export function toolClose(input) {
    const mark = {
        v: TRAIL_VERSION,
        kind: "close",
        span: "tool",
        spanId: toolSpanId(input.toolCallId),
        ts: input.ts,
        toolName: input.toolName,
        bytesOut: input.bytesOut,
        isError: input.isError,
    };
    if (input.exitCode !== undefined)
        mark.exitCode = input.exitCode;
    if (input.outputTruncated !== undefined)
        mark.outputTruncated = input.outputTruncated;
    return mark;
}
//# sourceMappingURL=spans.js.map