import type { Mark } from "./spans.ts";
export interface TrailTailOptions {
    /** Intervalo de polling em ms (padrão 200). */
    intervalMs?: number;
}
export declare class TrailReader {
    readonly path: string;
    private offset;
    private pending;
    constructor(path: string);
    poll(): Promise<Mark[]>;
}
export declare function tailTrail(path: string, onMarks: (marks: Mark[]) => void, options?: TrailTailOptions): () => void;
