// Trilha de perfil: descoberta e escrita do arquivo JSONL por sessão.
//
// Layout (spec): ~/.pi/profiles/<sessionId>.jsonl, uma trilha por sessão. O
// arquivo é criado com permissão 0600 (ADR 0004 — args crus, defesa por permissão).
// A escrita usa um WriteStream append NÃO-bloqueante (ADR/transporte): cada marco é
// um stream.write() que não entra no caminho crítico do handler do agente.

import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { encodeMark } from "./wire.ts";
import type { Mark } from "./spans.ts";

const CONFIG_DIR = ".pi";
const PROFILES_DIR = "profiles";
const TRAIL_EXT = ".jsonl";

/** Diretório raiz das trilhas: ~/.pi/profiles. `home` é injetável para teste. */
export function profilesDir(home: string = homedir()): string {
	return join(home, CONFIG_DIR, PROFILES_DIR);
}

/** Caminho da trilha de uma sessão. */
export function trailPath(sessionId: string, home: string = homedir()): string {
	return join(profilesDir(home), `${sessionId}${TRAIL_EXT}`);
}

export interface TrailListing {
	sessionId: string;
	path: string;
	/** Última modificação (ms), para ordenar por recência. */
	mtimeMs: number;
}

// Lista as trilhas existentes, mais recentes primeiro. É como a TUI descobre
// sessões (pi-profiler --latest / lista de escolha). Diretório ausente → vazio.
export async function listTrails(home: string = homedir()): Promise<TrailListing[]> {
	const dir = profilesDir(home);
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return [];
	}

	const listings: TrailListing[] = [];
	for (const name of names) {
		if (!name.endsWith(TRAIL_EXT)) continue;
		const path = join(dir, name);
		try {
			const s = await stat(path);
			listings.push({
				sessionId: name.slice(0, -TRAIL_EXT.length),
				path,
				mtimeMs: s.mtimeMs,
			});
		} catch {
			// Some arquivo entre readdir e stat: ignora.
		}
	}
	listings.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return listings;
}

/** A trilha mais recente, ou undefined se não houver nenhuma. */
export async function latestTrail(home: string = homedir()): Promise<TrailListing | undefined> {
	return (await listTrails(home))[0];
}

// Escritor da trilha. Abre um WriteStream append em modo 0600 e serializa marcos
// sem bloquear. `close()` faz flush/end explícito (chamado em session_shutdown).
export class TrailWriter {
	private stream: WriteStream;
	readonly path: string;

	constructor(sessionId: string, home: string = homedir()) {
		this.path = trailPath(sessionId, home);
		mkdirSync(profilesDir(home), { recursive: true });
		// flags "a" = append; mode 0o600 aplicado só na criação do arquivo.
		this.stream = createWriteStream(this.path, { flags: "a", mode: 0o600 });
	}

	write(mark: Mark): void {
		this.stream.write(encodeMark(mark));
	}

	// Flush + fecha o stream. Resolve quando o SO confirmou o fim da escrita, para
	// o coletor poder aguardar no session_shutdown antes do processo morrer.
	close(): Promise<void> {
		return new Promise((resolve) => this.stream.end(resolve));
	}
}
