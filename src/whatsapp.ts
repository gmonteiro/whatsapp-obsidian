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

  // Resolve own LID on ready
  let myLid: string | null = null;
  client.on("ready", async () => {
    try {
      const me = client.info?.wid;
      if (me) {
        // Get the "Message yourself" chat to find the LID
        const chats = await client.getChats();
        const selfChat = chats.find((c: any) => c.id?.user === me.user && !c.isGroup);
        if (selfChat) {
          myLid = selfChat.id._serialized;
          console.log(`[WhatsApp] Self-chat LID: ${myLid}`);
        }
        console.log(`[WhatsApp] Meu JID: ${me._serialized}`);
      }
    } catch {}
  });

  client.on("message_create", async (msg: any) => {
    if (!msg.fromMe) return;

    const text = msg.body;
    if (!text) return;

    // Only accept messages to self: from === to, or to matches our LID
    const isSelfChat = msg.from === msg.to || (myLid && msg.to === myLid);
    if (!isSelfChat) return;

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
