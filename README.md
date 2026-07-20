# Pi Profiler

Profiler de execução em tempo real para o Pi Coding Agent. Torna visível o
funcionamento operacional interno de uma sessão — contexto, modelos, ferramentas,
arquivos, comandos, tempo, tokens, falhas e custo — em vez da tarefa executada.

> Estado: protótipo funcional v0.1.0. A coleta e a TUI estão implementadas, mas a
> integração ainda deve ser validada em uma sessão real antes de uso produtivo.

## Instalação

O pacote pode ser instalado a partir de um diretório Git ou de um tarball npm:

```bash
# Git/local
pi install /caminho/para/pi-profiler

# Depois de publicar no npm
pi install npm:pi-profiler
```

O pacote declara a extensão Pi em `package.json` e instala o binário
`pi-profiler`. Ele requer uma instalação compatível de
`@earendil-works/pi-coding-agent` como peer dependency.

Para testar localmente sem publicar:

```bash
cd agent/extensions/pi-profiler
npm pack
npm install -g ./pi-profiler-0.1.0.tgz
```

## Uso

A extensão é sempre ligada quando carregada pelo Pi. Ela grava uma trilha por
sessão em `~/.pi/profiles/<sessionId>.jsonl`.

Abra o observador num segundo terminal, enquanto o Pi trabalha no primeiro:

```bash
pi-profiler --latest        # trilha modificada mais recentemente
pi-profiler <sessionId>     # uma sessão específica
pi-profiler --list          # lista as trilhas disponíveis
```

### Abas da TUI

A tela inicial é a **timeline**. Use:

- `1`: timeline;
- `2`: arquivos;
- `3`: comandos;
- `4`: rede;
- `5`: custo;
- `Tab`: próxima aba;
- `Shift+Tab`: aba anterior;
- `Ctrl+C`: sair.

Quando `pi-tui` não puder ser carregado, o binário usa um fallback de stdout.

## O que é coletado

O coletor transforma eventos do Pi em quatro tipos de span:

- **Session**: início, fim, cwd, modelo inicial e motivos de lifecycle;
- **Turn**: modelo, tokens de entrada/saída/cache, custo, stop reason, status HTTP,
  latência e retries do provider;
- **ToolCall**: nome, argumentos resumidos, duração, bytes de saída e erro para
  `read`, `write`, `edit`, `bash` e ferramentas customizadas;
- **ContextSnapshot**: tokens vivos, janela do modelo e fronteiras de compaction.

Cada span é escrito como dois marcos JSONL: `open` e `close`, correlacionados por
`spanId`. Um `open` sem `close` é exibido como trabalho em voo/incompleto.

## Visões

A TUI deriva visões sem gravar spans adicionais:

- **Timeline**: ordem cronológica, duração e operações em voo;
- **Arquivos**: agrupa `read`/`write`/`edit` por path e marca releituras;
- **Comandos**: agrupa bash por comando, duração, erro, exit code e truncagem;
- **Rede**: status HTTP, 429, latência e retries por turno;
- **Custo**: custo e tokens por turno e total da sessão.

A curva de contexto mostra tokens vivos versus a janela do modelo por turno. O
cache hit ratio é calculado como `cacheRead / (cacheRead + input)`.

## Formato da trilha

A trilha é JSONL append-only, com uma linha por marco. O envelope atual é:

```json
{
  "v": 1,
  "kind": "open|close",
  "span": "session|turn|tool|context",
  "spanId": "id-do-span",
  "ts": 1710000000000
}
```

Campos específicos ficam no mesmo objeto. Por exemplo, um `Turn.close` pode
carregar `usage`, `model`, `stopReason`, `isError` e `provider`; um `ToolCall.close`
pode carregar `bytesOut`, `exitCode` e `outputTruncated`.

Os arquivos são criados com permissão `0600`, pois os argumentos crus podem conter
conteúdo sensível. A trilha não é um arquivo de sessão do Pi e não deve ser
compartilhada sem revisão.

## Privacidade e limitações

- Argumentos crus são persistidos; conteúdo grande de `write`/`edit` é limitado por
  tamanho. Não há redaction automática na trilha v1.
- `ContextUsage.tokens` pode ser `null`, especialmente imediatamente após
  compaction; nesse caso a UI deve mostrar desconhecido, não interpretar como zero.
- `exitCode` depende do que o resultado real do Pi expõe. Quando não houver
  informação confiável, ele fica ausente.
- Uma compaction global não prova, sozinha, que um arquivo específico saiu do
  contexto. Alertas de releitura devem evitar afirmar essa remoção sem evidência.
- O profiler é always-on quando a extensão está carregada e grava em disco; a
  escrita é não bloqueante, mas o custo de serialização existe.
- A versão 0.1.0 ainda requer validação em sessão real e pode mudar o formato antes
  de uma versão estável.

## Desenvolvimento

```bash
npm test
node --test "pi-profiler.tests/*.test.mjs"
```

O ambiente local usa Node 24, que executa os testes `.mjs` importando `.ts`
diretamente. O typecheck estrito é executado com o TypeScript disponível na
instalação de desenvolvimento do ambiente Pi.

Arquitetura e decisões de domínio estão documentadas em `CONTEXT.md` e nos ADRs
0002–0005 do workspace Pi.

## Licença

MIT.
