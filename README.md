# Pi Profiler

Profiler de execução em tempo real para o Pi Coding Agent. Torna visível o
funcionamento operacional interno de uma sessão — contexto, modelos, ferramentas,
arquivos, comandos, tempo, tokens, falhas e custo — em vez da tarefa executada.

Três peças, com uma fronteira de processo deliberada:

- **Coletor** (`index.ts`) — extensão in-process, sempre-ligada, carregada em toda
  sessão do Pi. Correlaciona os eventos do Pi em **spans** e os grava numa trilha.
- **Trilha de perfil** — arquivo JSONL append-only por sessão em
  `~/.pi/profiles/<sessionId>.jsonl` (permissão `0600`). Fonte da verdade.
- **TUI de perfil** (`pi-profiler`) — binário standalone, em processo separado, que
  faz tail da trilha ao vivo e a renderiza como uma linha do tempo.

## Uso

```bash
pi-profiler --latest        # abre a trilha mais recente
pi-profiler <sessionId>     # inspeciona a trilha de uma sessão
pi-profiler --list          # lista as trilhas disponíveis
```

Rode num segundo terminal enquanto o Pi trabalha no primeiro.

## Estado atual (ticket 1)

Grava e renderiza o **Session span** (marcos open/close com início, fim, modelo
inicial, cwd e motivo de shutdown), provando o pipeline coletor → JSONL → TUI de
ponta a ponta. Turn, ToolCall e ContextSnapshot spans, e as visões de agregação,
chegam nos tickets seguintes (ver `tickets.md`).

## Arquitetura e decisões

Governado pelos ADRs 0002–0005 e pelo glossário em `../../../CONTEXT.md`. Testado em
dois seams puros: mapeamento evento→span (`src/spans.ts`) e projeção span→visões
(`src/timeline.ts`), mais um round-trip do formato de fio (`src/wire.ts`).

```bash
node --test "pi-profiler.tests/*.test.mjs"
```
