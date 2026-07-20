// Seam 2 — projeção span→visões (núcleo da TUI), função pura.
//
// Recebe um fluxo de marcos (open/close) e produz o modelo da timeline: pareia os
// marcos por `spanId` e classifica o estado de cada span. Ticket 1 cobre só o
// Session span e o pareamento genérico (incluindo órfãos); os demais spans e as
// visões de agregação entram nos tickets seguintes.
const PROTOCOL_FIELDS = new Set(["v", "kind", "span", "spanId", "ts"]);
function payload(mark) {
    const out = {};
    for (const [k, val] of Object.entries(mark)) {
        if (!PROTOCOL_FIELDS.has(k))
            out[k] = val;
    }
    return out;
}
// Um `open` sem `close` correspondente é um span órfão (a sessão morreu no meio):
// permanece com status "open" — a TUI o exibe como incompleto/abortado. Um `close`
// sem `open` (não deveria acontecer) é ignorado por não ter início a que anexar.
export function projectTimeline(marks) {
    const byId = new Map();
    const order = [];
    for (const mark of marks) {
        if (mark.kind === "open") {
            const span = {
                spanId: mark.spanId,
                span: mark.span,
                status: "open",
                startedAt: mark.ts,
                openFields: payload(mark),
            };
            if (!byId.has(mark.spanId))
                order.push(mark.spanId);
            byId.set(mark.spanId, span);
        }
        else {
            const span = byId.get(mark.spanId);
            if (!span)
                continue; // close órfão: nada a anexar
            span.status = "closed";
            span.endedAt = mark.ts;
            span.durationMs = mark.ts - span.startedAt;
            span.closeFields = payload(mark);
        }
    }
    const spans = order.map((id) => byId.get(id));
    const turns = spans.filter((s) => s.span === "turn").map(toTurnRow);
    const contexts = spans.filter((s) => s.span === "context").map(toContextRow);
    const tools = markWastefulReads(spans.filter((s) => s.span === "tool").map(toToolRow), contexts);
    const timeline = { spans, turns, tools, contexts, files: aggregateFiles(tools), commands: aggregateCommands(tools), summary: summarize(spans, turns) };
    const sessionSpan = spans.find((s) => s.span === "session");
    if (sessionSpan) {
        timeline.session = toSessionFrame(sessionSpan);
    }
    return timeline;
}
function toTurnRow(span) {
    const close = span.closeFields ?? {};
    const row = {
        spanId: span.spanId,
        turnIndex: Number(span.openFields.turnIndex ?? 0),
        status: span.status,
        startedAt: span.startedAt,
        isError: close.isError === true,
    };
    if (span.status === "closed") {
        row.endedAt = span.endedAt;
        row.durationMs = span.durationMs;
    }
    if (typeof close.model === "string")
        row.model = close.model;
    if (isTurnUsage(close.usage)) {
        row.usage = close.usage;
        const denominator = close.usage.cacheRead + close.usage.input;
        if (denominator > 0)
            row.cacheHitRatio = close.usage.cacheRead / denominator;
    }
    if (typeof close.stopReason === "string")
        row.stopReason = close.stopReason;
    if (isProviderStat(close.provider))
        row.provider = close.provider;
    return row;
}
// Tokens vivos: totalTokens do último turno FECHADO que reportou usage — o valor
// mais recente de ocupação de contexto que temos sem o ContextSnapshot (ticket 4).
// Custo acumulado: soma dos custos totais dos turnos fechados. "Executando agora":
// o span aberto mais recente (o próprio Turn em voo, ou um span de outro tipo).
function summarize(spans, turns) {
    let totalCost = 0;
    let liveTokens = 0;
    let errorTurns = 0;
    let closedTurns = 0;
    for (const turn of turns) {
        if (turn.status !== "closed")
            continue;
        closedTurns += 1;
        if (turn.isError)
            errorTurns += 1;
        if (turn.usage) {
            totalCost += turn.usage.cost.total;
            liveTokens = turn.usage.totalTokens;
        }
    }
    const summary = { liveTokens, totalCost, errorTurns, closedTurns };
    // O span em voo mais recente que NÃO é a própria sessão (a sessão fica aberta a
    // vida toda; ela não é "o que executa agora").
    for (let i = spans.length - 1; i >= 0; i -= 1) {
        const s = spans[i];
        if (s.status === "open" && s.span !== "session") {
            summary.runningSpanId = s.spanId;
            summary.runningSpan = s.span;
            break;
        }
    }
    return summary;
}
function toContextRow(span) {
    const fields = span.closeFields ?? span.openFields;
    const row = {
        spanId: span.spanId,
        turnIndex: Number(fields.turnIndex ?? 0),
        startedAt: span.startedAt,
        tokens: typeof fields.tokens === "number" ? fields.tokens : null,
        contextWindow: Number(fields.contextWindow ?? 0),
    };
    if (isRecord(fields.compaction))
        row.compaction = fields.compaction;
    return row;
}
function toToolRow(span) {
    const close = span.closeFields ?? {};
    const row = {
        spanId: span.spanId,
        toolName: String(span.openFields.toolName ?? "?"),
        status: span.status,
        startedAt: span.startedAt,
        args: isRecord(span.openFields.args) ? span.openFields.args : {},
        isError: close.isError === true,
    };
    if (span.status === "closed") {
        row.endedAt = span.endedAt;
        row.durationMs = span.durationMs;
        if (typeof close.bytesOut === "number")
            row.bytesOut = close.bytesOut;
        if (typeof close.exitCode === "number")
            row.exitCode = close.exitCode;
        if (close.outputTruncated === true)
            row.outputTruncated = true;
    }
    return row;
}
function toolPath(tool) {
    return typeof tool.args.path === "string" ? tool.args.path : undefined;
}
function markWastefulReads(tools, contexts) {
    const lastRead = new Map();
    const lastMutation = new Map();
    for (const tool of tools) {
        const path = toolPath(tool);
        if (!path || !["read", "write", "edit"].includes(tool.toolName))
            continue;
        if (tool.toolName === "read") {
            const prior = lastRead.get(path);
            const mutation = lastMutation.get(path) ?? -Infinity;
            const compaction = contexts.some((c) => c.compaction && c.compaction.tokensBefore > 0 && c.startedAt <= tool.startedAt && c.startedAt > (prior?.startedAt ?? -Infinity));
            if (prior && mutation < prior.startedAt && !compaction)
                tool.wastedRead = true;
            lastRead.set(path, tool);
        }
        else {
            lastMutation.set(path, tool.startedAt);
        }
    }
    return tools;
}
function aggregateFiles(tools) {
    const map = new Map();
    for (const tool of tools) {
        const path = toolPath(tool);
        if (!path)
            continue;
        const row = map.get(path) ?? { path, reads: 0, writes: 0, edits: 0, calls: 0, wastedReads: 0 };
        row.calls++;
        if (tool.toolName === "read")
            row.reads++;
        if (tool.toolName === "write")
            row.writes++;
        if (tool.toolName === "edit")
            row.edits++;
        if (tool.wastedRead)
            row.wastedReads++;
        map.set(path, row);
    }
    return [...map.values()].sort((a, b) => b.calls - a.calls);
}
function aggregateCommands(tools) {
    const map = new Map();
    for (const tool of tools) {
        if (tool.toolName !== "bash")
            continue;
        const command = typeof tool.args.command === "string" ? tool.args.command : "?";
        const row = map.get(command) ?? { command, calls: 0, errors: 0, avgDurationMs: 0, outputTruncated: 0, exitCodes: {}, totalDuration: 0 };
        row.calls++;
        row.totalDuration += tool.durationMs ?? 0;
        row.avgDurationMs = row.totalDuration / row.calls;
        if (tool.isError)
            row.errors++;
        if (tool.outputTruncated)
            row.outputTruncated++;
        if (tool.exitCode !== undefined)
            row.exitCodes[String(tool.exitCode)] = (row.exitCodes[String(tool.exitCode)] ?? 0) + 1;
        map.set(command, row);
    }
    return [...map.values()].sort((a, b) => b.calls - a.calls);
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isTurnUsage(value) {
    return (typeof value === "object" &&
        value !== null &&
        typeof value.totalTokens === "number" &&
        typeof value.cost === "object");
}
function isProviderStat(value) {
    return (typeof value === "object" &&
        value !== null &&
        typeof value.status === "number");
}
function toSessionFrame(span) {
    const frame = {
        sessionId: String(span.openFields.sessionId ?? span.spanId),
        incomplete: span.status !== "closed",
        startedAt: span.startedAt,
    };
    if (typeof span.openFields.cwd === "string")
        frame.cwd = span.openFields.cwd;
    if (typeof span.openFields.model === "string")
        frame.model = span.openFields.model;
    if (typeof span.openFields.reason === "string")
        frame.startReason = span.openFields.reason;
    if (span.status === "closed") {
        frame.endedAt = span.endedAt;
        frame.durationMs = span.durationMs;
        if (typeof span.closeFields?.reason === "string") {
            frame.shutdownReason = span.closeFields.reason;
        }
    }
    return frame;
}
//# sourceMappingURL=timeline.js.map