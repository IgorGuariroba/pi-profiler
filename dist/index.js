import { TrailWriter } from "./src/trail.js";
import { sessionOpen, sessionClose, turnOpen, turnClose, toolOpen, toolClose, contextOpen, contextClose, } from "./src/spans.js";
import { TurnAccumulator, messageModel, messageUsage, messageIsError, messageStopReason, } from "./src/turn-accumulator.js";
import { resultBytesOut } from "./src/tool-result.js";
// Deriva "provider/id" do modelo atual, ou undefined se ainda desconhecido.
function modelLabel(ctx) {
    const m = ctx.model;
    if (!m || !m.provider || !m.id)
        return undefined;
    return `${m.provider}/${m.id}`;
}
// sessionId estável para nomear a trilha. Sessões com arquivo usam o id do Pi;
// efêmeras (sem session file) caem num id gerado por processo.
let ephemeralId;
function resolveSessionId(ctx) {
    const id = ctx.sessionManager.getSessionId();
    if (id)
        return id;
    if (!ephemeralId)
        ephemeralId = `ephemeral-${process.pid}-${Date.now()}`;
    return ephemeralId;
}
export default function (pi) {
    let writer;
    let sessionId;
    // Sequencial monótono dos turnos na trilha (garante spanId único mesmo quando o
    // turnIndex do Pi reinicia entre runs). O turno em andamento fica em `current`.
    let turnSeq = 0;
    let current;
    let pendingCompaction;
    pi.on("session_start", async (event, ctx) => {
        sessionId = resolveSessionId(ctx);
        turnSeq = 0;
        current = undefined;
        pendingCompaction = undefined;
        writer = new TrailWriter(sessionId);
        writer.write(sessionOpen({
            sessionId,
            cwd: ctx.cwd,
            model: modelLabel(ctx),
            reason: event.reason,
            ts: Date.now(),
        }));
    });
    pi.on("turn_start", async (event) => {
        if (!writer)
            return;
        turnSeq += 1;
        current = new TurnAccumulator(turnSeq, event.turnIndex, Date.now());
        writer.write(turnOpen({ seq: turnSeq, turnIndex: event.turnIndex, ts: current.openTs }));
    });
    pi.on("after_provider_response", async (event) => {
        current?.recordProviderResponse(event.status, Date.now());
    });
    pi.on("turn_end", async (event, ctx) => {
        if (!writer || !current)
            return;
        const message = event.message;
        const seq = current.seq;
        writer.write(turnClose({
            seq: current.seq,
            ts: Date.now(),
            model: messageModel(message),
            usage: messageUsage(message),
            stopReason: messageStopReason(message),
            isError: messageIsError(message),
            provider: current.providerStat(),
        }));
        const usage = typeof ctx.getContextUsage === "function" ? ctx.getContextUsage() : undefined;
        if (usage) {
            const snapshot = {
                seq,
                turnIndex: event.turnIndex,
                tokens: usage.tokens,
                contextWindow: usage.contextWindow,
                compaction: pendingCompaction,
                ts: Date.now(),
            };
            writer.write(contextOpen(snapshot));
            writer.write(contextClose(snapshot));
            pendingCompaction = undefined;
        }
        current = undefined;
    });
    pi.on("session_compact", async (event) => {
        pendingCompaction = {
            tokensBefore: event.compactionEntry.tokensBefore,
            summary: event.compactionEntry.summary,
            firstKeptEntryId: event.compactionEntry.firstKeptEntryId,
            reason: event.reason,
        };
    });
    pi.on("tool_execution_start", async (event) => {
        if (!writer)
            return;
        writer.write(toolOpen({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
            ts: Date.now(),
        }));
    });
    pi.on("tool_execution_end", async (event) => {
        if (!writer)
            return;
        writer.write(toolClose({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            bytesOut: resultBytesOut(event.result),
            isError: event.isError === true,
            exitCode: typeof event.result?.details?.exitCode === "number" ? event.result.details.exitCode : undefined,
            outputTruncated: event.result?.details?.truncated === true,
            ts: Date.now(),
        }));
    });
    pi.on("session_shutdown", async (event) => {
        if (!writer || !sessionId)
            return;
        writer.write(sessionClose({ sessionId, reason: event.reason, ts: Date.now() }));
        await writer.close();
        writer = undefined;
    });
}
//# sourceMappingURL=index.js.map