import { BufferJSON, initAuthCreds, proto } from "baileys";
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from "baileys";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Estado de autenticação do Baileys guardado no BANCO.
 *
 * O equivalente pronto da biblioteca (`useMultiFileAuthState`) grava numa
 * pasta. Aqui isso seria um furo: o único disco persistente do deploy é o
 * volume montado em /uploads, e a rota app/uploads/[...path] serve qualquer
 * arquivo de lá para quem tem sessão — a credencial do WhatsApp ficaria
 * baixável por qualquer colaborador logado. No banco, nenhuma rota a alcança.
 *
 * O que está gravado aqui É o WhatsApp da empresa. Nada deste módulo pode ir
 * parar em log.
 *
 * A serialização passa pelo `BufferJSON` do próprio Baileys porque as chaves
 * são Buffers, e um Buffer que volta do JSON como `{type:"Buffer",data:[...]}`
 * não é rejeitado: ele passa e a criptografia falha depois, longe daqui.
 */

type Row = Prisma.InputJsonValue;

async function readValue(id: string): Promise<unknown | null> {
  const row = await prisma.whatsappSession.findUnique({ where: { id } });
  if (!row) return null;
  // Reviver do Baileys: reconstrói os Buffers a partir do JSON.
  return JSON.parse(JSON.stringify(row.data), BufferJSON.reviver);
}

async function writeValue(id: string, value: unknown): Promise<void> {
  const data = JSON.parse(JSON.stringify(value, BufferJSON.replacer)) as Row;
  await prisma.whatsappSession.upsert({
    where: { id },
    create: { id, data },
    update: { data },
  });
}

async function deleteValue(id: string): Promise<void> {
  await prisma.whatsappSession.deleteMany({ where: { id } });
}

/** Apaga a sessão inteira: é o que desvincula o número. */
export async function clearAuthState(): Promise<void> {
  await prisma.whatsappSession.deleteMany({});
}

export async function hasStoredCredentials(): Promise<boolean> {
  return (await prisma.whatsappSession.count({ where: { id: "creds" } })) > 0;
}

export interface DbAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}

/**
 * Nome com `load`, e não `use`, apesar de o equivalente do Baileys se chamar
 * `useMultiFileAuthState`: num app React o prefixo `use` significa Hook, e o
 * lint trata a função como tal. A convenção da casa vence a da biblioteca.
 */
export async function loadDbAuthState(): Promise<DbAuthState> {
  const stored = (await readValue("creds")) as AuthenticationCreds | null;
  // Sem credencial gravada, começa do zero — e é isso que faz aparecer o QR.
  const creds: AuthenticationCreds = stored ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const found: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readValue(`${type}-${id}`);
              // Este tipo é protobuf, não JSON puro: sem reconstruir a
              // mensagem, o Baileys recebe um objeto solto e a sincronização
              // de estado falha adiante, sem dizer que veio daqui.
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(
                  value as Record<string, unknown>,
                );
              }
              if (value) found[id] = value as SignalDataTypeMap[T];
            }),
          );
          return found;
        },
        set: async (data) => {
          const writes: Promise<void>[] = [];
          for (const type of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
            const entries = data[type];
            if (!entries) continue;
            for (const id of Object.keys(entries)) {
              const value = entries[id];
              const key = `${type}-${id}`;
              // Valor nulo é REMOÇÃO, não gravação de nulo. Guardar null aqui
              // faria a chave voltar como existente-porém-vazia.
              writes.push(value ? writeValue(key, value) : deleteValue(key));
            }
          }
          await Promise.all(writes);
        },
      },
    },
    saveCreds: () => writeValue("creds", creds),
  };
}
