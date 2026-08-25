import "dotenv/config";
import path from "path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

export const config = {
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  obsidianVaultPath: requireEnv("OBSIDIAN_VAULT_PATH"),
  capturesFolder: "Captures",
  authFolder: path.resolve("auth"),
  model: "claude-haiku-4-5-20251001" as const,
  gitPush: process.env.GIT_PUSH === "true",
} as const;

export function getCapturesPath(): string {
  return path.join(config.obsidianVaultPath, config.capturesFolder);
}

function optionalEnv(name: string): string {
  return process.env[name] || "";
}

/**
 * Captura de CRM por áudio (Z-API -> Groq -> Claude -> Pipefy).
 * Fica inteiramente desligada se as variáveis não estiverem presentes, para o
 * pipeline do Obsidian continuar subindo sozinho.
 */
export const crmConfig = {
  zapi: {
    instance: optionalEnv("ZAPI_INSTANCE"),
    token: optionalEnv("ZAPI_TOKEN"),
    clientToken: optionalEnv("ZAPI_CLIENT_TOKEN"),
    // O chip é compartilhado com o projeto do Zona Sul; ver src/zapi.ts.
    forwardUrl: optionalEnv("ZAPI_FORWARD_URL"),
  },
  // Só áudio vindo deste número vira card. O resto do tráfego do chip é ignorado.
  ownerPhone: optionalEnv("OWNER_PHONE").replace(/\D/g, ""),
  groq: {
    apiKey: optionalEnv("GROQ_API_KEY"),
    model: process.env.GROQ_STT_MODEL || "whisper-large-v3",
    language: process.env.GROQ_STT_LANGUAGE || "pt",
  },
  pipefy: {
    token: optionalEnv("PIPEFY_TOKEN"),
    pipeId: optionalEnv("PIPEFY_PIPE_ID"),
  },
  model: "claude-opus-5" as const,
  maxAudioSeconds: parseInt(process.env.MAX_AUDIO_SECONDS || "600", 10),
} as const;

export function crmEnabled(): boolean {
  return Boolean(
    crmConfig.zapi.instance &&
      crmConfig.zapi.token &&
      crmConfig.zapi.clientToken &&
      crmConfig.ownerPhone &&
      crmConfig.groq.apiKey &&
      crmConfig.pipefy.token &&
      crmConfig.pipefy.pipeId
  );
}

export function crmMissingVars(): string[] {
  const required: Record<string, string> = {
    ZAPI_INSTANCE: crmConfig.zapi.instance,
    ZAPI_TOKEN: crmConfig.zapi.token,
    ZAPI_CLIENT_TOKEN: crmConfig.zapi.clientToken,
    OWNER_PHONE: crmConfig.ownerPhone,
    GROQ_API_KEY: crmConfig.groq.apiKey,
    PIPEFY_TOKEN: crmConfig.pipefy.token,
    PIPEFY_PIPE_ID: crmConfig.pipefy.pipeId,
  };
  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}
