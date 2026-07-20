import type { Timeline } from "./timeline.ts";
import { type RenderTheme } from "./render.ts";
export type ProfilerTab = "timeline" | "files" | "commands" | "network" | "cost";
export declare const PROFILER_TABS: ProfilerTab[];
export declare function nextTab(current: ProfilerTab, delta: number): ProfilerTab;
export declare function renderTab(timeline: Timeline, tab: ProfilerTab, theme: RenderTheme): string[];
