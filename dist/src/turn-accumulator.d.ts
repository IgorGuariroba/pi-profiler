import type { ProviderStat, TurnUsage } from "./spans.ts";
export interface ProviderResponse {
    status: number;
    ts: number;
}
export declare class TurnAccumulator {
    readonly seq: number;
    readonly turnIndex: number;
    readonly openTs: number;
    private responses;
    constructor(seq: number, turnIndex: number, openTs: number);
    recordProviderResponse(status: number, ts: number): void;
    providerStat(): ProviderStat | undefined;
}
export declare function messageModel(message: unknown): string | undefined;
export declare function messageUsage(message: unknown): TurnUsage | undefined;
export declare function messageIsError(message: unknown): boolean;
export declare function messageStopReason(message: unknown): string | undefined;
