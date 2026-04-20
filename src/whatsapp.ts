import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import { updateQR, updateStatus } from "./web.js";

type MessageHandler = (text: string) => Promise<void>;

export async function startWhatsApp(onMessage: MessageHandler): Promise<void> {
  const authPath = process.env.AUTH_PATH || "./auth";
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
      ],
    },
  });

  client.on("qr", (qr: string) => {
    updateQR(qr);
    console.log("[WhatsApp] QR code gerado — escaneie pelo painel web");
  });

  client.on("ready", () => {
    updateStatus("connected");
    console.log("[WhatsApp] Conectado!");
  });

  client.on("disconnected", (reason: string) => {
    updateStatus("disconnected");
    console.log(`[WhatsApp] Desconectado: ${reason}`);
  });

  // Log own info on ready
  let myNumber: string | null = null;
  client.on("ready", async () => {
    try {
      const me = client.info?.wid;
      if (me) {
        myNumber = me.user;
        console.log(`[WhatsApp] Meu número: ${myNumber}`);
      }
    } catch {}
  });

  // Listen to ALL events to debug
  client.on("message", async (msg: any) => {
    console.log(`[WhatsApp] EVENT:message from=${msg.from} to=${msg.to} fromMe=${msg.fromMe} body=${msg.body?.slice(0, 50)}`);
  });

  client.on("message_create", async (msg: any) => {
    console.log(`[WhatsApp] EVENT:message_create from=${msg.from} to=${msg.to} fromMe=${msg.fromMe} body=${msg.body?.slice(0, 50)}`);

    if (!msg.fromMe) return;

    const text = msg.body;
    if (!text) return;

    console.log(`[WhatsApp] Mensagem recebida: ${text.slice(0, 100)}...`);

    try {
      await onMessage(text);
    } catch (err) {
      console.error("[WhatsApp] Erro processando mensagem:", err);
    }
  });

  console.log("[WhatsApp] Iniciando cliente...");
  await client.initialize();
}
