import { shouldHandle } from "./crm.js";
import type { ZapiWebhook } from "./zapi.js";

const base: ZapiWebhook = {
  type: "ReceivedCallback",
  messageId: "ABC123",
  phone: "5521999999999",
  fromMe: false,
  isGroup: false,
  momment: Date.now(),
  audio: { audioUrl: "https://exemplo/audio.ogg", mimeType: "audio/ogg", seconds: 30, ptt: true },
};

const casos: [string, ZapiWebhook, boolean][] = [
  ["áudio do dono", base, true],
  ["áudio de outro número (cliente do Zona Sul)", { ...base, phone: "5511888887777" }, false],
  ["texto do dono", { ...base, audio: undefined, text: { message: "oi" } }, false],
  ["mensagem enviada por nós (eco)", { ...base, fromMe: true }, false],
  ["grupo", { ...base, isGroup: true }, false],
  ["áudio antigo reentregue", { ...base, momment: Date.now() - 60 * 60 * 1000 }, false],
  ["telefone com máscara", { ...base, phone: "+55 (21) 99999-9999" }, true],
];

let falhas = 0;
for (const [nome, payload, esperado] of casos) {
  const real = shouldHandle(payload);
  const ok = real === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome} -> ${real} (esperado ${esperado})`);
}
console.log(falhas === 0 ? "\ntodos passaram" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
