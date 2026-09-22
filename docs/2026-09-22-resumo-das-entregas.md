# Resumo das entregas de 22/09/2026

Três mudanças entraram em produção neste dia, todas no fluxo de treinamento por
vídeo. Este documento diz o que mudou, o que o usuário passa a ver e o que ficou
pendente.

---

## 1. Reprovação na compreensão de vídeo

**O que era:** o colaborador assistia ao vídeo, escrevia um resumo, o gestor dava
uma nota de 0 a 10 — e o ciclo terminava ali. Nota baixa não tinha consequência
nenhuma, e uma resposta enviada não podia ser refeita.

**O que passou a ser:**

- A escala virou **1 a 10**, com aprovação a partir de **7**.
- **Nota abaixo de 7 reprova.** O vídeo volta a pendente, o registro de "assistiu
  até o fim" é apagado (obrigando a reassistir) e o colaborador recebe um aviso
  no sino: *"Opa! Não foi dessa vez — assista ao vídeo [nome] novamente."*
- **Clicar no aviso abre o vídeo direto**, com o player já pronto e tentando
  reproduzir. Navegadores podem recusar a reprodução automática; nesse caso o
  vídeo fica carregado, com os controles à vista. Nunca reproduz mudo.
- **Não há limite de tentativas.** Cada resposta nova é uma tentativa numerada, e
  todas ficam registradas.
- **O gestor é avisado** quando a fila dele chega a 5 respostas sem nota, e de
  novo a 10, 15 e assim por diante. Há também uma varredura que cutuca o gestor
  sobre respostas paradas há mais de 3 dias — para quem responde três vídeos e
  para não ficar esperando para sempre.

**Em "Meu Progresso":**

- A lista deixou de ser estática: **clicar num item executa o conteúdo** — vídeo
  abre o player ali mesmo, documento abre em nova aba.
- Vídeos reprovados vão para um grupo **"Refazer"** no topo da lista.
- Uma reprovação deixa o item **âmbar**; duas ou mais deixam **vermelho**, com a
  frase *"Que tal rever com calma? Assista ao vídeo de novo e responda."* Da
  terceira em diante o visual não muda mais.

> **Efeito a observar:** reprovar **derrubou o percentual** de progresso do
> colaborador. Foi uma decisão deliberada — "concluído" passou a significar
> "aprovado". Se na prática soar punitivo, é uma decisão revisível.

---

## 2. Avaliação da qualidade do vídeo

Logo depois de enviar o resumo, o colaborador passa a ver — **na mesma caixa, sem
abrir janela nova** — a pergunta "Como foi esse vídeo para você?", com estrelas de
1 a 5 em três critérios: **qualidade do áudio**, **qualidade da imagem** e
**clareza das instruções**, mais um comentário livre.

Tudo é opcional: dá para pular, e pular não grava nada. Clicar numa estrela já
marcada a desmarca. Uma avaliação por pessoa por vídeo; reavaliar substitui.

Não abrir uma segunda janela foi decisão de projeto: o formulário de resposta já
vive dentro do player, e duas janelas sobrepostas brigam pela tecla ESC e pela
rolagem da página.

Essas avaliações não entram em nenhuma média de desempenho do colaborador — elas
existem para o gestor descobrir **qual vídeo precisa ser refeito**, e aparecem no
módulo Meu Setor.

---

## 3. Módulo "Meu Setor"

Área nova, no menu Geral, **restrita a Gestor e Admin**. Para o Colaborador o item
não aparece e o endereço responde "página não encontrada".

O Gestor abre direto no setor em que está lotado, sem poder escolher outro — nem
alterando o endereço. O Admin escolhe o setor num seletor.

**Quatro indicadores no topo:** progresso do setor, média do setor, número de
colaboradores e total de reprovações.

**Aba Colaboradores:** uma linha por pessoa, com progresso, média, reprovações e
itens pendentes.

**Aba Qualidade dos vídeos:** cada vídeo do setor com as médias de áudio, imagem e
clareza, o número de avaliações e os comentários — ordenados **do pior avaliado
para o melhor**, porque a pergunta prática é "qual vídeo precisa ser refeito?".

### A regra da média

Definida em 22/09: **a média soma apenas as notas aprovadas (7 ou mais) e divide
pela quantidade delas**. Tentativas reprovadas continuam aparecendo na listagem,
com a nota e o número da tentativa, mas ficam fora do cálculo.

A mesma regra passou a valer no DHO. Antes as duas telas calculavam de formas
diferentes e exibiam **médias diferentes para a mesma pessoa** — isso acabou.

Quem não tem nenhuma nota aprovada não tem média: a tela mostra um travessão,
nunca `0,0`. Marcar como péssimo quem apenas ainda não foi avaliado seria pior do
que não informar.

> **Efeito a observar:** como só notas aprovadas entram, **a média nunca fica
> abaixo de 7** — ela varia só entre 7,0 e 10,0. Quem foi reprovado cinco vezes e
> passou com 7 exibe a mesma média de quem passou de primeira. É por isso que a
> tabela traz a coluna **"Reprovações"** ao lado da média: depois dessa exclusão,
> é ali que mora a informação sobre dificuldade.

---

## Correção de infraestrutura

`npm run lint` estava falhando desde o dia anterior, por uma regra de TypeScript
aplicada indevidamente a um arquivo JavaScript que precisa usar `require()`. A
regra foi desligada só para esses arquivos; a verificação voltou a passar limpa.

---

## Estado da verificação

| Verificação | Resultado |
| --- | --- |
| Tipos (`typecheck`) | limpo |
| Padrões de código (`lint`) | limpo |
| Testes automatizados | 257 passando |
| Testes contra o banco | 67 passando |
| Compilação de produção | passa |

**Nada foi exercitado na interface.** Os testes cobrem lógica e banco; nenhum
deles olha para a tela. A conferência manual está no
[roteiro de testes](2026-09-22-roteiro-de-testes.md), com 28 itens.

---

## Pendências

1. **Migrations em produção.** Entraram três migrations novas. O banco de
   desenvolvimento estava sem a tabela de histórico do Prisma (foi criado com
   `db push`), e foi preciso registrar as anteriores antes de aplicar. **Se o
   banco de produção estiver no mesmo estado, nenhuma das três aplica** — é a
   primeira coisa a checar no próximo deploy. O procedimento está no roteiro de
   testes.

2. **O aviso de respostas paradas há 3 dias** depende da rota de cron
   (`/api/cron/evaluations`) ser chamada de fora, por crontab ou monitor. Sem
   isso, só o gatilho dos 5 funciona.

3. **Conferência visual das três entregas**, pelo roteiro.

---

## Documentos relacionados

- [Roteiro de testes](2026-09-22-roteiro-de-testes.md)
- [Spec: reprovação na compreensão de vídeo](superpowers/specs/2026-09-22-reprovacao-compreensao-video-design.md)
- [Spec: avaliação da qualidade do vídeo](superpowers/specs/2026-09-22-avaliacao-qualidade-video-design.md)
- [Spec: Meu Setor](superpowers/specs/2026-09-22-meu-setor-design.md)
