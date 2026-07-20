import type { Mark } from "./spans.ts";
/** Diretório raiz das trilhas: ~/.pi/profiles. `home` é injetável para teste. */
export declare function profilesDir(home?: string): string;
/** Caminho da trilha de uma sessão. */
export declare function trailPath(sessionId: string, home?: string): string;
export interface TrailListing {
    sessionId: string;
    path: string;
    /** Última modificação (ms), para ordenar por recência. */
    mtimeMs: number;
}
export declare function listTrails(home?: string): Promise<TrailListing[]>;
/** A trilha mais recente, ou undefined se não houver nenhuma. */
export declare function latestTrail(home?: string): Promise<TrailListing | undefined>;
export declare class TrailWriter {
    private stream;
    readonly path: string;
    constructor(sessionId: string, home?: string);
    write(mark: Mark): void;
    close(): Promise<void>;
}
