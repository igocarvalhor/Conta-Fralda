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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

app.get("/api/records", async (req, res) => {
  if (!ensureSupabaseConfigured(res)) {
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
      date: parsedDate,
      type: parsedType,
      size: parsedSize,
      quantity: parsedQuantity,
      },
    ], { returning: "representation" });

  if (error) {
    return res.status(500).json({ error: "Erro ao salvar registro." });
  }

  return res.status(201).json(data[0]);
});

app.delete("/api/records/:id", async (req, res) => {
  if (!ensureSupabaseConfigured(res)) {
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
    .eq("id", id);

  if (error) {
    return res.status(500).json({ error: "Erro ao excluir registro." });
  }

  return res.status(204).send();
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
