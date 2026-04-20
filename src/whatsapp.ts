import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { config } from "./config.js";
import { updateQR, updateStatus } from "./web.js";

type MessageHandler = (text: string) => Promise<void>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startWhatsApp(onMessage: MessageHandler): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(config.authFolder);

  let sock: WASocket;

  async function connect() {
    sock = makeWASocket({
      auth: state,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        updateQR(qr);
        console.log("[WhatsApp] QR code gerado — escaneie pelo painel web");
      }

      if (connection === "close") {
        updateStatus("disconnected");
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log("[WhatsApp] Conexão perdida, reconectando em 5s...");
          await sleep(5000);
          connect();
        } else {
          console.log(
            "[WhatsApp] Deslogado. Delete a pasta auth/ e reinicie para escanear QR novamente."
          );
        }
      } else if (connection === "open") {
        updateStatus("connected");
        console.log("[WhatsApp] Conectado!");
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (!isOwnMessage(msg, sock)) continue;

        const text = extractText(msg);
        if (!text) continue;

        console.log(`[WhatsApp] Mensagem recebida: ${text.slice(0, 100)}...`);

        try {
          await onMessage(text);
        } catch (err) {
          console.error("[WhatsApp] Erro processando mensagem:", err);
        }
      }
    });
  }

  await connect();
}

function isOwnMessage(msg: WAMessage, sock: WASocket): boolean {
  const jid = msg.key.remoteJid;
  if (!jid) return false;

  const myJid = sock.user?.id;
  if (!myJid) return false;

  const normalize = (j: string) => j.replace(/:.*@/, "@");
  return normalize(jid) === normalize(myJid) && msg.key.fromMe === true;
}

function extractText(msg: WAMessage): string | null {
  const m = msg.message;
  if (!m) return null;

  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    null
  );
}
