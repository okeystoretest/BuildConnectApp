# Upload de vídeo — o que estava quebrado e o que foi feito

> Resumo da investigação de **08–09/09/2026**. O detalhe técnico completo está
> no `CONTEXTO-BUILDCONNECT.md`, seções 4, 6 e 9.

## Situação

**Funcionando.** Vídeo de 71,6 MB publicado com sucesso em 09/09, em ~120 s.

## O problema não era um. Eram três, em fila

O sintoma foi sempre o mesmo — spinner por minutos e a tela genérica "Algo deu
errado" — e por isso pareceu um bug só. Eram três limites diferentes, um atrás
do outro. Cada correção revelava o próximo, e é por isso que "consertar o
upload" levou várias rodadas em vez de uma.

| # | Portão | Onde | Situação |
|---|---|---|---|
| 1 | **10 MB** no buffer do middleware | `next.config.mjs` | Corrigido em 08/09 |
| 2 | **60 s** de leitura da requisição | Traefik, no host | Corrigido em 09/09 |
| 3 | **300 s** de duração da requisição | Node, dentro do contêiner | Intacto — é o teto de hoje |

### Portão 1 — os 10 MB do middleware

A Server Action posta na URL da própria página, e o middleware cobre
`/setores/*`. O Next então bufferiza o corpo **para o middleware** antes de
qualquer outra coisa, com um padrão de 10 MB. Acima disso ele **truncava** o
corpo, e o multipart quebrava em seguida.

O `bodySizeLimit` de 520 MB que existia nunca chegou a valer: este portão fecha
primeiro, e é o mais baixo dos dois.

### Portão 2 — os 60 s do Traefik

Este é o que estava escondido atrás do primeiro. Enquanto nada passava de 10 MB,
nenhum envio chegava perto de demorar um minuto — então o limite de tempo nunca
aparecia. Removido o portão 1, ele apareceu.

O Traefik 3.6.7 traz `readTimeout: 60s` de fábrica: é o tempo máximo para ele
**ler a requisição inteira, corpo incluído**. Estourado, ele corta a conexão e o
navegador recebe **502**.

Isso significa que **o teto real de upload nunca foi medido em megabytes**. Era
a banda de subida do usuário multiplicada por 60 segundos. É a explicação de por
que a foto de perfil de 44 KB sempre funcionou, o vídeo nunca funcionou, e subir
o limite de 100 para 150 MB não mudou absolutamente nada.

**O que confirmou:** o envio falhou em **60 s exatos, duas vezes seguidas**.
Tempo redondo e repetível é timeout; falta de recurso dá tempos irregulares. Foi
esse único número que decidiu o diagnóstico.

### Portão 3 — os 300 s do Node

Ainda de pé, e agora é ele quem manda. O `next start` não deixa configurar o
`requestTimeout` do Node, que vale 300 segundos para a requisição inteira.
Nenhum envio pode passar de **5 minutos**, e o sintoma seria idêntico ao do
Traefik: 502 com `ECONNRESET` no log.

## O que foi alterado

### No servidor (fora do repositório)

Duas variáveis de ambiente adicionadas ao serviço do Traefik:

```
TRAEFIK_ENTRYPOINTS_HTTPS_TRANSPORT_RESPONDINGTIMEOUTS_READTIMEOUT=600s
TRAEFIK_ENTRYPOINTS_HTTP_TRANSPORT_RESPONDINGTIMEOUTS_READTIMEOUT=600s
```

> ⚠️ **Isto foi aplicado por fora do painel do EasyPanel.** Se ele recriar o
> serviço do Traefik numa atualização, as variáveis somem e o teto de 60 s
> volta. Se um dia "o upload de vídeo parou de novo", **confira estas duas
> variáveis antes de qualquer outra coisa.**

### No código

| Commit | O quê |
|---|---|
| `e71deeb` | O portão de 10 MB do middleware |
| `7d4ce76` | `storeFile` grava em fluxo, sem segunda cópia integral |
| `d691fdb` | Falha de disco parou de se disfarçar de falha de arquivo |
| `a285034` | Entrypoint testa criação de subpasta, não só a raiz do volume |
| `2c39f4a` | Quatro promessas do WhatsApp que podiam derrubar a aplicação |
| `00e24c9` | Tetos recalibrados por tempo (abaixo) |

## Os números de hoje

Medição em produção: **71,6 MB em ~120 s = ~4,8 Mbps de subida**. Vale como
referência porque publicar vídeo é permissão só de Admin — é sempre a mesma
pessoa enviando.

| Tipo | Antes | Agora | Tempo estimado |
|---|---|---|---|
| Vídeo | 150 MB | **110 MB** | ~184 s |
| Instrução escrita | 50 MB | **25 MB** | — |
| Transcrição | 5 MB | 5 MB | — |
| Corpo da requisição | 215 MB | **145 MB** | ~243 s |

**Por que baixou.** Os tetos antigos permitiam um envio de 205 MB — vídeo,
instrução e transcrição juntos, todos no máximo. A 4,8 Mbps isso leva ~344 s e
morre nos 300 s do Node. Era um envio que passava em **toda** a conferência de
tamanho, no navegador e no servidor, e falhava por tempo depois de quase seis
minutos de espera. Os números novos deixam o pior caso em 81% do limite.

## Pendências

1. **O deploy dos tetos novos ainda não saiu.** Produção ainda roda com 150 MB /
   215 MB. Não é urgente — o buraco só aparece na combinação extrema —, mas o
   `next.config.mjs` só passa a valer com **rebuild da imagem**; restart não
   adianta, porque o arquivo vem de dentro da imagem.
2. **Vídeo acima de ~110 MB** exige ou levantar o `requestTimeout` do Node com
   servidor próprio, ou fatiar o envio em pedaços. Editar `limits.ts` sozinho
   não resolve — o tempo de transferência continua o mesmo.
3. **`output: "standalone"` com `next start`** é combinação que o Next declara
   não suportada e avisa a cada subida. Verificado que é só aviso, sem efeito —
   mas polui o log e atrapalhou este diagnóstico.

## Se quebrar de novo

Na ordem, porque cada passo elimina uma faixa inteira de causas:

```sh
C=$(docker ps -q -f name=producao_build-connect)

# 1. O deploy pegou? Lê o arquivo DENTRO do contêiner que está servindo.
docker exec $C grep -n "middlewareClientMaxBodySize\|bodySizeLimit" /app/next.config.mjs

# 2. As variáveis do Traefik ainda existem?
docker service inspect easypanel-traefik \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep -i READTIMEOUT

# 3. O processo morreu, ou só a requisição? Repare no ID da task em cada linha:
#    o comando mistura TODAS as tasks, inclusive as mortas em deploys antigos.
docker service logs producao_build-connect --tail 40
```

E **cronometre a falha**. É a informação mais barata e a mais decisiva:

- Tempo **redondo e repetível** (60 s, 300 s) → é timeout, e o número diz qual.
- Tempo **irregular** → não é timeout; aí vale investigar memória ou queda.
- No log, `Request body exceeded` **presente** → é limite de tamanho do Next.
  **Ausente**, com só o `ECONNRESET` → é tempo.
