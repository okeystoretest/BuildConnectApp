# Scripts de manutenção

## `limpar-mock.sql` — remover os dados de demonstração

O seed deixou de criar os quatro usuários fictícios (Ana Ribeiro, Carlos
Mendes, Beatriz Souza e Pedro Dias); quem rodou o seed antes disso tem essas
linhas gravadas. Este script as remove, junto dos chamados de demonstração —
os de código no formato antigo `#2051`, distinto dos reais `RET-`/`MOT-`.

**Leia o arquivo antes de executar.** Ele está em três blocos: inspeção (não
altera nada), o aviso sobre garantir um administrador ativo, e a remoção em
transação, que termina em `ROLLBACK` de propósito — trocar por `COMMIT` é uma
decisão sua, depois de conferir o resultado da inspeção.

```bash
pg_dump -Fc -f backup-antes-da-limpeza.dump "$DATABASE_URL"   # primeiro isto
psql "$DATABASE_URL" -f scripts/limpar-mock.sql
```

Antes de apagar o admin de demonstração, crie o definitivo:

```bash
SEED_PASSWORD="senha-forte" ADMIN_USERNAME="seunome#BC"   ADMIN_FULLNAME="Seu Nome" npx prisma db seed
```

---

# Reset da estrutura de Avaliações

Dois scripts equivalentes para **apagar todos os dados de avaliação** e
re-semear do zero. Escolha um. Nenhum toca em usuários, setores, chamados,
conteúdos ou mapas.

## Opção A — SQL (recomendada em produção)

```bash
# via prisma (não precisa de psql instalado)
npx prisma db execute --file scripts/reset-evaluations.sql --schema prisma/schema.prisma

# ou direto no psql
psql "$DATABASE_URL" -f scripts/reset-evaluations.sql
```

## Opção B — Node/Prisma (imprime as contagens apagadas)

```bash
npx tsx scripts/reset-evaluations.ts
```

## Depois (obrigatório em ambos os casos)

```bash
npx prisma db seed
```

O seed recria os 5 instrumentos, as seções/perguntas do Pré-Efetivo (16
critérios) e a agenda de ciclos dos colaboradores.

## O que é apagado

`EvaluationAnswer`, `Evaluation`, `EvaluationCycle`, `EvaluationQuestion`,
`EvaluationSection`, `EvaluationType` e as notificações de tipo `AVALIACAO`
(com suas leituras). Tudo numa transação: ou apaga tudo, ou nada.

`Holiday` **não** é apagado (é configuração). Para zerar também, descomente a
última linha do `.sql`.
