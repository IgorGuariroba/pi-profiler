// Leitura ao vivo da trilha (lado da TUI): tail por POLLING de offset.
//
// Escolha do ADR/spec: polling por offset em vez de fs.watch (portável a qualquer
// FS, previsível, cobre replay de graça). A cada tick relê a partir do último
// offset, parseia só linhas completas (parseChunk bufferiza a parcial) e entrega
// os marcos novos. Ler até o fim de uma trilha encerrada é o mesmo caminho: um
// passe de poll consome tudo e para de crescer.

import { open, stat } from "node:fs/promises";
import { parseChunk } from "./wire.ts";
import type { Mark } from "./spans.ts";

export interface TrailTailOptions {
	/** Intervalo de polling em ms (padrão 200). */
	intervalMs?: number;
}

// Estado de tail de um arquivo: guarda o offset já lido e a sobra parcial entre
// polls. Um poll() lê o delta desde o último offset e devolve os marcos novos.
export class TrailReader {
	readonly path: string;
	private offset = 0;
	private pending = "";

	constructor(path: string) {
		this.path = path;
	}

	// Lê tudo que foi acrescentado desde o último poll. Arquivo ainda inexistente
	// (sessão começando) → sem marcos. Truncamento (tamanho < offset) reinicia do
	// zero, defensivamente.
	async poll(): Promise<Mark[]> {
		let size: number;
		try {
			size = (await stat(this.path)).size;
		} catch {
			return [];
		}

		if (size < this.offset) {
			this.offset = 0;
			this.pending = "";
		}
		if (size === this.offset) return [];

		const fh = await open(this.path, "r");
		try {
			const length = size - this.offset;
			const buf = Buffer.alloc(length);
			await fh.read(buf, 0, length, this.offset);
			this.offset = size;
			const { marks, rest } = parseChunk(buf.toString("utf8"), this.pending);
			this.pending = rest;
			return marks;
		} finally {
			await fh.close();
		}
	}
}

// Faz tail contínuo, chamando onMarks a cada poll com marcos novos (se houver).
// Retorna uma função para parar. Erros de poll são engolidos: um poll que falha
// não deve derrubar a TUI; o próximo tick tenta de novo.
export function tailTrail(
	path: string,
	onMarks: (marks: Mark[]) => void,
	options: TrailTailOptions = {},
): () => void {
	const reader = new TrailReader(path);
	const intervalMs = options.intervalMs ?? 200;
	let stopped = false;

	const tick = async () => {
		if (stopped) return;
		try {
			const marks = await reader.poll();
			if (marks.length > 0) onMarks(marks);
		} catch {
			// engole; tenta no próximo tick
		}
	};

	const timer = setInterval(tick, intervalMs);
	void tick(); // primeira leitura imediata (não espera o primeiro intervalo)

	return () => {
		stopped = true;
		clearInterval(timer);
	};
}
