import { crmConfig } from "./config.js";

interface GroqTranscription {
  text?: string;
  error?: { message?: string };
}

function extensionFor(mimeType: string): string {
  const base = mimeType.split(";")[0].trim();
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/oga": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/flac": "flac",
  };
  return map[base] || "ogg";
}

/**
 * Áudio do WhatsApp chega em OGG/opus, que o Whisper da Groq aceita direto —
 * não há conversão no meio.
 */
export async function transcribe(
  bytes: ArrayBuffer,
  mimeType: string
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: mimeType }),
    `audio.${extensionFor(mimeType)}`
  );
  form.append("model", crmConfig.groq.model);
  form.append("language", crmConfig.groq.language);
  form.append("response_format", "json");
  form.append("temperature", "0");

  const res = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${crmConfig.groq.apiKey}` },
      body: form,
    }
  );

  const payload = (await res.json().catch(() => ({}))) as GroqTranscription;

  if (!res.ok) {
    throw new Error(
      `Groq ${res.status}: ${payload.error?.message || "erro na transcrição"}`
    );
  }

  const text = (payload.text || "").trim();
  if (!text) {
    throw new Error("Transcrição voltou vazia.");
  }
  return text;
}
