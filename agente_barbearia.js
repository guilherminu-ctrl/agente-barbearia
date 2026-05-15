// ============================================
// AGENTE VIRTUAL - BARBEARIA
// Integração Z-API + Claude
// ============================================

const express = require("express");
const app = express();
app.use(express.json());

// ── Configurações Z-API ──────────────────────
const ZAPI_URL = "https://api.z-api.io/instances/3F3288DA6737F16864EC82171A0617F6/token/7CF3DEA9ABC54643813159A7/send-text";
const ZAPI_CLIENT_TOKEN = "7CF3DEA9ABC54643813159A7";

// ── Configurações Claude ─────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // Configurar no Railway como variável de ambiente

// ── Contexto da barbearia ────────────────────
const SYSTEM_PROMPT = `Você é um agente virtual simpático e ágil de uma barbearia moderna em Uberlândia-MG. Responda sempre em português brasileiro de forma breve, amigável e direta. Nunca enrole.

Informações da barbearia:
- Serviços: Corte R$45 | Barba R$35 | Corte+Barba R$70 | Hidratação R$30
- Horário: Seg-Sex 9h-20h | Sáb 9h-18h | Dom fechado
- Agendamento: diga ao cliente para acessar o link do sistema para ver horários reais e agendar

Suas funções:
1. Responder dúvidas sobre serviços e preços na hora
2. Indicar como agendar (pelo sistema online)
3. Confirmar informações básicas
4. Se não souber responder algo, dizer: "Vou chamar o responsável agora, um momento!"

Regras importantes:
- Respostas curtas (máximo 5 linhas)
- Use emojis com moderação (1-2 por mensagem)
- Se o cliente reclamar de algo, NÃO tente resolver — diga que vai chamar o responsável
- Se pedir desconto ou condição especial, diga que vai verificar com o responsável
- Nunca invente informações que não estão aqui`;

// ── Memória de conversas (em memória, reseta ao reiniciar) ──
const conversas = {};

// ── Palavras que escalam para o dono ─────────
const ESCALAR = ["reclamação", "problema", "errou", "horrível", "péssimo", "desconto", "promoção", "reembolso", "cancelar", "urgente"];

function precisaEscalar(msg) {
  return ESCALAR.some(p => msg.toLowerCase().includes(p));
}

// ── Envia mensagem via Z-API ──────────────────
async function enviarMensagem(telefone, texto) {
  const res = await fetch(ZAPI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": ZAPI_CLIENT_TOKEN
    },
    body: JSON.stringify({ phone: telefone, message: texto })
  });
  return res.json();
}

// ── Chama o agente Claude ─────────────────────
async function chamarAgente(telefone, mensagemCliente) {
  if (!conversas[telefone]) conversas[telefone] = [];

  conversas[telefone].push({ role: "user", content: mensagemCliente });

  // Mantém só as últimas 10 mensagens para não estourar contexto
  if (conversas[telefone].length > 10) {
    conversas[telefone] = conversas[telefone].slice(-10);
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: conversas[telefone]
    })
  });

  const data = await res.json();
  console.log("ERRO API:", JSON.stringify(data));
  const resposta = data.content?.[0]?.text || "Desculpe, tive um problema técnico. Um momento!";

  conversas[telefone].push({ role: "assistant", content: resposta });

  return resposta;
}

// ── Webhook — recebe mensagens do Z-API ───────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Responde imediato pro Z-API não reenviar

  try {
    const body = req.body;

    // Ignora mensagens enviadas pelo próprio número
    if (body.fromMe) return;

    // Ignora mensagens de grupo
    if (body.isGroup) return;

    const telefone = body.phone;
    const texto = body.text?.message || body.text || "";

    if (!telefone || !texto) return;

    console.log(`📩 [${telefone}]: ${texto}`);

    // Verifica se precisa escalar para o dono
    if (precisaEscalar(texto)) {
      await enviarMensagem(telefone, "Entendo! Vou chamar o responsável agora para te atender pessoalmente. Um momento! 🙏");
      console.log(`⚠️ ESCALAR para o dono — cliente: ${telefone} — mensagem: ${texto}`);
      // Aqui você pode adicionar uma notificação para você mesmo (ex: Telegram, e-mail)
      return;
    }

    // Chama o agente e envia resposta
    const resposta = await chamarAgente(telefone, texto);
    await enviarMensagem(telefone, resposta);

    console.log(`✅ Respondido [${telefone}]: ${resposta}`);

  } catch (err) {
    console.error("Erro no webhook:", err);
  }
});

// ── Rota de teste ─────────────────────────────
app.get("/", (req, res) => {
  res.send("✅ Agente da barbearia online!");
});

// ── Inicia o servidor ─────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Agente rodando na porta ${PORT}`);
});
