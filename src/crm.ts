import { crmConfig, crmEnabled } from "./config.js";
import { downloadAudio, onlyDigits, sendText } from "./zapi.js";
import type { ZapiWebhook } from "./zapi.js";
import { transcribe } from "./transcribe.js";
import { commentOnCard, createCard, fetchPipe } from "./pipefy.js";
import { extractCard } from "./crm-extractor.js";
import { updateLastMessage } from "./web.js";

/**
 * A Z-API reentrega o webhook quando não recebe 200 a tempo, e reenvia
 * pendências ao reconectar. Sem essa trava, uma reentrega vira um segundo card.
 */
const processed = new Set<string>();
const PROCESSED_LIMIT = 500;

function markProcessed(messageId: string): boolean {
  if (processed.has(messageId)) return false;
  processed.add(messageId);
  if (processed.size > PROCESSED_LIMIT) {
    const oldest = processed.values().next().value;
    if (oldest) processed.delete(oldest);
  }
  return true;
}

const maxAgeMs =
  parseInt(process.env.MAX_MESSAGE_AGE_MINUTES || "10", 10) * 60 * 1000;

export function shouldHandle(body: ZapiWebhook): boolean {
  if (!crmEnabled()) return false;
  // Resposta nossa volta como callback; processá-la criaria card do próprio bot.
  if (body.fromMe) return false;
  if (body.isGroup) return false;
  if (!body.audio?.audioUrl) return false;
  // O chip atende o projeto do Zona Sul ao mesmo tempo: só o dono vira card.
  if (onlyDigits(body.phone) !== crmConfig.ownerPhone) return false;
  if (body.momment && Date.now() - body.momment > maxAgeMs) {
    console.log(`[CRM] Ignorando áudio antigo (${body.messageId}).`);
    return false;
  }
  return true;
}

function formatReply(
  card: { title: string; url: string },
  filled: { label: string; value: string }[],
  blank: string[]
): string {
  const lines = [`✅ Card criado no Pipefy`, card.title, card.url, ""];

  if (filled.length) {
    lines.push("*Preenchido:*");
    for (const { label, value } of filled) {
      lines.push(`• ${label}: ${value}`);
    }
  } else {
    lines.push("_Nenhum campo do formulário foi preenchido pelo áudio._");
  }

  if (blank.length) {
    lines.push("", `*Em branco:* ${blank.join(", ")}`);
  }

  lines.push("", "A transcrição completa ficou nos comentários do card.");
  return lines.join("\n");
}

export async function handleZapiMessage(body: ZapiWebhook): Promise<void> {
  const messageId = body.messageId || `${body.phone}-${body.momment}`;
  if (!markProcessed(messageId)) {
    console.log(`[CRM] Mensagem repetida ignorada: ${messageId}`);
    return;
  }

  const phone = onlyDigits(body.phone);
  const audio = body.audio!;

  try {
    if (audio.seconds && audio.seconds > crmConfig.maxAudioSeconds) {
      await sendText(
        phone,
        `Áudio de ${audio.seconds}s passa do limite de ${crmConfig.maxAudioSeconds}s. Manda em partes.`
      );
      return;
    }

    console.log(`[CRM] Áudio recebido (${audio.seconds ?? "?"}s), baixando...`);
    updateLastMessage("🎙️ Áudio de CRM recebido");
    const { bytes, mimeType } = await downloadAudio(audio.audioUrl);

    console.log("[CRM] Transcrevendo na Groq...");
    const transcript = await transcribe(bytes, audio.mimeType || mimeType);
    console.log(`[CRM] Transcrição: ${transcript.slice(0, 160)}...`);

    const pipe = await fetchPipe();
    console.log(`[CRM] Extraindo campos do pipe "${pipe.name}"...`);
    const extraction = await extractCard(pipe, transcript);

    const card = await createCard(extraction.title, extraction.fields);
    console.log(`[CRM] Card criado: ${card.id} — ${card.url}`);

    // A transcrição vai para o comentário: se a extração perder alguma coisa,
    // o que foi dito continua no card, e não só no log.
    try {
      await commentOnCard(
        card.id,
        `Transcrição do áudio enviado no WhatsApp:\n\n${transcript}`
      );
    } catch (err) {
      console.error("[CRM] Card criado, mas o comentário falhou:", err);
    }

    const preenchidos = new Set(extraction.filled.map((f) => f.label));
    const blank = pipe.fields
      .map((f) => f.label)
      .filter((label) => !preenchidos.has(label));

    await sendText(phone, formatReply(card, extraction.filled, blank));
    updateLastMessage(`✅ Card no Pipefy: ${card.title}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[CRM] Falhou:", err);
    updateLastMessage(`❌ CRM: ${detail}`);
    try {
      await sendText(phone, `❌ Não consegui criar o card.\n${detail}`);
    } catch (sendErr) {
      console.error("[CRM] Nem o aviso de erro saiu:", sendErr);
    }
  }
}
