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
