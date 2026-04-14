const SUPABASE_URL = "https://ipvaoatvdwcmvlsrdsga.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RKh6S7lNFIhSEVF8RDJXsA_6hZBuYQA";

const authShell = document.getElementById("auth-shell");
const appShell = document.getElementById("app-shell");
const showLoginBtn = document.getElementById("show-login");
const showSignupBtn = document.getElementById("show-signup");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const authMessageEl = document.getElementById("auth-message");
const logoutButton = document.getElementById("logout-button");
const currentUserEl = document.getElementById("current-user");
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
const goStockBtn = document.getElementById("go-stock");
const stockScreen = document.getElementById("screen-stock");
const stockListEl = document.getElementById("stock-list");
const stockIndicatorEl = document.getElementById("stock-indicator");

const isLocalDevHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE = isLocalDevHost && window.location.port && window.location.port !== "3000"
  ? `${window.location.protocol}//${window.location.hostname}:3000`
  : "";

const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let selectedSize = localStorage.getItem("selectedSize") || "M";
let messageTimer = null;
let currentSession = null;
let stockData = {};

const VALID_SIZES_ARR = ["RN", "P", "M", "G", "XG", "XXG"];
const SIZE_NAMES = {
  RN: "Recém-nascido",
  P: "Pequeno",
  M: "Médio",
  G: "Grande",
  XG: "Extra Grande",
  XXG: "Extra Extra Grande",
};

function showScreen(screenName) {
  registerScreen.classList.toggle("active", screenName === "register");
  recordsScreen.classList.toggle("active", screenName === "records");
  stockScreen.classList.toggle("active", screenName === "stock");
  goRegisterBtn.classList.toggle("active", screenName === "register");
  goRecordsBtn.classList.toggle("active", screenName === "records");
  goStockBtn.classList.toggle("active", screenName === "stock");

  if (screenName === "records" && currentSession) {
    loadRecords();
  }
  if (screenName === "stock" && currentSession) {
    loadStock();
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

function showAuthMessage(text, isError = false) {
  authMessageEl.textContent = text;
  authMessageEl.style.color = isError ? "#8b2626" : "#275340";
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(timeStr) {
  return timeStr || "";
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
    RN: "Recém-nascido",
    P: "Pequeno",
    M: "Médio",
    G: "Grande",
    XG: "Extra Grande",
    XXG: "Extra Extra Grande",
  };

  return sizeMap[size] || size;
}

function showAuthTab(mode) {
  const isLogin = mode === "login";

  showLoginBtn.classList.toggle("active", isLogin);
  showSignupBtn.classList.toggle("active", !isLogin);
  loginForm.classList.toggle("active", isLogin);
  signupForm.classList.toggle("active", !isLogin);
  showAuthMessage("");
}

function setAuthenticatedView(session) {
  currentSession = session;
  const isAuthenticated = Boolean(session?.access_token && session?.user);

  authShell.classList.toggle("hidden", isAuthenticated);
  appShell.classList.toggle("hidden", !isAuthenticated);

  if (isAuthenticated) {
    currentUserEl.textContent = session.user.email || "Conta ativa";
    showScreen("register");
    loadRecords();
    loadStock();
    return;
  }

  currentUserEl.textContent = "";
  summaryEl.textContent = "Faça login para ver seus registros.";
  typeSummaryEl.innerHTML = "";
  recordsList.innerHTML = "";
}

function getAuthHeaders() {
  if (!currentSession?.access_token) {
    return {};
  }

  return {
    Authorization: `Bearer ${currentSession.access_token}`,
  };
}

function handleUnauthorized() {
  setAuthenticatedView(null);
  showAuthTab("login");
  showAuthMessage("Sua sessão expirou. Entre novamente.", true);
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
  if (!currentSession) {
    return;
  }

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

  const response = await fetch(url, {
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (response.status === 401) {
    handleUnauthorized();
    return;
  }

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

      const response = await fetch(`${API_BASE}/api/records/${record.id}`, {
        method: "DELETE",
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

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
  if (!currentSession) {
    handleUnauthorized();
    return false;
  }

  const payload = {
    quantity: 1,
    type,
    size: selectedSize,
  };

  try {
    const response = await fetch(`${API_BASE}/api/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      handleUnauthorized();
      return false;
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Erro ao salvar." }));
      const errorMsg = err.error || `Erro HTTP ${response.status}`;
      showMessage(errorMsg, true);
      console.error("Erro na requisição:", { status: response.status, ...err });
      return false;
    }

    const result = await response.json();

    // Update local stock cache if backend returned stock info
    if (result.stock) {
      if (!stockData[selectedSize]) {
        stockData[selectedSize] = { low_threshold: 5, usage7d: 0 };
      }
      stockData[selectedSize].quantity = result.stock.quantity;
      stockData[selectedSize].low_threshold = result.stock.low_threshold;
      updateStockIndicator();
      if (stockScreen && stockScreen.classList.contains("active")) {
        renderStock(stockData);
      }
    }

    if (result.stock && result.stock.quantity === 0) {
      showMessage(`+1 ${typeLabel(type)} • ⛔ Sem estoque tamanho ${selectedSize}!`, true);
    } else if (result.stock && result.stock.is_low) {
      showMessage(`+1 ${typeLabel(type)} • ⚠️ Estoque ${selectedSize}: ${result.stock.quantity} restantes`);
    } else {
      showMessage(`+1 ${typeLabel(type)} registrado.`);
    }

    await loadRecords();
    return true;
  } catch (error) {
    showMessage(`Erro de conexão: ${error.message}`, true);
    console.error("Erro ao criar registro:", error);
    return false;
  }
}

function updateStockIndicator() {
  if (!stockIndicatorEl) {
    return;
  }

  const entry = stockData[selectedSize];
  if (!entry) {
    stockIndicatorEl.textContent = "";
    stockIndicatorEl.className = "stock-indicator";
    return;
  }

  const { quantity, low_threshold } = entry;
  const isEmpty = quantity === 0;
  const isLow = quantity <= low_threshold;

  if (isEmpty) {
    stockIndicatorEl.textContent = `⛔ Sem estoque tamanho ${selectedSize}`;
    stockIndicatorEl.className = "stock-indicator stock-indicator-empty";
  } else if (isLow) {
    stockIndicatorEl.textContent = `⚠️ Estoque ${selectedSize}: ${quantity} unidades (baixo)`;
    stockIndicatorEl.className = "stock-indicator stock-indicator-low";
  } else {
    stockIndicatorEl.textContent = `📦 Estoque ${selectedSize}: ${quantity} unidades`;
    stockIndicatorEl.className = "stock-indicator";
  }
}

async function loadStock() {
  if (!currentSession) {
    return;
  }

  const response = await fetch(`${API_BASE}/api/stock`, {
    headers: { ...getAuthHeaders() },
  });

  if (response.status === 401) {
    handleUnauthorized();
    return;
  }

  if (!response.ok) {
    return;
  }

  stockData = await response.json();
  updateStockIndicator();
  renderStock(stockData);
}

async function saveStockEntry(size, quantity, low_threshold) {
  const response = await fetch(`${API_BASE}/api/stock/${size}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ quantity, low_threshold }),
  });

  if (response.status === 401) {
    handleUnauthorized();
    return false;
  }

  return response.ok;
}

function renderStock(stock) {
  if (!stockListEl) {
    return;
  }

  stockListEl.innerHTML = "";

  for (const size of VALID_SIZES_ARR) {
    const entry = stock[size] || { quantity: 0, low_threshold: 5, usage7d: 0 };
    const { quantity, low_threshold, usage7d } = entry;
    const avgPerDay = usage7d / 7;
    const daysLeft = avgPerDay > 0 ? Math.floor(quantity / avgPerDay) : null;
    const suggestedBuy = avgPerDay > 0 ? Math.ceil(avgPerDay * 30) : null;
    const isEmpty = quantity === 0;
    const isLow = quantity <= low_threshold;

    const barMax = Math.max(quantity * 1.2, low_threshold * 4, 20);
    const barPct = quantity === 0 ? 0 : Math.min(100, Math.round((quantity / barMax) * 100));

    let barClass = "stock-bar-fill";
    if (isEmpty) {
      barClass += " bar-empty";
    } else if (isLow) {
      barClass += " bar-low";
    } else {
      barClass += " bar-ok";
    }

    let cardClass = "card stock-card";
    if (isEmpty) {
      cardClass += " stock-card-empty";
    } else if (isLow) {
      cardClass += " stock-card-low";
    }

    const alertHtml = isEmpty
      ? `<p class="stock-alert stock-alert-empty">⛔ Sem estoque!</p>`
      : isLow
      ? `<p class="stock-alert stock-alert-low">⚠️ Estoque baixo (alerta: ${low_threshold} unid.)</p>`
      : "";

    const statsHtml = usage7d > 0
      ? `<div class="stock-stats">
          <span>Uso 7 dias: <strong>${usage7d}</strong></span>
          <span>Média: <strong>${avgPerDay.toFixed(1)}/dia</strong></span>
          ${daysLeft !== null ? `<span>Estimativa: <strong>${daysLeft} dia(s)</strong></span>` : ""}
          ${suggestedBuy !== null ? `<div class="stock-suggestion">💡 Sugestão: comprar ~${suggestedBuy} unidades para 30 dias</div>` : ""}
        </div>`
      : `<div class="stock-stats stock-stats-muted"><span>Sem uso recente para calcular médias.</span></div>`;

    const card = document.createElement("section");
    card.className = cardClass;
    card.innerHTML = `
      <div class="stock-card-header">
        <div class="stock-card-title">
          <span class="stock-size-badge">${size}</span>
          <span class="stock-size-name">${SIZE_NAMES[size]}</span>
        </div>
        <div class="stock-qty-display${isEmpty ? " qty-empty" : isLow ? " qty-low" : ""}">${quantity}</div>
      </div>
      <div class="stock-bar-wrap" aria-hidden="true">
        <div class="${barClass}" style="width:${barPct}%"></div>
      </div>
      ${alertHtml}
      <div class="stock-controls">
        <button class="stock-adj-btn" data-size="${size}" data-delta="-1" type="button" aria-label="Diminuir 1">−</button>
        <input class="stock-qty-input" type="number" min="0" max="9999" value="${quantity}" data-size="${size}" aria-label="Quantidade ${size}" />
        <button class="stock-adj-btn" data-size="${size}" data-delta="1" type="button" aria-label="Aumentar 1">+</button>
        <button class="stock-save-btn" data-size="${size}" type="button">Salvar</button>
      </div>
      <div class="stock-threshold-row">
        <label for="threshold-${size}">Alerta abaixo de:</label>
        <input class="stock-threshold-input" id="threshold-${size}" type="number" min="0" max="999" value="${low_threshold}" data-size="${size}" aria-label="Limite de alerta ${size}" />
        <span class="stock-threshold-unit">unidades</span>
      </div>
      ${statsHtml}
    `;

    stockListEl.appendChild(card);
  }

  stockListEl.querySelectorAll(".stock-adj-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { size, delta } = btn.dataset;
      const input = stockListEl.querySelector(`.stock-qty-input[data-size="${size}"]`);
      if (input) {
        input.value = Math.max(0, Number(input.value) + Number(delta));
      }
    });
  });

  stockListEl.querySelectorAll(".stock-save-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { size } = btn.dataset;
      const qtyInput = stockListEl.querySelector(`.stock-qty-input[data-size="${size}"]`);
      const threshInput = stockListEl.querySelector(`.stock-threshold-input[data-size="${size}"]`);
      const qty = Math.max(0, Math.floor(Number(qtyInput ? qtyInput.value : 0)));
      const threshold = Math.max(0, Math.floor(Number(threshInput ? threshInput.value : 5)));

      btn.disabled = true;
      btn.textContent = "Salvando...";

      const ok = await saveStockEntry(size, qty, threshold);

      btn.disabled = false;
      btn.textContent = "Salvar";

      if (ok) {
        if (!stockData[size]) {
          stockData[size] = { usage7d: 0 };
        }
        stockData[size].quantity = qty;
        stockData[size].low_threshold = threshold;
        updateStockIndicator();
        renderStock(stockData);
        showMessage(`Estoque ${size} salvo: ${qty} unidades.`);
      } else {
        showMessage("Não foi possível salvar o estoque.", true);
      }
    });
  });
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const { session, error } = await authClient.auth.signIn({ email, password });
  if (error) {
    showAuthMessage(error.message || "Não foi possível entrar.", true);
    return;
  }

  setAuthenticatedView(session);
  showAuthMessage("");
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  const formData = new FormData(signupForm);
  const email = String(formData.get("email") || "").trim();
  const phoneRaw = String(formData.get("phone") || "").trim();
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  const password = String(formData.get("password") || "");
  const passwordConfirm = String(formData.get("passwordConfirm") || "");

  if (phoneDigits.length < 10) {
    showAuthMessage("Informe um telefone válido com DDD.", true);
    return;
  }

  if (password !== passwordConfirm) {
    showAuthMessage("As senhas não conferem.", true);
    return;
  }

  const signupResponse = await fetch(`${API_BASE}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      phone: phoneRaw,
    }),
  });

  if (!signupResponse.ok) {
    const errorPayload = await signupResponse.json().catch(() => ({ error: "Não foi possível criar a conta." }));
    showAuthMessage(errorPayload.error || "Não foi possível criar a conta.", true);
    return;
  }

  const { session, error } = await authClient.auth.signIn({ email, password });
  if (error || !session) {
    showAuthMessage("Conta criada. Entre com seu e-mail e senha.");
    showAuthTab("login");
    loginForm.reset();
    return;
  }

  setAuthenticatedView(session);
  showAuthMessage("");
}

for (const button of quickButtons) {
  button.addEventListener("click", async () => {
    const { type } = button.dataset;
    const ok = await createQuickRecord(type);
    if (ok) {
      button.classList.remove("success-pulse");
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
    updateStockIndicator();
  });
}

function initializeSize() {
  const activeSizeBtn = document.querySelector(`[data-size="${selectedSize}"]`);
  if (activeSizeBtn) {
    sizeButtons.forEach((btn) => btn.classList.remove("active"));
    activeSizeBtn.classList.add("active");
  }
}

showLoginBtn.addEventListener("click", () => {
  showAuthTab("login");
});

showSignupBtn.addEventListener("click", () => {
  showAuthTab("signup");
});

loginForm.addEventListener("submit", handleLoginSubmit);
signupForm.addEventListener("submit", handleSignupSubmit);
logoutButton.addEventListener("click", async () => {
  const { error } = await authClient.auth.signOut();
  if (error) {
    showMessage("Não foi possível sair da conta.", true);
    return;
  }

  setAuthenticatedView(null);
  showAuthTab("login");
  showAuthMessage("Você saiu da conta.");
});

goRegisterBtn.addEventListener("click", () => {
  showScreen("register");
});

goRecordsBtn.addEventListener("click", () => {
  showScreen("records");
});

goStockBtn.addEventListener("click", () => {
  showScreen("stock");
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

showAuthTab("login");
showScreen("register");
initializeSize();
updateActiveFiltersText();
setAuthenticatedView(authClient.auth.session());

authClient.auth.onAuthStateChange((_event, session) => {
  setAuthenticatedView(session);
});

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
