import { crmConfig } from "./config.js";

/**
 * Payload do webhook "ao receber" da Z-API.
 * Só os campos que o pipeline usa — o corpo real traz bem mais.
 * https://developer.z-api.io/webhooks/on-message-received-examples
 */
export interface ZapiWebhook {
  type?: string;
  instanceId?: string;
  messageId?: string;
  phone?: string;
  connectedPhone?: string;
  senderName?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  momment?: number;
  audio?: {
    audioUrl: string;
    mimeType?: string;
    seconds?: number;
    ptt?: boolean;
  };
  text?: { message?: string };
}

function baseUrl(): string {
  return `https://api.z-api.io/instances/${crmConfig.zapi.instance}/token/${crmConfig.zapi.token}`;
}

export function onlyDigits(phone: string | null | undefined): string {
  return (phone || "").replace(/\D/g, "");
}

export async function sendText(phone: string, message: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": crmConfig.zapi.clientToken,
    },
    body: JSON.stringify({ phone, message }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Z-API send-text ${res.status}: ${detail.slice(0, 300)}`);
  }
}

export async function downloadAudio(
  url: string
): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download do áudio falhou (${res.status})`);
  }
  const bytes = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type") || "audio/ogg";
  return { bytes, mimeType };
}

/**
 * A Z-API aceita um único webhook de recebimento por instância, e este chip
 * também atende o projeto do Zona Sul. Repassamos o corpo intacto para lá,
 * senão registrar este endpoint desliga o outro projeto.
 */
export function forwardWebhook(body: unknown): void {
  const url = crmConfig.zapi.forwardUrl;
  if (!url) return;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((res) => {
      if (!res.ok) console.error(`[Z-API] Forward respondeu ${res.status}`);
    })
    .catch((err) => console.error("[Z-API] Forward falhou:", err));
}
