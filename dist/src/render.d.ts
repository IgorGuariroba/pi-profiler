import type { Timeline } from "./timeline.ts";
export interface RenderTheme {
    fg(color: string, text: string): string;
    bold(text: string): string;
}
export declare const identityTheme: RenderTheme;
export declare function renderTimeline(timeline: Timeline, theme?: RenderTheme): string[];
