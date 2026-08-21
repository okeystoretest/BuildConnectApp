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
