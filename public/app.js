const messageEl = document.getElementById("form-message");
const quickButtons = document.querySelectorAll(".quick-btn");
const sizeButtons = document.querySelectorAll(".size-btn");
const goRegisterBtn = document.getElementById("go-register");
const goRecordsBtn = document.getElementById("go-records");
const registerScreen = document.getElementById("screen-register");
const recordsScreen = document.getElementById("screen-records");
const filterDateInput = document.getElementById("filter-date");
const filterTypeSelect = document.getElementById("filter-type");
const filterSizeSelect = document.getElementById("filter-size");
const clearFilterBtn = document.getElementById("clear-filter");
const activeFiltersEl = document.getElementById("active-filters");
const summaryEl = document.getElementById("summary");
const typeSummaryEl = document.getElementById("type-summary");
const recordsList = document.getElementById("records-list");

const isLocalDevHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE = isLocalDevHost && window.location.port && window.location.port !== "3000"
  ? `${window.location.protocol}//${window.location.hostname}:3000`
  : "";

let selectedSize = localStorage.getItem("selectedSize") || "M";
let messageTimer = null;

function showScreen(screenName) {
  const isRegister = screenName === "register";

  registerScreen.classList.toggle("active", isRegister);
  recordsScreen.classList.toggle("active", !isRegister);
  goRegisterBtn.classList.toggle("active", isRegister);
  goRecordsBtn.classList.toggle("active", !isRegister);

  if (!isRegister) {
    loadRecords();
  }
}

function showMessage(text, isError = false) {
  if (messageTimer) {
    clearTimeout(messageTimer);
  }

  messageEl.textContent = text;
  messageEl.classList.remove("success", "error", "show");
  messageEl.classList.add(isError ? "error" : "success", "show");

  messageTimer = window.setTimeout(() => {
    messageEl.classList.remove("show");
  }, isError ? 3800 : 1900);
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(timeStr) {
  return timeStr || "";
}

function updateActiveFiltersText() {
  const parts = [];

  if (filterDateInput.value) {
    parts.push(`Data: ${formatDate(filterDateInput.value)}`);
  }

  if (filterTypeSelect.value) {
    parts.push(`Tipo: ${typeLabel(filterTypeSelect.value)}`);
  }

  if (filterSizeSelect.value) {
    parts.push(`Tamanho: ${filterSizeSelect.value}`);
  }

  activeFiltersEl.textContent = parts.length
    ? `Filtros ativos: ${parts.join(" | ")}`
    : "Filtros ativos: nenhum";
}

async function loadRecords() {
  updateActiveFiltersText();

  const date = filterDateInput.value;
  const type = filterTypeSelect.value;
  const size = filterSizeSelect.value;

  const params = new URLSearchParams();
  if (date) {
    params.set("date", date);
  }
  if (type) {
    params.set("type", type);
  }
  if (size) {
    params.set("size", size);
  }

  const queryString = params.toString();
  const url = queryString
    ? `${API_BASE}/api/records?${queryString}`
    : `${API_BASE}/api/records`;

  const response = await fetch(url);
  if (!response.ok) {
    summaryEl.textContent = "Erro ao carregar registros.";
    return;
  }

  const data = await response.json();
  renderSummary(data.total, data.count, date);
  renderTypeSummary(data.byType || { xixi: 0, coco: 0, ambos: 0 });
  renderRecords(data.records);
}

function renderSummary(total, count, date) {
  if (date) {
    summaryEl.textContent = `Em ${formatDate(date)}: ${total} fraldas em ${count} registro(s).`;
    return;
  }

  summaryEl.textContent = `Total geral: ${total} fraldas em ${count} registro(s).`;
}

function renderTypeSummary(byType) {
  typeSummaryEl.innerHTML = `
    <span class="pill">Xixi: ${byType.xixi || 0}</span>
    <span class="pill">Coco: ${byType.coco || 0}</span>
    <span class="pill">Os dois: ${byType.ambos || 0}</span>
  `;
}

function typeLabel(type) {
  if (type === "coco") {
    return "Coco";
  }

  if (type === "ambos") {
    return "Os dois";
  }

  return "Xixi";
}

function sizeLabel(size) {
  const sizeMap = {
    "RN": "Recém-nascido",
    "P": "Pequeno",
    "M": "Médio",
    "G": "Grande",
    "XG": "Extra Grande",
    "XXG": "Extra Extra Grande"
  };
  return sizeMap[size] || size;
}

function renderRecords(records) {
  recordsList.innerHTML = "";

  if (!records.length) {
    const empty = document.createElement("li");
    empty.textContent = "Nenhum registro encontrado.";
    recordsList.appendChild(empty);
    return;
  }

  for (const record of records) {
    const item = document.createElement("li");
    item.className = "record-item";

    const meta = document.createElement("div");
    meta.className = "record-meta";

    const date = document.createElement("span");
    date.className = "record-date";
    const timeStr = record.time_brasilia || formatTime(record.created_at);
    date.textContent = `${formatDate(record.date)} às ${timeStr}`;

    const qty = document.createElement("span");
    qty.className = "record-qty";
    qty.textContent = `${record.quantity} fralda(s) - ${typeLabel(record.type)} - Tamanho: ${sizeLabel(record.size)}`;

    meta.appendChild(date);
    meta.appendChild(qty);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "delete-btn";
    delBtn.textContent = "Excluir";
    delBtn.addEventListener("click", async () => {
      const confirmed = window.confirm("Deseja excluir este registro?");
      if (!confirmed) {
        return;
      }

      const response = await fetch(`${API_BASE}/api/records/${record.id}`, { method: "DELETE" });
      if (!response.ok) {
        showMessage("Não foi possível excluir.", true);
        return;
      }

      showMessage("Registro excluído com sucesso.");
      await loadRecords();
    });

    item.appendChild(meta);
    item.appendChild(delBtn);
    recordsList.appendChild(item);
  }
}

async function createQuickRecord(type) {
  const payload = {
    quantity: 1,
    type,
    size: selectedSize,
  };

  try {
    const response = await fetch(`${API_BASE}/api/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Erro ao salvar." }));
      const errorMsg = err.error || `Erro HTTP ${response.status}`;
      showMessage(errorMsg, true);
      console.error("Erro na requisição:", { status: response.status, ...err });
      return false;
    }

    const data = await response.json();
    showMessage(`+1 ${typeLabel(type)} registrado com sucesso.`);
    await loadRecords();
    return true;
  } catch (error) {
    showMessage(`Erro de conexão: ${error.message}`, true);
    console.error("Erro ao criar registro:", error);
    return false;
  }
}

for (const button of quickButtons) {
  button.addEventListener("click", async () => {
    const { type } = button.dataset;
    const ok = await createQuickRecord(type);
    if (ok) {
      button.classList.remove("success-pulse");
      // Forca reflow para repetir a animacao em toques seguidos.
      void button.offsetWidth;
      button.classList.add("success-pulse");
    }
  });
}

for (const button of sizeButtons) {
  button.addEventListener("click", () => {
    const { size } = button.dataset;
    selectedSize = size;
    localStorage.setItem("selectedSize", selectedSize);

    sizeButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
  });
}

function initializeSize() {
  const activeSizeBtn = document.querySelector(`[data-size="${selectedSize}"]`);
  if (activeSizeBtn) {
    sizeButtons.forEach((btn) => btn.classList.remove("active"));
    activeSizeBtn.classList.add("active");
  }
}

goRegisterBtn.addEventListener("click", () => {
  showScreen("register");
});

goRecordsBtn.addEventListener("click", () => {
  showScreen("records");
});

filterDateInput.addEventListener("change", loadRecords);
filterTypeSelect.addEventListener("change", loadRecords);
filterSizeSelect.addEventListener("change", loadRecords);
clearFilterBtn.addEventListener("click", async () => {
  filterDateInput.value = "";
  filterTypeSelect.value = "";
  filterSizeSelect.value = "";
  await loadRecords();
});

showScreen("register");
initializeSize();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    } catch (error) {
      console.error("Falha ao limpar service workers antigos:", error);
    }
  });
}
