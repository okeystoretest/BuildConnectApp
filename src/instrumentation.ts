import { describeError } from "@/lib/describe-error";

/**
 * A rede de segurança do processo.
 *
 * O Next chama `register()` uma vez por runtime, antes de servir qualquer
 * requisição. É o único gancho que existe para instalar handlers de processo
 * numa aplicação App Router — não há `server.js` próprio onde colocá-los.
 *
 * POR QUE ISTO EXISTE: no Node ≥ 15 uma promessa rejeitada sem `.catch()`
 * encerra o processo com código 1. Não é aviso, é morte. E o código que roda
 * fora do ciclo de requisição — event handler do WebSocket do WhatsApp, callback
 * de `setTimeout` — não tem NINGUÉM acima dele para pegar a rejeição: o Next só
 * protege o que nasce dentro de uma requisição.
 *
 * O efeito prático de não ter isto: uma escrita no Postgres que falha durante a
 * rotação de credencial do WhatsApp mata o processo, e todo mundo leva 502 —
 * inclusive quem estava no meio de um upload de vídeo de 150 MB, que leva
 * minutos e por isso é justamente quem mais fica exposto à janela.
 *
 * ESTE É O SEGUNDO ANEL, não o primeiro: cada promessa de segundo plano tem o
 * seu `.catch()` no lugar de origem (ver `src/lib/whatsapp/connection.ts`), que
 * é onde dá para degradar com sentido — reagendar a reconexão, manter o QR
 * antigo. O handler daqui pega o que escapar de tudo isso, inclusive de dentro
 * de dependências como o Baileys, onde não temos onde colocar `.catch()`.
 */
export async function register(): Promise<void> {
  // O runtime edge (middleware) não tem `process.on`. `register()` roda em
  // todos, então a guarda não é zelo: sem ela, a subida do middleware quebra.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  process.on("unhandledRejection", (motivo) => {
    // Segue vivo de propósito. Uma promessa rejeitada deixa um trabalho por
    // fazer, não um processo corrompido: o estado em memória continua
    // coerente, e derrubar tudo transforma "o QR não gerou" em "a intranet
    // caiu".
    console.error(`[processo] promessa rejeitada sem tratamento: ${describeError(motivo)}`);
  });

  // `uncaughtException` fica DE FORA de propósito — e a ausência é a decisão,
  // não o esquecimento.
  //
  // Depois de uma exceção não capturada o estado do processo é incerto: uma
  // pilha foi abandonada no meio, e o que ela estava editando ficou pela
  // metade. Engolir isso troca uma queda limpa — que o Swarm reinicia em
  // segundos — por uma aplicação de pé servindo dado corrompido, que ninguém
  // percebe. A rejeição não tratada é diferente: ela é um trabalho perdido,
  // com o resto do processo intacto.
}
