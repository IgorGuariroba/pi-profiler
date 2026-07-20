// Coletor do Pi Profiler — extensão in-process, sempre-ligada (ver ADR 0002).
//
// Ticket 1: grava apenas o Session span (open em session_start, close em
// session_shutdown) na trilha ~/.pi/profiles/<sessionId>.jsonl. Os demais spans
// (turn/tool/context) entram nos tickets seguintes, reusando o mesmo TrailWriter.
//
// Regras de ciclo de vida (docs/extensions): não abrir recursos de background na
// factory; abrir o WriteStream em session_start, fechar em session_shutdown.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TrailWriter } from "./src/trail.ts";
import { sessionOpen, sessionClose } from "./src/spans.ts";

// Deriva "provider/id" do modelo atual, ou undefined se ainda desconhecido.
function modelLabel(ctx: ExtensionContext): string | undefined {
	const m = ctx.model as { provider?: string; id?: string } | undefined;
	if (!m || !m.provider || !m.id) return undefined;
	return `${m.provider}/${m.id}`;
}

// sessionId estável para nomear a trilha. Sessões com arquivo usam o id do Pi;
// efêmeras (sem session file) caem num id gerado por processo.
let ephemeralId: string | undefined;
function resolveSessionId(ctx: ExtensionContext): string {
	const id = ctx.sessionManager.getSessionId();
	if (id) return id;
	if (!ephemeralId) ephemeralId = `ephemeral-${process.pid}-${Date.now()}`;
	return ephemeralId;
}

export default function (pi: ExtensionAPI) {
	let writer: TrailWriter | undefined;
	let sessionId: string | undefined;

	pi.on("session_start", async (event, ctx) => {
		sessionId = resolveSessionId(ctx);
		writer = new TrailWriter(sessionId);
		writer.write(
			sessionOpen({
				sessionId,
				cwd: ctx.cwd,
				model: modelLabel(ctx),
				reason: event.reason,
				ts: Date.now(),
			}),
		);
	});

	pi.on("session_shutdown", async (event) => {
		if (!writer || !sessionId) return;
		writer.write(sessionClose({ sessionId, reason: event.reason, ts: Date.now() }));
		await writer.close();
		writer = undefined;
	});
}
