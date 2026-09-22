# Roteiro de testes — reprovação, avaliação de vídeo e Meu Setor

Data: 2026-09-22.

Checklist de conferência manual das três entregas de 22/09. Nenhuma delas foi
exercitada na interface antes de subir: os testes automatizados cobrem lógica e
banco, e nenhum deles olha para a tela. É isto que este roteiro fecha.

Specs correspondentes:

- [Reprovação na compreensão de vídeo](superpowers/specs/2026-09-22-reprovacao-compreensao-video-design.md)
- [Avaliação da qualidade do vídeo](superpowers/specs/2026-09-22-avaliacao-qualidade-video-design.md)
- [Meu Setor](superpowers/specs/2026-09-22-meu-setor-design.md)

## Preparação

```bash
git pull && npm run db:generate && npx prisma migrate deploy && npm run dev
```

Três migrations entraram em 22/09: `video_comprehension_attempts`,
`content_progress_completed_at_nullable` e `video_rating`.

> **Se `migrate deploy` falhar com P3005** ("The database schema is not empty"),
> o banco está sem a tabela `_prisma_migrations` — foi criado com `db push`.
> Registre as migrations anteriores como aplicadas e repita:
>
> ```bash
> for m in $(ls prisma/migrations | grep -v migration_lock); do npx prisma migrate resolve --applied "$m"; done
> ```
>
> Faça isto com atenção **antes de qualquer deploy em produção**: se o banco de
> produção estiver no mesmo estado, nenhuma das três migrations aplica.

**Contas necessárias:** um Colaborador e um Gestor no mesmo setor (aqui chamado
Setor X), e um Admin. O Setor X precisa de **pelo menos 6 vídeos** num subsetor
comum (`PADRAO`, não vitrine) para o teste do gatilho dos 5.

---

## A · Resposta e avaliação do vídeo

- [ ] **T1 — Responder um vídeo.** Colaborador → Setor X → Instruções em Vídeo →
      assistir **até o fim** → responder → Enviar.
      **Esperado:** a confirmação "Resposta enviada — vídeo concluído" e, na
      mesma caixa, três linhas de estrelas (áudio, imagem, clareza).
      **Conferir:** nenhuma janela nova abre por cima do player.

- [ ] **T2 — As estrelas.** Marcar 4 em áudio, 2 em imagem, deixar clareza em
      branco; clicar de novo na 4ª estrela do áudio; escrever um comentário;
      enviar.
      **Esperado:** clicar na estrela já marcada **desmarca**. Enviar fecha as
      estrelas e deixa só a confirmação.

- [ ] **T3 — Pular.** Em outro vídeo, responder e clicar **Pular**.
      **Esperado:** some sem erro, igual ao enviar.

- [ ] **T4 — Teclado.** Responder um terceiro vídeo e chegar às estrelas só com
      `Tab`.
      **Esperado:** foco visível em cada estrela; dá para marcar sem mouse.

## B · Nota do gestor

- [ ] **T5 — A resposta chega.** Gestor → Minhas Avaliações.
      **Esperado:** card "Compreensão de vídeo" com o nome do colaborador e o
      título do vídeo; o contador vermelho bate com a quantidade.

- [ ] **T6 — Escala 1–10.** Abrir "Avaliar".
      **Esperado:** dez botões, de **1 a 10, sem o zero**, e a frase "Abaixo de
      7, o colaborador assiste ao vídeo e responde de novo."

- [ ] **T7 — Aprovar.** Dar nota **8**.
      **Esperado:** sai da fila; o vídeo continua concluído para o colaborador.

- [ ] **T8 — Reprovar.** Dar nota **4** numa resposta de outro vídeo.
      **Esperado:** sai da fila.

## C · Reprovação

- [ ] **T9 — A notificação.** Colaborador → sino.
      **Esperado:** "Vamos rever esse vídeo?" com o texto
      *Opa! Não foi dessa vez — assista ao vídeo "[título]" novamente.*

- [ ] **T10 — O clique leva ao vídeo.** Clicar na notificação.
      **Esperado:** abre a página do setor na aba Instruções em Vídeo com **o
      player daquele vídeo já aberto**, tentando reproduzir.
      **Atenção:** o navegador pode recusar a reprodução automática — é
      previsto. Recusando, o vídeo fica carregado com os controles à vista.
      Nunca deve tocar mudo.
      **Conferir também:** depois de abrir, apertar **F5** não reabre o player.

- [ ] **T11 — Obriga a reassistir.** Tentar responder sem assistir de novo.
      **Esperado:** não há como — a pergunta só reaparece ao chegar de novo ao
      fim do vídeo.

- [ ] **T12 — Nova tentativa.** Assistir até o fim, responder, enviar.
      **Esperado:** envia sem erro e volta para a fila do gestor. Não pode
      aparecer "Você já respondeu".

## D · Meu Progresso

- [ ] **T13 — O vídeo volta a pendente.** Colaborador → Meu Progresso.
      **Esperado:** grupo **"Refazer"** no topo, com o vídeo em **âmbar**,
      ícone de alerta e selo "Refazer".
      **Conferir:** o percentual geral **caiu** em relação a antes da
      reprovação. É o comportamento aprovado, não um defeito.

- [ ] **T14 — Segunda reprovação vira vermelho.** Repetir o ciclo (gestor dá
      **5**) e voltar a Meu Progresso.
      **Esperado:** borda, fundo **e o quadrinho do ícone** em vermelho, mais a
      mensagem *Que tal rever com calma? Assista ao vídeo de novo e responda.*

- [ ] **T15 — Clicar executa.** Clicar num vídeo e depois num documento.
      **Esperado:** o vídeo abre o player **dentro de Meu Progresso**; o
      documento abre em nova aba.

- [ ] **T16 — Celular.** Abrir Meu Progresso em tela estreita.
      **Esperado:** nada cortado, espremido ou com rolagem horizontal.

## E · Aviso ao gestor

- [ ] **T17 — Gatilho dos 5.** Responder **5 vídeos diferentes** sem o gestor
      avaliar nenhum.
      **Esperado:** ao enviar a **quinta**, o Gestor recebe no sino "Respostas
      esperando sua nota — 5 respostas de compreensão de vídeo aguardam
      avaliação". Uma sexta resposta **não** gera novo aviso.

> **Não testável no mesmo dia:** o aviso de respostas paradas há mais de 3 dias
> (`sweepStaleComprehensions`, na rota `/api/cron/evaluations`). Exige dados com
> data antiga ou três dias de espera.

## F · DHO › Resultados de Treinamentos

- [ ] **T18 — Todas as tentativas.** Admin ou Gestor do DHO → Setor RH →
      Resultados de Avaliações → "Resultados de Treinamentos" → colaborador.
      **Esperado:** todas as respostas, cada uma com sua nota; as posteriores à
      primeira trazem o selo "tentativa 2", "tentativa 3" etc.

- [ ] **T19 — A média exclui as reprovadas.** Conferir a média na mão: somar
      **só** as notas 7 ou mais e dividir pela quantidade delas.
      *Exemplo:* notas 4, 5, 8 e 10 → média **9,0**. O 4 e o 5 aparecem na lista
      mas não entram na conta.

- [ ] **T20 — Sem nota aprovada.** Colaborador que só tem nota abaixo de 7.
      **Esperado:** a média mostra **—**, nunca **0,0**.

## G · Meu Setor

- [ ] **T21 — Colaborador não entra.** Procurar "Meu Setor" no menu e digitar
      `/meu-setor` na barra de endereço.
      **Esperado:** o item não aparece no menu e a URL responde **404**.

- [ ] **T22 — Gestor vê o próprio setor.** Gestor → menu Geral → Meu Setor.
      **Esperado:** abre direto no setor dele, **sem seletor**; o título traz o
      nome do setor.

- [ ] **T23 — Gestor não alcança outro setor.** Digitar
      `/meu-setor?setor=qualquer-coisa`.
      **Esperado:** continua mostrando o setor dele, ignorando o parâmetro.
      Mudar de setor aqui é **falha de segurança** — reportar imediatamente.

- [ ] **T24 — Os quatro indicadores.** Progresso do setor, Média do setor ("Só
      notas aprovadas (7 ou mais)"), Colaboradores e Reprovações.
      **Conferir:** "Colaboradores" bate com quantas pessoas existem no setor.

- [ ] **T25 — Individual.** Aba Colaboradores: uma linha por pessoa com
      Progresso, Média, Reprovações e Pendentes.
      **Conferir:** o progresso de alguém aqui bate com o que **essa pessoa** vê
      em Meu Progresso; a média bate com a do DHO (T19); quem não tem nota
      aprovada mostra **—**.

- [ ] **T26 — Média do setor.** Somar **todas** as notas 7+ de **todo mundo** do
      setor e dividir pela quantidade delas.
      **Esperado:** bate com o indicador. Não é a média das médias.

- [ ] **T27 — Qualidade dos vídeos.** Aba Qualidade dos vídeos.
      **Esperado:** médias de áudio, imagem e clareza por vídeo, com o número de
      avaliações e os comentários; **pior avaliado primeiro**, e vídeo sem
      avaliação por último com **—**. As estrelas dadas no T2 aparecem aqui.

- [ ] **T28 — Admin troca de setor.** Admin → Meu Setor.
      **Esperado:** seletor de setor presente; trocar recarrega o painel.

---

## Prioridade

Faltando tempo, rode **T10, T14, T19, T23 e T25**: são os que conferem decisões
de desenho que podem estar erradas, não apenas código.

## Como reportar

Numerado, dizendo **o que foi visto** — não só "não funcionou":

```
T1 ok
T10 abriu o player mas não tocou sozinho, tive que dar play
T14 ficou vermelho mas o ícone continuou amarelo
T19 média deu 8,5 e a conta à mão deu 9,0
T23 MUDOU DE SETOR
```

Havendo erro na tela, colar o texto do erro.

## Decisões que este roteiro confere (e podem ser revistas)

1. **Reprovar derruba o percentual** do colaborador (T13). Foi aprovado em
   22/09; se na prática soar punitivo, é aqui que se percebe.
2. **A média nunca fica abaixo de 7** (T19, T25), porque só notas aprovadas
   entram. A coluna "Reprovações" existe para carregar a informação que a
   exclusão tira da média. Se o painel parecer otimista demais, é esse o ponto.
3. **Reprodução automática pode ser recusada** pelo navegador (T10). O recuo é
   deliberado: vídeo de treinamento mudo é pior que play manual.
