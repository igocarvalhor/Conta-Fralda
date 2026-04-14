const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const dbPath = path.join(__dirname, "data", "fraldas.db");
const db = new sqlite3.Database(dbPath);

const VALID_TYPES = ["xixi", "coco", "ambos"];
const VALID_SIZES = ["RN", "P", "M", "G", "XG", "XXG"];

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'xixi',
      size TEXT NOT NULL DEFAULT 'M',
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migra bancos antigos adicionando colunas quando elas nao existirem.
  db.all("PRAGMA table_info(records)", (err, columns) => {
    if (err) {
      console.error("Erro ao verificar estrutura da tabela records:", err.message);
      return;
    }

    const hasTypeColumn = columns.some((column) => column.name === "type");
    const hasSizeColumn = columns.some((column) => column.name === "size");

    if (!hasTypeColumn) {
      db.run("ALTER TABLE records ADD COLUMN type TEXT NOT NULL DEFAULT 'xixi'", (alterErr) => {
        if (alterErr) {
          console.error("Erro ao migrar coluna type:", alterErr.message);
        }
      });
    }

    if (!hasSizeColumn) {
      db.run("ALTER TABLE records ADD COLUMN size TEXT NOT NULL DEFAULT 'M'", (alterErr) => {
        if (alterErr) {
          console.error("Erro ao migrar coluna size:", alterErr.message);
        }
      });
    }
  });
});

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
  const date = new Date(datetimeStr + "Z");
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  });
  return formatter.format(date);
}

app.get("/api/records", (req, res) => {
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

  const filters = [];
  const params = [];

  if (date) {
    filters.push("date = ?");
    params.push(date);
  }

  if (parsedType) {
    filters.push("type = ?");
    params.push(parsedType);
  }

  if (parsedSize) {
    filters.push("size = ?");
    params.push(parsedSize);
  }

  const whereClause = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const sql = `SELECT id, date, type, size, quantity, created_at FROM records${whereClause} ORDER BY date DESC, id DESC`;

  db.all(sql, params, (err, rows) => {
    if (err) {
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
});

app.post("/api/records", (req, res) => {
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

  db.run(
    "INSERT INTO records (date, type, size, quantity) VALUES (?, ?, ?, ?)",
    [parsedDate, parsedType, parsedSize, parsedQuantity],
    function onInsert(err) {
      if (err) {
        return res.status(500).json({ error: "Erro ao salvar registro." });
      }

      return res.status(201).json({
        id: this.lastID,
        date: parsedDate,
        type: parsedType,
        size: parsedSize,
        quantity: parsedQuantity,
      });
    }
  );
});

app.delete("/api/records/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID inválido." });
  }

  db.run("DELETE FROM records WHERE id = ?", [id], function onDelete(err) {
    if (err) {
      return res.status(500).json({ error: "Erro ao excluir registro." });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Registro não encontrado." });
    }

    return res.status(204).send();
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
