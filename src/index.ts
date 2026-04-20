import { startWhatsApp } from "./whatsapp.js";
import { extractUrls } from "./url-extractor.js";
import { scrape } from "./scraper.js";
import { summarize } from "./summarizer.js";
import { writeLinkNote, writeQuickNote } from "./obsidian-writer.js";
import { startWebServer, updateLastMessage } from "./web.js";

async function processUrl(url: string): Promise<void> {
  updateLastMessage(`Processando: ${url}`);
  console.log(`[Pipeline] Scraping: ${url}`);
  const content = await scrape(url);
  console.log(`[Pipeline] Título: ${content.title}`);

  console.log(`[Pipeline] Gerando resumo com Claude...`);
  const summary = await summarize(content);
  console.log(`[Pipeline] Tags: ${summary.tags.join(", ")}`);

  const filePath = await writeLinkNote(content, summary);
  console.log(`[Pipeline] Nota salva: ${filePath}`);
  updateLastMessage(`✅ Nota salva: ${content.title}`);
}

async function handleMessage(text: string): Promise<void> {
  const urls = extractUrls(text);

  if (urls.length === 0) {
    const filePath = await writeQuickNote(text);
    console.log(`[Pipeline] Nota rápida salva: ${filePath}`);
    updateLastMessage(`📝 Nota rápida salva`);
    return;
  }

  for (const url of urls) {
    try {
      await processUrl(url);
    } catch (err) {
      console.error(`[Pipeline] Erro processando ${url}:`, err);
      updateLastMessage(`❌ Erro: ${url}`);
    }
  }
}

const port = parseInt(process.env.PORT || "3000", 10);

console.log("[WhatsApp-Obsidian] Iniciando...");
startWebServer(port);
startWhatsApp(handleMessage).catch((err) => {
  console.error("[WhatsApp-Obsidian] Erro fatal:", err);
  process.exit(1);
});
