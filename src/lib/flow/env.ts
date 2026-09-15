/**
 * Variáveis da integração com o Build.Flow. Sem as três, a integração fica
 * DESLIGADA com erro explícito — abrir chamado de Motoristas avisa, o webhook
 * rejeita — nunca silenciosa.
 *
 *   FLOW_API_URL         base do Flow na rede interna (http://buildflow:3000)
 *   FLOW_API_TOKEN       mesmo valor de CONNECT_INTEGRATION_TOKEN no Flow
 *   FLOW_WEBHOOK_SECRET  mesmo valor de CONNECT_WEBHOOK_SECRET no Flow
 */
export function flowEnv(): { apiUrl: string; apiToken: string; webhookSecret: string } | null {
  const apiUrl = process.env.FLOW_API_URL?.trim().replace(/\/+$/, "");
  const apiToken = process.env.FLOW_API_TOKEN?.trim();
  const webhookSecret = process.env.FLOW_WEBHOOK_SECRET?.trim();
  if (!apiUrl || !apiToken || !webhookSecret) return null;
  return { apiUrl, apiToken, webhookSecret };
}

export const FLOW_DISABLED_MESSAGE =
  "A integração com a Logística (Build.Flow) não está configurada. Avise a Retaguarda.";
