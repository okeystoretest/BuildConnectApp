# Departamento Pessoal — o que foi feito

23 de outubro de 2026

## Departamento Pessoal

A aba "Documentos" do DHO era uma lista plana de arquivos sob o subsetor `rh`. Virou
"Departamento Pessoal": uma pasta por colaborador ativo, com as 11 pastas obrigatórias
do catálogo dentro de cada uma.

A pasta por pessoa é **derivada** da lista de ativos, não gerada. Não há rotina a rodar,
nem pasta órfã quando alguém é desativado, nem pasta faltando quando alguém é admitido.

| Tela | O que faz |
| --- | --- |
| Lista de colaboradores | Busca, alterna grade/lista, filtra por setor em pílulas coloridas. O card é vermelho sem nada entregue, âmbar em parte, neutro em dia. |
| Pastas de um colaborador | Trilha de progresso com checkbox por pasta, mosaico de ladrilhos densos, `+` que vai direto ao envio |
| Gaveta da pasta | Arquivos com visualizar, baixar e excluir; envio e exclusão da pasta no rodapé |

As pastas modelo podem ser excluídas por colaborador, e recriar uma com o mesmo nome a
traz de volta. Os blocos ("Admissionais e contratuais", "Saúde e segurança do trabalho"…)
são renomeáveis por um lápis ao lado do título, e o nome novo vale para todos os
colaboradores.

Quem administra o DHO — Admin e Gestor lotado nele — faz tudo: arquivar, criar pasta,
renomear bloco, excluir pasta e excluir arquivo. Não há terceiro papel, porque a aba já
só admite esses dois.

A aba ocupa a largura livre da página, como o Cronograma — as demais abas do DHO seguem
na largura de leitura.

## Correções fora do DHO

**Paginação.** O componente desenhava um botão por página — com 366 pendências davam 37,
a linha estourava e a seta de "próxima" saía da tela. Agora recorta com reticências: as
duas pontas sempre visíveis, uma janela em volta da atual, e largura fixa em sete casas
para o botão não fugir do cursor. Corrigiu os seis chamadores de uma vez.

**Encaminhamento das respostas de vídeo.** Um Gestor que respondia caía no outro Gestor
do mesmo setor — um par avaliando o par. Agora a resposta de quem gere um setor vai para
**todos os Admins**, de qualquer setor. Sem nenhum Admin cadastrado a regra cede para a
anterior, senão a resposta ficaria sem ninguém para avaliá-la.

Essa segunda muda quem recebe fila em produção: o avaliador é resolvido a cada leitura e
não fica gravado, então respostas de Gestores hoje pendentes com pares de setor vão
reaparecer na fila dos Admins assim que subir.

## Decisões que valem lembrar

São as escolhas que não se leem no código e que, esquecidas, levam alguém a "consertar"
o que está certo.

**A documentação pessoal tem tabela própria.** Não entrou em `Document` com uma coluna de
dono porque `Document` é conteúdo de setor: alimenta contagem de progresso, histórico do
colaborador e vitrine. Atestado médico e dado bancário em qualquer dessas listas é
exposição de dado sensível, e dependeria de lembrar o filtro em três lugares.

**As pastas modelo são constante em código, e a exclusão grava o que SAIU.**
`User.personnelRemovedFolders` guarda as removidas, não as mantidas. Assim uma categoria
nova no catálogo nasce visível para todo mundo, sem migração de dados.

**O checkbox da trilha não é clicável.** O estado de uma pasta é derivado: ela está
entregue porque tem arquivo. Um checkbox manual criaria uma segunda verdade e deixaria
marcar como pronta uma pasta vazia — numa tela que existe para dizer o que falta.

**A cor do setor vem do slug, não do rótulo.** Nesta base o `ti` aparece como "Retaguarda"
e o `rh` como "DHO": renomear um setor é mudar texto e não pode trocar a cor dele.

**Os tons de setor evitam vermelho, âmbar e verde.** Esses três significam pendente,
parcial e ação nos cards logo abaixo das pílulas. Uma pílula "DHO" vermelha sobre uma
fileira de cards vermelhos faz o nome do setor parecer alarme.

**O fio entre as paradas da trilha é neutro.** As pastas não têm ordem obrigatória, e um
fio que "enche" prometeria uma sequência que não existe.

## O que ficou pendente

Em ordem de risco.

1. **Corrida ao excluir duas pastas ao mesmo tempo** (`src/lib/personnel-actions.ts`).
   A exclusão lê a lista de pastas, calcula a nova em memória e grava por cima. Dois
   gestores excluindo pastas diferentes do mesmo colaborador no mesmo instante: uma
   gravação apaga a outra, mas o `deleteMany` das duas já rodou. Resultado: a pasta
   reaparece vazia e os documentos dela sumiram, sem erro nenhum.
   Correção: `{ push: folder }` no ramo do catálogo (atômico) e `$executeRaw` com
   `array_remove` nos ramos de remoção.

2. **Colaborador sem setor cai na cor da Logística** (`src/components/hr/personnel-panel.tsx`).
   Slug vazio gera hash 0, que é o tom da Logística. `sectorId` é opcional e o
   relacionamento é `onDelete: SetNull`, então apagar um setor deixa todo mundo dele
   sem setor. Correção: tratar o vazio antes do hash.

3. **A ação de renomear bloco não tem teste.** O teste de banco cobre a leitura; a ação
   em si, com os três caminhos (chave desconhecida, nome vazio, volta ao nome de fábrica
   que APAGA a linha), não é exercida por nada. Verifiquei o caminho da volta à mão no
   navegador, mas não há rede.

4. **Gates de RBAC sem teste.** `requireDhoManager` e a régua de exclusão são lidas só
   por inspeção.

5. **Linhas de `Document` órfãs sob o subsetor `rh` em produção.** A ferramenta antiga
   foi removida e as linhas ficaram sem tela que as alcance. No banco local são zero;
   em produção pode haver. Remover é decisão sua — é dado de usuário.

6. **Largura de celular.** Nada foi testado em viewport pequeno. Com ladrilhos de 13rem
   devem caber dois por linha; a trilha vai exigir arrasto lateral.

## Armadilhas do ambiente

Custaram tempo nesta rodada e vão custar de novo.

**`next dev` e `next build` disputam o `.next`.** Rodar o build com o dev server de pé
corrompe a pasta, e a página quebra com "Algo deu errado" ou serve chunks de produção
contra um servidor de desenvolvimento. Mate o dev antes de buildar.

**O Server Action que "some".** Depois de recriar o `.next` com uma aba aberta, o
servidor responde `Failed to find Server Action ... from an older or newer deployment` e
a tela quebra. Não é o código — o build de produção nunca falhou. Cede a reinício do dev.

**As portas.** A 3000 é outro projeto (Build.Flow), não este. A 3001 costuma ter um
Build.Connect antigo rodando. Para testar o código atual, suba numa porta livre
(`npx next dev -p 3100`) e confira o título da página antes de concluir qualquer coisa.
