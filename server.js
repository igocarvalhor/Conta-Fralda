const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      autoRefreshToken: false,
      persistSession: false,
    })
  : null;

const VALID_TYPES = ["xixi", "coco", "ambos"];
const VALID_SIZES = ["RN", "P", "M", "G", "XG", "XXG"];

app.use(express.json());

// Permite uso do frontend em outra porta (ex.: Live Server na 5501) durante o desenvolvimento.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.static(path.join(__dirname, "public")));

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function getTodayDateISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInBrasilia(datetimeStr) {
  if (!datetimeStr) return "";
  const date = new Date(datetimeStr);
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  });
  return formatter.format(date);
}

function ensureSupabaseConfigured(res) {
  if (supabase) {
    return true;
  }

  res.status(500).json({
    error: "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
  });
  return false;
}

async function supabaseAdminRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  return { response, payload };
}

app.post("/api/auth/signup", async (req, res) => {
  if (!ensureSupabaseConfigured(res)) {
    return;
  }

  const rawEmail = String(req.body?.email || "").trim().toLowerCase();
  const rawPassword = String(req.body?.password || "");
  const rawPhone = String(req.body?.phone || "").trim();
  const phoneDigits = rawPhone.replace(/\D/g, "");

  if (!rawEmail || !rawPassword) {
    return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
  }

  if (rawPassword.length < 6) {
    return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
  }

  if (phoneDigits.length < 10) {
    return res.status(400).json({ error: "Informe um telefone válido com DDD." });
  }

  const { data: phoneExists, error: phoneCheckError } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone_digits", phoneDigits)
    .limit(1);

  if (phoneCheckError) {
    return res.status(500).json({ error: "Não foi possível validar o telefone." });
  }

  if (phoneExists && phoneExists.length > 0) {
    return res.status(409).json({ error: "Telefone já cadastrado." });
  }

  const { response: createResponse, payload: createdUser } = await supabaseAdminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email: rawEmail,
      password: rawPassword,
      email_confirm: true,
    },
  });

  if (!createResponse.ok || !createdUser?.id) {
    const message = String(createdUser?.msg || createdUser?.message || "").toLowerCase();
    if (createResponse.status === 422 || message.includes("already") || message.includes("registered")) {
      return res.status(409).json({ error: "E-mail já cadastrado." });
    }
    return res.status(500).json({ error: "Não foi possível criar a conta." });
  }

  const { error: profileInsertError } = await supabase
    .from("profiles")
    .insert([
      {
        id: createdUser.id,
        email: rawEmail,
        phone: rawPhone,
        phone_digits: phoneDigits,
      },
    ]);

  if (profileInsertError) {
    await supabaseAdminRequest(`/auth/v1/admin/users/${createdUser.id}`, {
      method: "DELETE",
    });

    if (String(profileInsertError.message || "").toLowerCase().includes("duplicate")) {
      return res.status(409).json({ error: "Telefone já cadastrado." });
    }

    return res.status(500).json({ error: "Conta criada parcialmente. Tente novamente." });
  }

  return res.status(201).json({ ok: true });
});

async function getAuthenticatedUser(req, res) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Faça login para continuar." });
    return null;
  }

  const accessToken = authHeader.slice("Bearer ".length).trim();
  if (!accessToken) {
    res.status(401).json({ error: "Sessão inválida. Entre novamente." });
    return null;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      res.status(401).json({ error: "Sessão inválida. Entre novamente." });
      return null;
    }

    return await response.json();
  } catch (error) {
    res.status(500).json({ error: "Não foi possível validar a sessão." });
    return null;
  }
}

app.get("/api/records", async (req, res) => {
  if (!ensureSupabaseConfigured(res)) {
    return;
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const { date, type, size } = req.query;

  if (date && !isValidDate(date)) {
    return res.status(400).json({ error: "Data inválida. Use YYYY-MM-DD." });
  }

  const parsedType = type ? String(type).trim().toLowerCase() : "";
  if (parsedType && !VALID_TYPES.includes(parsedType)) {
    return res.status(400).json({ error: "Tipo inválido. Use xixi, coco ou ambos." });
  }

  const parsedSize = size ? String(size).trim().toUpperCase() : "";
  if (parsedSize && !VALID_SIZES.includes(parsedSize)) {
    return res.status(400).json({ error: "Tamanho inválido. Use RN, P, M, G, XG ou XXG." });
  }

  let query = supabase
    .from("records")
    .select("id,date,type,size,quantity,created_at")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .order("id", { ascending: false });

  if (date) {
    query = query.eq("date", date);
  }

  if (parsedType) {
    query = query.eq("type", parsedType);
  }

  if (parsedSize) {
    query = query.eq("size", parsedSize);
  }

  const { data: rows, error } = await query;
  if (error) {
    return res.status(500).json({ error: "Erro ao buscar registros." });
  }

  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  const byType = { xixi: 0, coco: 0, ambos: 0 };

  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(byType, row.type)) {
      byType[row.type] += row.quantity;
    }
    row.time_brasilia = formatTimeInBrasilia(row.created_at);
  }

  return res.json({
    total,
    count: rows.length,
    byType,
    records: rows,
  });
});

app.post("/api/records", async (req, res) => {
  if (!ensureSupabaseConfigured(res)) {
    return;
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const { quantity, type, size } = req.body;
  const parsedDate = getTodayDateISO();

  const parsedQuantity = Number(quantity);
  if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
    return res.status(400).json({ error: "Quantidade deve ser um inteiro maior que zero." });
  }

  const parsedType = String(type || "xixi").trim().toLowerCase();
  if (!VALID_TYPES.includes(parsedType)) {
    return res.status(400).json({ error: "Tipo inválido. Use xixi, coco ou ambos." });
  }

  const parsedSize = String(size || "M").toUpperCase().trim();
  if (!VALID_SIZES.includes(parsedSize)) {
    return res.status(400).json({ error: "Tamanho inválido. Use RN, P, M, G, XG ou XXG." });
  }

  const { data, error } = await supabase
    .from("records")
    .insert([
      {
        user_id: user.id,
        date: parsedDate,
        type: parsedType,
        size: parsedSize,
        quantity: parsedQuantity,
      },
    ], { returning: "representation" });

  if (error) {
    return res.status(500).json({ error: "Erro ao salvar registro." });
  }

  // Decrement stock for the registered size (best-effort – never fails the request)
  let stockInfo = null;
  try {
    const { data: stockRows } = await supabase
      .from("stock")
      .select("quantity,low_threshold")
      .eq("user_id", user.id)
      .eq("size", parsedSize)
      .limit(1);

    if (stockRows && stockRows.length > 0) {
      const currentQty = stockRows[0].quantity;
      const lowThreshold = stockRows[0].low_threshold;
      const newQty = Math.max(0, currentQty - parsedQuantity);

      await supabase
        .from("stock")
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("size", parsedSize);

      stockInfo = { quantity: newQty, low_threshold: lowThreshold, is_low: newQty <= lowThreshold };
    }
  } catch (_stockErr) {
    // Best-effort: stock decrement never blocks the main operation
  }

  const record = data[0];
  record.time_brasilia = formatTimeInBrasilia(record.created_at);
  return res.status(201).json({ ...record, stock: stockInfo });
});

app.delete("/api/records/:id", async (req, res) => {
  if (!ensureSupabaseConfigured(res)) {
    return;
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID inválido." });
  }

  const { data: existing, error: findError } = await supabase
    .from("records")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .limit(1);

  if (findError) {
    return res.status(500).json({ error: "Erro ao excluir registro." });
  }

  if (!existing || existing.length === 0) {
    return res.status(404).json({ error: "Registro não encontrado." });
  }

  const { error } = await supabase
    .from("records")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return res.status(500).json({ error: "Erro ao excluir registro." });
  }

  return res.status(204).send();
});

app.get("/api/stock", async (req, res) => {
  if (!ensureSupabaseConfigured(res)) {
    return;
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const { data: stockRows, error: stockError } = await supabase
    .from("stock")
    .select("size,quantity,low_threshold")
    .eq("user_id", user.id);

  if (stockError) {
    return res.status(500).json({ error: "Erro ao buscar estoque." });
  }

  // Compute 7-day usage per size from recent records
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoISO = sevenDaysAgo.toISOString().split("T")[0];

  const { data: recentRecords } = await supabase
    .from("records")
    .select("size,quantity")
    .eq("user_id", user.id)
    .gte("date", sevenDaysAgoISO);

  const usage7d = {};
  for (const s of VALID_SIZES) {
    usage7d[s] = 0;
  }
  for (const record of (recentRecords || [])) {
    if (Object.prototype.hasOwnProperty.call(usage7d, record.size)) {
      usage7d[record.size] += record.quantity;
    }
  }

  const result = {};
  for (const s of VALID_SIZES) {
    result[s] = { quantity: 0, low_threshold: 5, usage7d: usage7d[s] };
  }
  for (const row of (stockRows || [])) {
    result[row.size] = {
      quantity: row.quantity,
      low_threshold: row.low_threshold,
      usage7d: usage7d[row.size],
    };
  }

  return res.json(result);
});

app.put("/api/stock/:size", async (req, res) => {
  if (!ensureSupabaseConfigured(res)) {
    return;
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const size = String(req.params.size || "").toUpperCase().trim();
  if (!VALID_SIZES.includes(size)) {
    return res.status(400).json({ error: "Tamanho inválido. Use RN, P, M, G, XG ou XXG." });
  }

  const rawQuantity = req.body?.quantity;
  if (rawQuantity === undefined || rawQuantity === null) {
    return res.status(400).json({ error: "Informe a quantidade." });
  }

  const parsedQuantity = Number(rawQuantity);
  if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
    return res.status(400).json({ error: "Quantidade deve ser um inteiro não-negativo." });
  }

  const rawThreshold = req.body?.low_threshold;
  const parsedThreshold = rawThreshold !== undefined && rawThreshold !== null
    ? Number(rawThreshold)
    : 5;

  if (!Number.isInteger(parsedThreshold) || parsedThreshold < 0) {
    return res.status(400).json({ error: "Limite de alerta inválido." });
  }

  const { error } = await supabase
    .from("stock")
    .upsert(
      [{
        user_id: user.id,
        size,
        quantity: parsedQuantity,
        low_threshold: parsedThreshold,
        updated_at: new Date().toISOString(),
      }],
      { onConflict: "user_id,size" }
    );

  if (error) {
    return res.status(500).json({ error: "Erro ao atualizar estoque." });
  }

  return res.json({ ok: true, size, quantity: parsedQuantity, low_threshold: parsedThreshold });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
