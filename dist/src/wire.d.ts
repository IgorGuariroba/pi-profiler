import type { Mark } from "./spans.ts";
/** Serializa um marco em uma linha JSONL (com o `\n` terminador). */
export declare function encodeMark(mark: Mark): string;
export interface ParseResult {
    /** Marcos de linhas COMPLETAS (terminadas em `\n`) neste chunk. */
    marks: Mark[];
    /** Sobra parcial (linha sem `\n` ainda) a repassar no próximo chunk. */
    rest: string;
}
export declare function parseChunk(chunk: string, pending?: string): ParseResult;
