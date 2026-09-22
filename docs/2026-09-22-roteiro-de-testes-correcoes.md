# Roteiro de testes — correções do modal, tags, paginação e redesenhos

Data: 2026-09-22. Commits `9783adc..17f1ea6`.

Checklist de conferência manual de seis commits. **Nada disto foi exercitado na
interface antes de subir** — não havia automação de navegador na sessão, e o
banco de desenvolvimento estava com um usuário e zero conteúdo. Os testes
automatizados (267 unitários, 71 de banco) cobrem lógica e consultas; nenhum
olha para a tela. É isto que este roteiro fecha.

Os itens marcados com 🔴 são os de maior risco: ou a correção é estrutural e
nunca foi vista rodando, ou o visual é novo em folha.

## Preparação

```bash
git pull && npm run db:generate && npm run dev
```

**Nenhuma migration nova entrou.** Diferente das entregas de 22/09, estes seis
commits não tocam no schema — não há `migrate deploy` a rodar nem risco de P3005.

### Dados necessários

O banco local estava praticamente vazio. Vários testes abaixo só significam
alguma coisa com conteúdo de verdade:

- **Dois setores** com conteúdo — digamos **Retaguarda** e **Logística**.
- Um **Colaborador lotado na Retaguarda** que tenha, no cadastro, **um subsetor
  da Logística marcado**. É esta pessoa que expõe o bug da contagem (seção D).
- **Pelo menos 12 itens** (vídeos + documentos) no subsetor PADRÃO da Retaguarda,
  para a paginação de 10 ter uma segunda página.
- Um **Gestor** da Retaguarda e um **Admin**.
- **Pelo menos 11 respostas já avaliadas** de um mesmo colaborador, para a
  paginação da seção F.

Se precisar popular: `npm run db:seed`.

> **Antes de começar, anote os números atuais** de "Itens pendentes" em Meu
> Progresso do colaborador de teste. A seção D compara contra eles.

---

## A · O modal que piscava e sumia 🔴

*A correção principal. Estrutural, nunca vista rodando.*

- [ ] **T1 — Responder pelo Meu Progresso.** Colaborador → Meu Progresso →
      clicar num vídeo pendente → assistir **até o fim** → responder → Enviar.
      **Esperado:** a confirmação "Resposta enviada — vídeo concluído" e, logo
      abaixo, a caixa com as três linhas de estrelas — **e elas ficam lá**.
      **O bug era:** aparecer por um instante e a página recarregar sozinha.
      **Conferir também:** a página **não** recarrega; a lista de pendências
      atrás do modal pode ter mudado, e tudo bem.

- [ ] **T2 — Fechar depois de avaliar.** Ainda em T1: enviar as estrelas, depois
      fechar o modal no X.
      **Esperado:** a lista atrás já não traz aquele vídeo, e o número de
      pendências caiu em 1.

- [ ] **T3 — A última pendência.** Repetir até **zerar** as pendências do
      colaborador, respondendo a última com o modal aberto.
      **Esperado:** o modal continua aberto e as estrelas aparecem normalmente.
      Ao fechar, o bloco de pendências mostra **"Tudo em dia"** — e não some da
      página.
      **O bug era:** o bloco inteiro desaparecia junto com o modal.

- [ ] **T4 — O mesmo fluxo pela tela do setor.** Colaborador → Setor X →
      Instruções em Vídeo → assistir até o fim → responder → Enviar.
      **Esperado:** idêntico a T1. Esta tela nunca teve o bug; serve para
      garantir que a correção não quebrou o caminho que funcionava.

- [ ] **T5 — Pular ainda funciona.** Em outro vídeo, responder e clicar
      **Pular**.
      **Esperado:** a caixa de estrelas fecha, a confirmação fica, nada recarrega.

## B · Reavaliar o vídeo 🔴

- [ ] **T6 — O botão aparece.** Reabrir um vídeo **já respondido** (pelo card do
      setor).
      **Esperado:** ao lado de "Mostrar Transcrição", o botão **"Avaliar este
      vídeo"**.

- [ ] **T7 — Nasce preenchido.** Clicar nele, num vídeo que você já avaliou em A.
      **Esperado:** breve "Buscando sua avaliação…", e então as estrelas e o
      comentário **exatamente como você deixou**. O texto muda para "Você já
      avaliou este vídeo. Enviar substitui a avaliação anterior.", e o botão diz
      **"Salvar avaliação"**.

- [ ] **T8 — Sobrescreve mesmo.** Trocar as notas (ex.: áudio de 4 para 1),
      salvar, fechar o modal, reabrir e clicar em "Avaliar este vídeo" de novo.
      **Esperado:** as notas novas. **Conferir no Meu Setor** (aba Qualidade dos
      vídeos) que a média daquele vídeo mudou — e que continua **uma** avaliação,
      não duas.

- [ ] **T9 — Retirar a avaliação.** Desmarcar todas as estrelas (clicando na que
      está marcada), apagar o comentário, salvar. Reabrir.
      **Esperado:** tudo vazio, e o texto volta a "Opcional — ajuda o gestor…".
      **Conferir no Meu Setor:** o contador de avaliações daquele vídeo **caiu
      em 1**.
      **Este é o caso mais provável de dar errado** — antes o sistema não
      apagava nada aqui.

- [ ] **T10 — Vídeo não respondido.** Abrir um vídeo que você **nunca** respondeu.
      **Esperado:** o botão "Avaliar este vídeo" **não** aparece.

## C · As tags

- [ ] **T11 — A pill branca.** Colaborador → Setor X → Instruções em Vídeo, num
      vídeo já respondido.
      **Esperado:** no **canto superior direito** da miniatura, uma pill
      **branca arredondada** com ✓ Assistido.
      **Conferir:** legível sobre miniatura escura **e** sobre miniatura clara.
      Se sumir numa thumbnail clara, me avise — dá para somar uma borda.

- [ ] **T12 — "Responder" onde estava.** Num vídeo que você assistiu até o fim
      mas não respondeu.
      **Esperado:** o botão "Responder" no canto superior **esquerdo**, no tom
      de destaque de sempre, e continua clicável abrindo o player na pergunta.

- [ ] **T13 — "Avaliado" mudou de lugar.** Peça ao Gestor para dar nota a uma
      resposta sua (≥ 7). Depois, como Colaborador, olhe o card daquele vídeo.
      **Esperado:** o card mostra **"Assistido"** (a pill branca), **não**
      "Avaliada". Abrindo o vídeo, abaixo do player aparece **"Avaliado"**.

- [ ] **T14 — Os dois temas.** Repetir T11 alternando tema claro/escuro.
      **Esperado:** a pill é branca nos dois — é intencional.

- [ ] **T15 — Visão em lista.** Trocar a grade para lista (ícone na barra de
      ferramentas do setor).
      **Esperado:** "Responder" e a pill aparecem na linha, sem quebrar o layout.

## D · A contagem por setor 🔴

*O "40 virando 120". Precisa do colaborador com subsetor de outro setor marcado.*

- [ ] **T16 — Meu Progresso encolheu.** Entrar como aquele colaborador → Meu
      Progresso.
      **Esperado:** "Itens pendentes" e o total do donut **menores** que os
      números que você anotou na preparação — o material da Logística saiu.
      **Esperado também:** o **percentual subiu** (mesmo numerador, denominador
      menor). Isso é esperado, não bug.

- [ ] **T17 — Só o setor certo.** Na lista de pendências, olhar os rótulos de
      grupo e o subsetor de cada item.
      **Esperado:** **nenhum** item da Logística.

- [ ] **T18 — Histórico do Colaborador.** Gestor/DHO → Setores → DHO →
      Histórico do Colaborador → buscar essa pessoa.
      **Esperado:** "Vídeos assistidos" e "Documentos lidos" com o **mesmo
      total** que o Meu Progresso dela mostrou em T16.
      **O bug era:** aqui contava o acervo da empresa inteira.

- [ ] **T19 — As três telas concordam.** Comparar com Meu Setor → aba
      Colaboradores → o card dessa pessoa.
      **Esperado:** progresso e pendentes **batem** com T16 e T18. Se qualquer
      uma das três divergir, me mande os três números.

- [ ] **T20 — O Admin continua vendo tudo.** Entrar como Admin → Meu Progresso.
      **Esperado:** continua vendo o acervo completo. O Admin não tem lotação
      para recortar.

## E · Meu Progresso: paginação

- [ ] **T21 — Dez por página.** Colaborador com 12+ pendências → Meu Progresso.
      **Esperado:** **10 itens**, rodapé "1–10 de N pendências" com os números
      de página.

- [ ] **T22 — Navegar.** Ir para a página 2.
      **Esperado:** os itens restantes, e **o rótulo do grupo reaparece no topo
      da página** — você precisa saber de que setor são aqueles itens.

- [ ] **T23 — "Refazer" primeiro.** Peça ao Gestor para **reprovar** (nota < 7)
      uma resposta sua. Voltar ao Meu Progresso.
      **Esperado:** o grupo **Refazer** no topo da **primeira** página, em âmbar
      (ou vermelho, a partir da 2ª reprovação), com o selo e o ícone de alerta.
      Um item a refazer **nunca** deve cair na página 2 por acaso.

- [ ] **T24 — Concluir na última página.** Ir para a última página, deixar ela
      com 1 item, e concluir esse item.
      **Esperado:** não sobra página vazia — a paginação puxa você para a
      página anterior.

## F · Meu Setor em cards 🔴

*Visual inteiramente novo.*

- [ ] **T25 — A grade.** Gestor → Meu Setor → aba Colaboradores.
      **Esperado:** um card por pessoa (3 por linha em tela larga, 2 em média,
      1 no celular). A **tabela não existe mais**.

- [ ] **T26 — A foto.** Conferir alguém **com** foto de perfil e alguém **sem**.
      **Esperado:** foto redonda para quem tem; **iniciais** para quem não tem.

- [ ] **T27 — O cabeçalho.** Em cada card.
      **Esperado:** nome, o **papel** abaixo (Colaborador/Gestor/Admin) e o selo
      de status à direita: **Não iniciado** (0%), **Em andamento**, **Concluído**
      (100%).

- [ ] **T28 — Os três números.** Abaixo da barra de progresso.
      **Esperado:** **Cadastro** (data), **Média** (ou `—` para quem não tem nota
      aprovada — nunca `0,0`) e **Reprovações** (em âmbar quando > 0).
      O rótulo é "Cadastro" de propósito: o sistema não guarda data de admissão.

- [ ] **T29 — Pendências.** A caixa inferior esquerda.
      **Esperado:** "N itens a concluir", ou "Nenhuma — conteúdo em dia".
      Fundo **âmbar** só para quem tem reprovações.

- [ ] **T30 — Avaliações.** Clicar na caixa "Avaliações".
      **Esperado:** o card expande e lista as notas já dadas àquela pessoa —
      vídeo, data, tentativa (só da 2ª em diante) e a nota com a palavra
      "aprovada"/"reprovada". Para quem não tem nota, a caixa diz "Nenhuma nota
      ainda" e **não** é clicável.

- [ ] **T31 — Admin troca de setor.** Entrar como Admin → Meu Setor → usar o
      seletor.
      **Esperado:** a grade troca de setor. Gestor **não** vê o seletor.

- [ ] **T32 — Qualidade dos vídeos intacta.** Trocar para a outra aba.
      **Esperado:** continua **tabela**, ordenada do pior avaliado para o melhor.
      Não mexi nela.

- [ ] **T33 — Setor vazio.** Como Admin, escolher um setor sem colaboradores.
      **Esperado:** "Nenhum colaborador neste setor", sem card quebrado.

## G · Resultados de Treinamentos 🔴

- [ ] **T34 — O card.** DHO → Resultados de Avaliações → "Resultados de
      Treinamentos" → escolher um colaborador.
      **Esperado:** o cabeçalho com nome, setor e média; abaixo, **uma linha por
      registro**, compacta.

- [ ] **T35 — Os cinco dados.** Em cada linha.
      **Esperado:** nome do vídeo em destaque e, embaixo, **horário de envio ·
      nome do usuário · setor** (+ "tentativa N" da 2ª em diante). A **nota** à
      direita.

- [ ] **T36 — Ver resposta.** Clicar em "Ver resposta".
      **Esperado:** expande com a resposta escrita, quem avaliou, quando, e o
      comentário do gestor se houver. Clicar de novo recolhe.

- [ ] **T37 — Reprovadas em âmbar.** Procurar um registro com nota < 7.
      **Esperado:** o card inteiro com **fundo e borda amarelados**, a nota em
      âmbar e a palavra **"Reprovada"** logo abaixo dela.

- [ ] **T38 — Paginação.** Num colaborador com 11+ registros.
      **Esperado:** 10 por página, rodapé "1–10 de N registros".

- [ ] **T39 — Trocar de colaborador volta à página 1.** Ir para a página 2,
      voltar pelo caminho de migalhas e abrir **outra** pessoa.
      **Esperado:** abre na página **1**, não na 2.

- [ ] **T40 — Aprovadas aparecem.** Conferir que a lista traz notas **≥ 7**
      também, não só reprovações.
      ⚠️ **Preciso da sua leitura aqui.** Não encontrei no código a restrição
      que você descreveu — a consulta já trazia aprovadas e reprovadas. O que
      ela **esconde** são as respostas que o gestor ainda **não avaliou**. Se
      era isso, é uma linha e eu ajusto.

## H · Regressões do avatar

*Consolidei quatro cópias do avatar num componente só. Nenhuma tela deveria
mudar de aparência.*

- [ ] **T41 — Barra lateral.** Olhar o avatar do usuário logado.
      **Esperado:** igual ao de antes — disco de cor cheia com iniciais, ou a
      foto.

- [ ] **T42 — Gestão de usuários.** DHO → Usuários.
      **Esperado:** avatares nas linhas da lista e no topo do modal de edição,
      iguais aos de antes (disco esmaecido).

- [ ] **T43 — Cronograma.** Setor com Cronograma → Fila de produção.
      **Esperado:** avatar do responsável igual ao de antes.

---

## Como me responder

Para cada item que falhar, me mande:

1. **O número do teste** (T7, T23…).
2. **O que você viu**, em uma frase.
3. **Print**, se for visual.
4. **Console do navegador** (F12 → Console), se algo travou ou sumiu.

Se preferir, uma linha por falha já basta — do tipo
`T9 — desmarquei tudo e salvei, mas a média do vídeo no Meu Setor não mudou`.

Os seis commits são independentes, então dá para eu corrigir um item sem mexer
nos outros. Se algum redesenho (F ou G) não for o que você imaginou, descreva o
que queria em vez do que viu — é mais rápido do que eu adivinhar por iteração.

### Documentos relacionados

- [Roteiro das entregas de 22/09](2026-09-22-roteiro-de-testes.md)
