import { startWhatsApp } from "./whatsapp.js";
import { extractUrls } from "./url-extractor.js";
import { scrape } from "./scraper.js";
import { summarize } from "./summarizer.js";
import { writeLinkNote, writeQuickNote, setupVault } from "./obsidian-writer.js";
import { onZapiWebhook, startWebServer, updateLastMessage } from "./web.js";
import { crmConfig, crmEnabled, crmMissingVars } from "./config.js";
import { forwardWebhook } from "./zapi.js";
import type { ZapiWebhook } from "./zapi.js";
import { handleZapiMessage, shouldHandle } from "./crm.js";

// Parse optional folder prefix from message
// Format: "FolderA/SubFolder https://link.com" or "FolderA/SubFolder some note text"
// A folder prefix is text before the first URL or note content that contains at least one "/"
function parseFolder(text: string): { folder: string | null; rest: string } {
  const trimmed = text.trim();
  const firstUrlIndex = trimmed.search(/https?:\/\//);

  if (firstUrlIndex > 0) {
    const prefix = trimmed.slice(0, firstUrlIndex).trim();
    if (prefix.includes("/")) {
      return { folder: prefix, rest: trimmed.slice(firstUrlIndex).trim() };
    }
  }

  // No URL — check if first line is a folder path
  const lines = trimmed.split("\n");
  const firstLine = lines[0].trim();
  if (firstLine.includes("/") && !firstLine.includes(" ") && !firstLine.startsWith("http")) {
    return { folder: firstLine, rest: lines.slice(1).join("\n").trim() };
  }

  return { folder: null, rest: trimmed };
}

async function processUrl(url: string, folder: string | null): Promise<void> {
  updateLastMessage(`Processando: ${url}`);
  console.log(`[Pipeline] Scraping: ${url}`);
  const content = await scrape(url);
  console.log(`[Pipeline] Título: ${content.title}`);

  console.log(`[Pipeline] Gerando resumo com Claude...`);
  const summary = await summarize(content);
  console.log(`[Pipeline] Tags: ${summary.tags.join(", ")}`);

  const filePath = await writeLinkNote(content, summary, folder);
  console.log(`[Pipeline] Nota salva: ${filePath}`);
  updateLastMessage(`✅ Nota salva: ${content.title}`);
}

async function handleMessage(text: string): Promise<void> {
  const { folder, rest } = parseFolder(text);
  if (folder) {
    console.log(`[Pipeline] Pasta customizada: ${folder}`);
  }

  const urls = extractUrls(rest);

  if (urls.length === 0) {
    const noteText = rest || text;
    const filePath = await writeQuickNote(noteText, folder);
    console.log(`[Pipeline] Nota rápida salva: ${filePath}`);
    updateLastMessage(`📝 Nota rápida salva`);
    return;
  }

  for (const url of urls) {
    try {
      await processUrl(url, folder);
    } catch (err) {
      console.error(`[Pipeline] Erro processando ${url}:`, err);
      updateLastMessage(`❌ Erro: ${url}`);
    }
  }
}

const port = parseInt(process.env.PORT || "3000", 10);

console.log("[WhatsApp-Obsidian] Iniciando...");

// Captura de CRM: áudio no chip da Z-API vira card no Pipefy.
onZapiWebhook((body) => {
  // O chip também atende o projeto do Zona Sul, e a Z-API só aceita um webhook
  // de recebimento por instância — o repasse mantém o outro projeto vivo.
  forwardWebhook(body);

  const payload = body as ZapiWebhook;
  if (!shouldHandle(payload)) return;
  void handleZapiMessage(payload);
});

if (crmEnabled()) {
  console.log(`[CRM] Ativo — pipe ${crmConfig.pipefy.pipeId}`);
} else {
  console.log(
    `[CRM] Desligado. Faltam variáveis: ${crmMissingVars().join(", ")}`
  );
}

startWebServer(port);

// O painel e o webhook precisam subir mesmo sem sessão do WhatsApp Web —
// a captura do Obsidian é um pipeline separado do CRM.
const whatsappWebEnabled = process.env.ENABLE_WHATSAPP_WEB !== "false";

setupVault()
  .then(() => {
    if (!whatsappWebEnabled) {
      console.log("[WhatsApp] whatsapp-web.js desligado (ENABLE_WHATSAPP_WEB=false)");
      return;
    }
    return startWhatsApp(handleMessage);
  })
  .catch((err) => {
    console.error("[WhatsApp-Obsidian] Erro fatal:", err);
    process.exit(1);
  });
