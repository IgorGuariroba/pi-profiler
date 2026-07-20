// Formato de fio da trilha de perfil: JSONL, uma linha = um marco.
//
// Este módulo é o contrato compartilhado entre o coletor (escreve) e a TUI (lê).
// A TUI faz tail ao vivo, então pode ler uma linha PARCIAL que o coletor ainda
// está escrevendo — o parser bufferiza até o `\n` e nunca emite objeto de uma
// linha incompleta (ver spec, ADR 0002).
/** Serializa um marco em uma linha JSONL (com o `\n` terminador). */
export function encodeMark(mark) {
    return JSON.stringify(mark) + "\n";
}
// Parser incremental resiliente a linha parcial. `pending` é o resto do chunk
// anterior; concatene os chunks de tail e ele só emite marcos de linhas fechadas.
// Linhas em branco são ignoradas; JSON malformado numa linha completa é pulado
// (a trilha é append-only de fonte confiável, mas o tail não deve quebrar).
export function parseChunk(chunk, pending = "") {
    const buffer = pending + chunk;
    const newlineAt = buffer.lastIndexOf("\n");
    if (newlineAt === -1) {
        // Nenhuma linha completa ainda: tudo é parcial.
        return { marks: [], rest: buffer };
    }
    const complete = buffer.slice(0, newlineAt);
    const rest = buffer.slice(newlineAt + 1);
    const marks = [];
    for (const line of complete.split("\n")) {
        if (line.trim() === "")
            continue;
        try {
            marks.push(JSON.parse(line));
        }
        catch {
            // Linha completa porém malformada: pula, não derruba o tail.
        }
    }
    return { marks, rest };
}
//# sourceMappingURL=wire.js.map