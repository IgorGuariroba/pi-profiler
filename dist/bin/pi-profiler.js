#!/usr/bin/env node
// TUI de perfil (`pi-profiler`) — binário standalone, processo separado do Pi
// (ADR 0002). Faz tail da trilha JSONL por polling e renderiza a timeline ao vivo.
//
//   pi-profiler <sessionId>   inspeciona a trilha de uma sessão
//   pi-profiler --latest      abre a trilha mais recente
//   pi-profiler --list        lista as trilhas disponíveis
//
// A renderização ao vivo usa o pi-tui quando disponível; se o pacote não for
// resolvível (ambiente sem o Pi instalado), cai para um modo de impressão simples
// em stdout, mantendo o binário utilizável.
import { latestTrail, listTrails, trailPath } from "../src/trail.js";
import { tailTrail } from "../src/reader.js";
import { projectTimeline } from "../src/timeline.js";
import { renderTimeline, identityTheme } from "../src/render.js";
import { renderTab, nextTab } from "../src/tabs.js";
async function resolveTarget(argv) {
    const arg = argv[0];
    if (!arg || arg === "--latest") {
        const latest = await latestTrail();
        if (!latest) {
            console.error("Nenhuma trilha de perfil encontrada em ~/.pi/profiles.");
            return undefined;
        }
        return { sessionId: latest.sessionId, path: latest.path };
    }
    return { sessionId: arg, path: trailPath(arg) };
}
async function printList() {
    const trails = await listTrails();
    if (trails.length === 0) {
        console.log("Nenhuma trilha de perfil encontrada.");
        return;
    }
    for (const t of trails) {
        console.log(`${t.sessionId}\t${new Date(t.mtimeMs).toISOString()}`);
    }
}
// Tenta montar um loop de terminal com o pi-tui. Retorna uma função de update ou
// undefined se o pacote não estiver disponível (fallback para stdout).
async function tryLiveRenderer() {
    try {
        const tui = await import("@earendil-works/pi-tui");
        const themeMod = await import("@earendil-works/pi-coding-agent");
        const theme = themeMod.theme ?? identityTheme;
        const terminal = new tui.ProcessTerminal();
        const app = new tui.TUI(terminal);
        const text = new tui.Text("", 0, 0);
        app.addChild(text);
        let tab = "timeline";
        let latest;
        const redraw = () => { if (latest) {
            text.setText(renderTab(latest, tab, theme).join("\n"));
            app.requestRender();
        } };
        terminal.start((data) => {
            if (/^[1-5]$/.test(data))
                tab = ["timeline", "files", "commands", "network", "cost"][Number(data) - 1];
            else if (data === "\t")
                tab = nextTab(tab, 1);
            else if (data === "\x1b[Z")
                tab = nextTab(tab, -1);
            redraw();
        }, () => app.requestRender());
        app.start();
        return {
            theme,
            update: (tl) => { latest = tl; redraw(); },
            stop: () => app.stop(),
        };
    }
    catch {
        return undefined;
    }
}
async function main() {
    const argv = process.argv.slice(2);
    if (argv[0] === "--list") {
        await printList();
        return;
    }
    const target = await resolveTarget(argv);
    if (!target) {
        process.exitCode = 1;
        return;
    }
    const marks = [];
    const live = await tryLiveRenderer();
    const onMarks = (incoming) => {
        marks.push(...incoming);
        const tl = projectTimeline(marks);
        if (live) {
            live.update(tl);
        }
        else {
            // Fallback: redesenha em stdout (limpa a tela e reimprime).
            process.stdout.write("\x1b[2J\x1b[H");
            process.stdout.write(renderTimeline(tl, identityTheme).join("\n") + "\n");
        }
    };
    // tailTrail já faz uma primeira leitura imediata, então cobre o desenho inicial
    // tanto no modo TUI quanto no fallback de stdout.
    const stopTail = tailTrail(target.path, onMarks);
    const shutdown = () => {
        stopTail();
        if (live)
            live.stop();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
void main();
//# sourceMappingURL=pi-profiler.js.map