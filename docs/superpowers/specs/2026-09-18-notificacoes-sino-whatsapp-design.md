# Notificações do sino ligadas ao banco, WhatsApp de chamado e renomeação — design

Data: 2026-09-18. Aprovado em conversa; ajustes do usuário incorporados.

## Problema

`Notification`/`NotificationRead` existem e o servidor grava linhas em 4 fluxos,
mas o sino (`notification-provider.tsx`) nunca lê o banco — é estado de sessão
iniciado vazio. O chamado de TI grava audiência `["TI"]`, mas o setor chama-se
"Retaguarda" (slug do subsetor: `ti`). O WhatsApp só cobre avaliação e formulário.

## Decisões

1. **Leitura por usuário no servidor** (`src/lib/notifications/data.ts`):
   últimas 50 em que `targetUserId = eu` OU `audience` contém `"*"` ou um slug
   dos meus subsetores, excluindo as que tenho `NotificationRead.dismissed`.
   ADMIN vê todas as de audiência, mas não as individuais de outras pessoas.
   Audiência passa a guardar **slugs** de subsetor, não rótulos.
2. **Sem histórico**: a migration apaga as linhas antigas de `Notification`
   (nunca foram exibidas; audiência estava errada). Só vale o pós-deploy.
3. **"Limpar notificações" apaga da lista do usuário**, persistido:
   `NotificationRead.dismissed = true` para tudo que ele vê. Nunca volta.
4. **Cliente**: `NotificationProvider` recebe a lista inicial do `layout.tsx`,
   faz polling em `GET /api/notificacoes` (60 s, pausa com aba oculta — mesmo
   desenho do `PendingEvaluationsProvider`); os botões chamam Server Actions.
5. **Gatilhos** (módulo único `src/lib/notifications/notify.ts`, nenhuma função lança):
   - Chamado de TI: audiência `["ti"]`.
   - Avaliação designada: já existe (alvo individual). Autoavaliação: idem.
   - Ciclo Pré-Efetivo: **só GESTORES do setor do colaborador**, alvo individual.
   - Formulário publicado/reaberto: uma por `FormAssignment` pendente (alvo individual), kind `FORMULARIO`.
   - Novo material: vídeo (VIDEO/INSTRUCAO, não WORKSHOP) ou documento enviado a
     subsetor **PADRAO**. Vitrine não notifica. Links, fotos e compartilhamento
     de vídeo não notificam. Audiência `[slug]`, `href: /setores/{slug}`.
6. **WhatsApp de chamado**: `WhatsappKind.CHAMADO_TI`; `notifyNewItTicket(code)`
   envia **imediatamente, fora da fila** (`sendNow` em `outbox.ts`) a todos os
   usuários ativos do subsetor `ti`, gravando a linha em `WhatsappMessage` já
   com o resultado. Chamado com `void` após o commit. `WhatsappMessage.text`
   opcional guarda o texto com o código do chamado.
7. **Renomear**: "Compreensão de Vídeos" → "Resultados de Treinamentos" no card do DHO.

## Fora do escopo

Chamados de Motoristas (gerenciados no Build.Flow), tempo real, link/foto,
compartilhamento de vídeo notificando destino.
