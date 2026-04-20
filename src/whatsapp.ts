import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { config } from "./config.js";

type MessageHandler = (text: string) => Promise<void>;

export async function startWhatsApp(onMessage: MessageHandler): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(config.authFolder);

  let sock: WASocket;

  async function connect() {
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log("[WhatsApp] Conexão perdida, reconectando...");
          connect();
        } else {
          console.log(
            "[WhatsApp] Deslogado. Delete a pasta auth/ e reinicie para escanear QR novamente."
          );
        }
      } else if (connection === "open") {
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

  // "Message yourself" conversation: remoteJid equals own JID
  const myJid = sock.user?.id;
  if (!myJid) return false;

  // Normalize JIDs (remove :device suffix)
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
