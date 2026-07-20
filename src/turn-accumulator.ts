// Correlação de um turno no coletor (plumbing, mas com lógica suficiente para
// merecer teste próprio). Entre turn_start e turn_end o Pi pode emitir vários
// after_provider_response (retries). Este acumulador junta essas respostas e, no
// fim do turno, produz o ProviderStat embutido no Turn span (ADR 0003).

import type { ProviderStat, TurnUsage } from "./spans.ts";

export interface ProviderResponse {
	status: number;
	ts: number;
}

// Estado mutável de um turno em andamento. `openTs` marca o turn_start; cada
// after_provider_response empurra uma resposta. `finish()` fecha a conta.
export class TurnAccumulator {
	readonly seq: number;
	readonly turnIndex: number;
	readonly openTs: number;
	private responses: ProviderResponse[] = [];

	constructor(seq: number, turnIndex: number, openTs: number) {
		this.seq = seq;
		this.turnIndex = turnIndex;
		this.openTs = openTs;
	}

	recordProviderResponse(status: number, ts: number): void {
		this.responses.push({ status, ts });
	}

	// Resumo do provider: status da ÚLTIMA resposta, retries = respostas além da
	// primeira, latência = do open até a última resposta. undefined se nenhuma
	// resposta foi observada (ex.: turno abortado antes do request).
	providerStat(): ProviderStat | undefined {
		if (this.responses.length === 0) return undefined;
		const last = this.responses[this.responses.length - 1];
		return {
			status: last.status,
			retries: this.responses.length - 1,
			latencyMs: last.ts - this.openTs,
		};
	}
}

// Extrai "provider/id" de uma mensagem de assistente do turn_end.
export function messageModel(message: unknown): string | undefined {
	const m = message as { provider?: string; model?: string } | undefined;
	if (!m || !m.provider || !m.model) return undefined;
	return `${m.provider}/${m.model}`;
}

// Copia verbatim o usage da mensagem, se houver (o coletor não recomputa tokens).
export function messageUsage(message: unknown): TurnUsage | undefined {
	const m = message as { usage?: TurnUsage } | undefined;
	if (!m || !m.usage || typeof m.usage.totalTokens !== "number") return undefined;
	return m.usage;
}

// Um turno é erro quando o stopReason é "error" (ou a mensagem carrega errorMessage).
export function messageIsError(message: unknown): boolean {
	const m = message as { stopReason?: string; errorMessage?: string } | undefined;
	if (!m) return false;
	return m.stopReason === "error" || typeof m.errorMessage === "string";
}

export function messageStopReason(message: unknown): string | undefined {
	const m = message as { stopReason?: string } | undefined;
	return m?.stopReason;
}
