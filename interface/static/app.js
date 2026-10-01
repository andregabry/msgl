function getSessionToken() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken) {
    sessionStorage.setItem("migrationToken", urlToken);
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch (_) {}
    return urlToken;
  }
  if (typeof window !== "undefined" && window.__MIGRATION_TOKEN__) {
    sessionStorage.setItem("migrationToken", window.__MIGRATION_TOKEN__);
    return window.__MIGRATION_TOKEN__;
  }
  return sessionStorage.getItem("migrationToken") || "";
}
let token = getSessionToken();

const state = {
  overview: null,
  selected: null,
  activeJob: null,
  pollTimer: null,
  activeTab: "operation",
  googleRetry: null,
  remoteSelections: {},
  flowSelectedGroups: new Set(),
  overviewAccountFilter: "all",
  overviewAccountSearch: "",
  flowAccountSearch: ""
};
const workspace = document.querySelector("#workspace");
const groupSelect = document.querySelector("#groupSelect");
const selectedGroupState = document.querySelector("#selectedGroupState");
const functionMenuButtons = [...document.querySelectorAll("[data-view]")];
const refreshButton = document.querySelector("#refreshButton");
const discoverGoogleGroupsButton = document.querySelector("#discoverGoogleGroupsButton");
const authenticateGoogleButton = document.querySelector("#authenticateGoogleButton");
const authenticateM365Button = document.querySelector("#authenticateM365Button");
const googleConnectionDot = document.querySelector("#googleConnectionDot");
const googleConnectionStatus = document.querySelector("#googleConnectionStatus");
const m365ConnectionDot = document.querySelector("#m365ConnectionDot");
const m365ConnectionStatus = document.querySelector("#m365ConnectionStatus");
const dependenciesDot = document.querySelector("#dependenciesDot");
const dependenciesStatus = document.querySelector("#dependenciesStatus");
const remoteDiscoveryStatus = document.querySelector("#remoteDiscoveryStatus");
const toast = document.querySelector("#errorToast");
const jobPanel = document.querySelector("#jobPanel");
const jobTitle = document.querySelector("#jobTitle");
const jobSubtitle = document.querySelector("#jobSubtitle");
const jobStatus = document.querySelector("#jobStatus");
const jobProgressText = document.querySelector("#jobProgressText");
const jobProgressBar = document.querySelector("#jobProgressBar");
const jobLog = document.querySelector("#jobLog");
const jobRecovery = document.querySelector("#jobRecovery");
const jobRecoveryTitle = document.querySelector("#jobRecoveryTitle");
const jobRecoveryText = document.querySelector("#jobRecoveryText");
const jobDeviceAuth = document.querySelector("#jobDeviceAuth");
const deviceAuthCode = document.querySelector("#deviceAuthCode");
const deviceAuthCopyBtn = document.querySelector("#deviceAuthCopyBtn");
const deviceAuthLink = document.querySelector("#deviceAuthLink");
const cancelJobButton = document.querySelector("#cancelJobButton");
const continueJobButton = document.querySelector("#continueJobButton");
const closeJobButton = document.querySelector("#closeJobButton");
const viewJobEvidenceButton = document.querySelector("#viewJobEvidenceButton");
const confirmDialog = document.querySelector("#confirmDialog");
const confirmTitle = document.querySelector("#confirmTitle");
const confirmMessage = document.querySelector("#confirmMessage");
const confirmAcknowledgement = document.querySelector("#confirmAcknowledgement");
const confirmCheckbox = document.querySelector("#confirmCheckbox");
const confirmCheckboxText = document.querySelector("#confirmCheckboxText");
const confirmButton = document.querySelector("#confirmButton");
const evidenceDialog = document.querySelector("#evidenceDialog");
const evidenceTitle = document.querySelector("#evidenceTitle");
const evidenceCategory = document.querySelector("#evidenceCategory");
const evidenceMeta = document.querySelector("#evidenceMeta");
const evidenceStatusBadge = document.querySelector("#evidenceStatusBadge");
const evidenceDuration = document.querySelector("#evidenceDuration");
const evidenceTimestamp = document.querySelector("#evidenceTimestamp");
const evidenceLog = document.querySelector("#evidenceLog");
const evidenceCopyBtn = document.querySelector("#evidenceCopyBtn");
const evidenceDownloadBtn = document.querySelector("#evidenceDownloadBtn");
const evidenceCloseBtn = document.querySelector("#evidenceCloseBtn");

const ACTIONS = {
  discover_remote_groups: { title: "Descobrir novos Google Groups", message: "O painel atualizará a lista administrativa de Google Groups e cruzará esses endereços com as pastas da exportação. Nenhum backup será baixado.", mutating: false },
  prepare: { title: "Preparar o backup", message: "O painel verificará os arquivos, recalculará os hashes e atualizará o manifesto local. Google e M365 não serão alterados.", mutating: false },
  remote_backup_inventory: { title: "Consultar backup no Google", message: "O painel usará a conta ativa do gcloud para listar os objetos deste grupo e comparar tamanho e MD5 com os arquivos locais. Nenhum download será feito.", mutating: false },
  gcloud_login: { title: "Autenticar Google Cloud", message: "O navegador abrirá o login do Google Cloud para a conta administrativa configurada e a credencial será guardada pelo gcloud somente neste computador.", mutating: false },
  m365_login: { title: "Autenticar Microsoft 365", message: "A Microsoft abrirá o login seguro do Exchange Online para validar a conta administrativa configurada.", mutating: false },
  download_backup: { title: "Baixar backup do Google", message: "Somente arquivos ausentes deste grupo serão baixados, verificados e registados no catálogo local. Arquivos divergentes nunca serão sobrescritos.", mutating: true },
  check_staging: { title: "Verificar a conta Google", message: "Será feita somente uma consulta à conta temporária do Google Workspace.", mutating: false },
  create_staging: { title: "Criar a conta temporária", message: "A conta será criada no Google Workspace com uma senha aleatória descartada. A licença com Gmail continuará sendo atribuída manualmente por você.", mutating: true },
  audit_staging: { title: "Auditar o Gmail temporário", message: "O painel comparará o Gmail com o diário local sem inserir ou remover mensagens.", mutating: false },
  clean_google_welcome: { title: "Remover mensagens automáticas do Gmail", message: "O painel removerá permanentemente somente mensagens automáticas conhecidas da Equipa do Gmail que não correspondem ao backup. Mensagens desconhecidas bloqueiam a operação.", mutating: true },
  load_test: { title: "Carregar 10 mensagens", message: "Até 10 mensagens ainda pendentes serão inseridas no Gmail temporário e verificadas individualmente.", mutating: true },
  load_all: { title: "Carregar todas as mensagens restantes", message: "As mensagens pendentes serão relidas do backup, inseridas no Gmail temporário e verificadas. O diário impede a repetição das mensagens já confirmadas.", mutating: true },
  repair_dates: { title: "Corrigir a mensagem com data rejeitada", message: "O painel criará uma substituta com a data histórica correta e o mesmo corpo e anexos. Somente depois de verificar a substituta, excluirá permanentemente do Gmail temporário a cópia que ficou com a data errada. O backup original não será alterado.", mutating: true },
  m365_status: { title: "Consultar o Microsoft 365", message: "O PowerShell abrirá a autenticação Microsoft e consultará a caixa de destino no Exchange (partilhada ou utilizador) e o lote. Nenhuma alteração será feita.", mutating: false },
  create_batch: { title: "Criar o lote sem iniciar", message: "O lote será criado no Exchange Online, mas permanecerá sem iniciar.", mutating: true },
  create_start_batch: { title: "Criar e iniciar o lote", message: "O Exchange Online criará o lote e iniciará a migração do Gmail temporário para a caixa de destino (partilhada ou utilizador).", mutating: true },
  m365_direct_import: { title: "Inserir E-mails Diretamente no M365", message: "Insere os e-mails canónicos do backup diretamente na caixa de destino do Microsoft 365 via Microsoft Graph API, sem necessidade de conta Google temporária, sem licença Gmail paga e sem lote de migração Exchange.", mutating: true },
  m365_direct_test: { title: "Teste: Inserir 10 E-mails no M365", message: "Insere 10 mensagens de teste diretamente na caixa de destino do Microsoft 365 via Microsoft Graph API para validação rápida.", mutating: true },
  sync_m365_mailboxes: { title: "Sincronizar Caixas do M365", message: "O PowerShell consultará as caixas de correio e grupos do Microsoft 365 e atualizará o catálogo local de destinatários.", mutating: false },
};

function formatNumber(value) {
  return new Intl.NumberFormat("pt-PT").format(Number(value || 0));
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return "Não disponível";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function readinessLabel(group) {
  if (
    group.readiness === "EXCHANGE_BATCH_COMPLETED" ||
    Boolean(group.direct_import_completed) ||
    (Number(group.target_current_items || 0) > 0 && Number(group.canonical_messages || 0) > 0 && Number(group.target_current_items) >= Number(group.canonical_messages))
  ) {
    return "Migração concluída";
  }
  if (group.remote_only && !group.remote_backup?.Objects?.length) return "Novo no Google";
  if (group.remote_only) return "Disponível para baixar";
  if (group.verification_failed > 0) return "Exige correção";
  if (!group.prepared) return "Por preparar";
  if (!group.google_account_checked) return "Conta Google não verificada";
  if (group.google_account_status === "NOT_FOUND") return "Conta temporária por criar";
  if (group.google_license_pending) return "Aguardando licença Gmail";
  if (!group.google_account_ready) return "Conta Google exige atenção";
  if (group.readiness === "REVIEW_GMAIL_UNTRACKED_MESSAGES") return "Gmail exige limpeza segura";
  if (!group.gmail_checked || !group.gmail_verified) return "Gmail não reconciliado";
  if (group.remaining_messages > 0) return "Carga incompleta";
  if (group.readiness === "EXCHANGE_BATCH_FAILED") return "Lote com falha";
  if (group.readiness === "EXCHANGE_BATCH_SYNCED") return "Lote sincronizado";
  if (group.readiness === "EXCHANGE_BATCH_SYNCING") return "Lote sincronizando";
  if (group.readiness === "EXCHANGE_BATCH_FOUND") return "Lote localizado";
  if (group.readiness === "EXCHANGE_BATCH_STARTED") return "Lote iniciado";
  if (group.readiness === "EXCHANGE_BATCH_CREATED") return "Lote criado";
  if (!group.exchange_checked) return "Pronto para verificar M365";
  return group.exchange_migration_found ? "Lote localizado" : "Pronto para criar lote";
}

function checkedLabel(checkedAt) {
  return checkedAt ? `Verificado em ${formatDate(checkedAt)}` : "Ainda não verificado de verdade";
}

function setText(root, selector, value) {
  if (!root) return;
  const el = root.querySelector(selector);
  if (el) el.textContent = (value !== null && value !== undefined) ? value : "";
}

function showLoading(title = "A carregar dados do sistema...", subtitle = "A sincronizar estado das contas, catálogo e conexões cloud.") {
  const overlay = document.getElementById("globalLoadingOverlay");
  if (!overlay) return;
  const tEl = document.getElementById("globalLoadingTitle");
  if (tEl) tEl.textContent = title;
  const sEl = document.getElementById("globalLoadingSubtitle");
  if (sEl) sEl.textContent = subtitle;
  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.remove("opacity-0", "pointer-events-none");
  overlay.classList.add("opacity-100", "pointer-events-auto");
}
window.showLoading = showLoading;

function hideLoading() {
  const overlay = document.getElementById("globalLoadingOverlay");
  if (!overlay) return;
  overlay.classList.remove("opacity-100", "pointer-events-auto");
  overlay.classList.add("opacity-0", "pointer-events-none");
  setTimeout(() => {
    if (overlay && overlay.classList.contains("opacity-0")) {
      overlay.style.display = "none";
    }
  }, 300);
}
window.hideLoading = hideLoading;

function showError(message, errorCode = "") {
  hideLoading();
  if (typeof Swal !== 'undefined') {
    if (errorCode === "GOOGLE_AUTH_EXPIRED") {
      Swal.fire({
        icon: 'warning',
        title: 'Sessão Google Expirada',
        text: message,
        showCancelButton: true,
        confirmButtonText: 'Autenticar Google Agora',
        cancelButtonText: 'Fechar',
        confirmButtonColor: '#005fb8',
        backdrop: 'rgba(10, 24, 38, 0.65)'
      }).then((res) => {
        if (res.isConfirmed) {
          jobPanel.hidden = true;
          runGlobalAction("gcloud_login");
        }
      });
      return;
    }
    if (errorCode === "M365_AUTH_EXPIRED") {
      Swal.fire({
        icon: 'warning',
        title: 'Sessão Microsoft 365 Expirada',
        text: message,
        showCancelButton: true,
        confirmButtonText: 'Autenticar Microsoft 365 Agora',
        cancelButtonText: 'Fechar',
        confirmButtonColor: '#005fb8',
        backdrop: 'rgba(10, 24, 38, 0.65)'
      }).then((res) => {
        if (res.isConfirmed) {
          jobPanel.hidden = true;
          runGlobalAction("m365_login");
        }
      });
      return;
    }
    if (errorCode === "TARGET_MAILBOX_INVALID") {
      Swal.fire({
        icon: 'warning',
        title: 'Destino no Microsoft 365 precisa ser ajustado',
        text: message,
        showCancelButton: true,
        confirmButtonText: 'Alterar Caixa de Destino',
        cancelButtonText: 'Fechar',
        confirmButtonColor: '#0284c7',
        backdrop: 'rgba(10, 24, 38, 0.65)'
      }).then((res) => {
        if (res.isConfirmed) {
          const g = (state.overview?.groups || []).find(x => x.email === state.selected) || { email: state.selected };
          openTargetMailboxDialog(g);
        }
      });
      return;
    }
    Swal.fire({
      icon: 'error',
      title: 'Erro na Operação',
      text: message,
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#005fb8',
      backdrop: 'rgba(10, 24, 38, 0.65)'
    });
  } else {
    toast.textContent = message;
    toast.hidden = false;
    window.setTimeout(() => { toast.hidden = true; }, 6000);
  }
}

async function api(path, options = {}) {
  token = getSessionToken();
  const request = { method: options.method || "GET", headers: { "X-Migration-Token": token } };
  if (options.body !== undefined) {
    request.headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, request);
  if (response.status === 401 && window.__MIGRATION_TOKEN__ && window.__MIGRATION_TOKEN__ !== token) {
    token = window.__MIGRATION_TOKEN__;
    sessionStorage.setItem("migrationToken", token);
    request.headers["X-Migration-Token"] = token;
    const retryResp = await fetch(path, request);
    const retryPayload = await retryResp.json();
    if (!retryResp.ok) throw new Error(retryPayload.error || "Falha ao comunicar com o painel local.");
    return retryPayload;
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Falha ao comunicar com o painel local.");
  return payload;
}

function selectedGroup() {
  return state.overview?.groups.find(group => group.email === state.selected) || null;
}

async function revealArtifact(path) {
  const group = selectedGroup();
  if (!group || !path) return;
  try {
    await api("/api/artifacts/reveal", {
      method: "POST",
      body: { group: group.email, path },
    });
  } catch (error) {
    showError(error.message);
  }
}

let currentEvidenceText = "";
let currentEvidenceFilename = "log.txt";

function formatLogLines(text) {
  if (!text) return document.createTextNode("");
  const lines = text.split("\n");
  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    const div = document.createElement("div");
    const lower = line.toLowerCase();
    if (lower.includes("error") || lower.includes("exception") || lower.includes("falha") || lower.includes("erro interno")) {
      div.className = "log-error";
    } else if (lower.includes("warn") || lower.includes("aviso")) {
      div.className = "log-warning";
    } else if (lower.includes("success") || lower.includes("concluído") || lower.includes("sincronizado") || lower.includes("completed")) {
      div.className = "log-success";
    } else if (lower.startsWith(">>") || lower.startsWith("--") || lower.startsWith("==")) {
      div.className = "log-info";
    }
    div.textContent = line || "\u00A0";
    fragment.appendChild(div);
  }
  return fragment;
}

async function showEvidenceModal({ jobId, artifactPath, event }) {
  if (!evidenceDialog) return;
  if (evidenceCategory) evidenceCategory.textContent = event?.category ? event.category.toUpperCase() : "EVIDÊNCIA";
  if (evidenceTitle) evidenceTitle.textContent = event?.title || "Detalhes da evidência";
  if (evidenceMeta) evidenceMeta.textContent = event?.detail || "";
  
  if (evidenceStatusBadge) {
    const st = (event?.status || "REGISTADO").toUpperCase();
    evidenceStatusBadge.textContent = st;
    evidenceStatusBadge.className = `evidence-badge ${st.toLowerCase()}`;
  }
  if (evidenceDuration) evidenceDuration.textContent = "";
  if (evidenceTimestamp) evidenceTimestamp.textContent = event?.timestamp ? formatDate(event.timestamp) : "";
  
  if (evidenceLog) {
    evidenceLog.replaceChildren();
    const loading = document.createElement("span");
    loading.className = "evidence-loading";
    loading.textContent = "A carregar evidência...";
    evidenceLog.appendChild(loading);
  }

  currentEvidenceText = "";
  currentEvidenceFilename = `${jobId || "evidencia"}.txt`;

  evidenceDialog.showModal();

  try {
    let content = "";
    if (jobId) {
      const data = await api(`/api/jobs/${jobId}/log`);
      content = data.content || "";
      if (data.status && evidenceStatusBadge) {
        evidenceStatusBadge.textContent = data.status.toUpperCase();
        evidenceStatusBadge.className = `evidence-badge ${data.status.toLowerCase()}`;
      }
      if (data.duration_seconds && evidenceDuration) {
        evidenceDuration.textContent = `Duração: ${data.duration_seconds}s`;
      }
      if (data.finished_at && evidenceTimestamp) {
        evidenceTimestamp.textContent = formatDate(data.finished_at);
      }
      currentEvidenceFilename = `${data.action || "job"}-${jobId}.txt`;
    } else if (artifactPath) {
      const group = selectedGroup();
      const res = await api("/api/artifacts/content", {
        method: "POST",
        body: { group: group ? group.email : "", path: artifactPath },
      });
      content = res.content || "";
      currentEvidenceFilename = res.name || "artifact.txt";
    }

    currentEvidenceText = content;
    if (evidenceLog) {
      evidenceLog.replaceChildren();
      if (!content.trim()) {
        evidenceLog.textContent = "(Nenhum conteúdo ou log registado)";
      } else {
        evidenceLog.appendChild(formatLogLines(content));
      }
    }
  } catch (error) {
    if (evidenceLog) {
      evidenceLog.replaceChildren();
      const errSpan = document.createElement("span");
      errSpan.className = "log-error";
      errSpan.textContent = `Erro ao carregar evidência: ${error.message}`;
      evidenceLog.appendChild(errSpan);
    }
  }
}

evidenceCopyBtn?.addEventListener("click", async () => {
  if (!currentEvidenceText) return;
  try {
    await navigator.clipboard.writeText(currentEvidenceText);
    const prev = evidenceCopyBtn.innerHTML;
    evidenceCopyBtn.textContent = "Copiado!";
    setTimeout(() => { evidenceCopyBtn.innerHTML = prev; }, 2000);
  } catch (err) {
    showError("Não foi possível copiar para a área de transferência.");
  }
});

evidenceDownloadBtn?.addEventListener("click", () => {
  if (!currentEvidenceText) return;
  const blob = new Blob([currentEvidenceText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = currentEvidenceFilename;
  a.click();
  URL.revokeObjectURL(url);
});

evidenceCloseBtn?.addEventListener("click", () => {
  evidenceDialog.close();
});

evidenceDialog?.addEventListener("click", (e) => {
  if (e.target === evidenceDialog) {
    evidenceDialog.close();
  }
});

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

state.groupDetailsCache = {};

async function loadGroupDetails(groupEmail, force = false) {
  if (!groupEmail) return;
  const groups = state.overview?.groups || [];
  const group = groups.find(g => g.email === groupEmail);
  if (!group) return;

  if (!force && state.groupDetailsCache[groupEmail]) {
    const cached = state.groupDetailsCache[groupEmail];
    group.backup_exports = cached.backup_exports || [];
    group.remote_backup = cached.remote_backup || {};
    group.activity = cached.activity || [];
    group.has_details = true;
    renderBackupDetails(group);
    renderActivity(group);
    return;
  }

  try {
    const details = await api(`/api/groups/${encodeURIComponent(groupEmail)}/details`);
    state.groupDetailsCache[groupEmail] = details;
    group.backup_exports = details.backup_exports || [];
    group.remote_backup = details.remote_backup || {};
    group.activity = details.activity || [];
    group.has_details = true;
    if (state.selected === groupEmail) {
      renderBackupDetails(group);
      renderActivity(group);
    }
  } catch (err) {
    console.warn("Falha ao carregar detalhes sob demanda do grupo:", err);
  }
}
window.loadGroupDetails = loadGroupDetails;

function switchMainModule(moduleName, subViewName = null) {
  state.currentModule = moduleName || "status";

  // Primary navigation buttons (Linguetas)
  const navTabs = {
    status: document.getElementById("primary-nav-status"),
    operation: document.getElementById("primary-nav-operation"),
    backups: document.getElementById("primary-nav-backups"),
    history: document.getElementById("primary-nav-history"),
    system: document.getElementById("primary-nav-system"),
  };

  for (const [key, btn] of Object.entries(navTabs)) {
    if (btn) {
      btn.className = (key === state.currentModule) ? "primary-tab-btn-active" : "primary-tab-btn-inactive";
    }
  }

  const subTitle = document.getElementById("submenu-header-title");
  const subContainer = document.getElementById("submenu-items-container");
  const bcParent = document.getElementById("breadcrumb-parent");
  const bcCurrent = document.getElementById("breadcrumb-current");

  const subBtnActive = (label, fn) => `
    <button onclick="${fn}" class="submenu-nav-link-active" type="button">
      <span>${label}</span>
      <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-white"></i>
    </button>
  `;
  const subBtnInactive = (label, fn) => `
    <button onclick="${fn}" class="submenu-nav-link-inactive" type="button">
      <span>${label}</span>
    </button>
  `;

  // Module configuration definitions - ONLY RELEVANT TO MIGRATION SYSTEM
  const moduleConfigs = {
    status: {
      title: "STATUS",
      breadcrumb: "Status",
      defaultSubView: "overview",
      subviews: [
        { id: "overview", label: "Visão Geral" },
        { id: "flow", label: "Fluxo de Migração" },
      ]
    },
    operation: {
      title: "OPERAÇÃO",
      breadcrumb: "Operação",
      defaultSubView: "cockpit",
      subviews: [
        { id: "cockpit", label: "Painel do Grupo" },
        { id: "groups", label: "Todos os Grupos" },
      ]
    },
    backups: {
      title: "BACKUPS",
      breadcrumb: "Backups",
      defaultSubView: "remote",
      subviews: [
        { id: "remote", label: "Arquivos no Google" },
        { id: "local", label: "Catálogo Local" },
      ]
    },
    history: {
      title: "HISTÓRICO",
      breadcrumb: "Histórico",
      defaultSubView: "timeline",
      subviews: [
        { id: "timeline", label: "Linha do Tempo" },
      ]
    },
    system: {
      title: "SISTEMA",
      breadcrumb: "Sistema",
      defaultSubView: "auth",
      subviews: [
        { id: "auth", label: "Conexões Cloud" },
        { id: "tools", label: "Ferramentas Globais" },
      ]
    }
  };

  const conf = moduleConfigs[state.currentModule] || moduleConfigs.status;
  const curSub = subViewName || (state.activeSubView && conf.subviews.some(s => s.id === state.activeSubView) ? state.activeSubView : conf.defaultSubView);
  state.activeSubView = curSub;

  if (subTitle) subTitle.innerText = conf.title;
  if (bcParent) bcParent.innerText = conf.breadcrumb;

  const currentSubObj = conf.subviews.find(s => s.id === curSub) || conf.subviews[0];
  if (bcCurrent) bcCurrent.innerText = currentSubObj ? currentSubObj.label : "";

  // Render secondary submenu buttons
  if (subContainer) {
    subContainer.innerHTML = conf.subviews.map(sv => {
      const isActive = sv.id === curSub;
      const fn = `switchMainModule('${state.currentModule}', '${sv.id}')`;
      return isActive ? subBtnActive(sv.label, fn) : subBtnInactive(sv.label, fn);
    }).join("");
  }

  // Switch active page container inside workspace
  const targetPageId = `page-${state.currentModule}-${curSub}`;
  const allPages = workspace.querySelectorAll(".view-page");
  for (const page of allPages) {
    if (page.id === targetPageId) {
      page.classList.add("active");
    } else {
      page.classList.remove("active");
    }
  }

  // Toggle breadcrumb group selector: ONLY visible when operating a single group (operation -> cockpit)
  const groupSelectorContainer = document.getElementById("breadcrumbGroupSelectorContainer");
  if (groupSelectorContainer) {
    const isCockpit = (state.currentModule === "operation" && curSub === "cockpit");
    groupSelectorContainer.style.display = isCockpit ? "flex" : "none";
  }

  // On-demand rendering when specific subview is opened
  if (state.currentModule === "status") {
    if (curSub === "overview") {
      renderOverviewGlobal();
    } else if (curSub === "flow") {
      renderMigrationFlow();
    }
  } else if (curSub === "groups") {
    renderAllGroupsTable();
  } else if (state.currentModule === "backups" || state.currentModule === "history") {
    const group = selectedGroup();
    if (group && !group.has_details) {
      loadGroupDetails(group.email);
    }
  }

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}
window.switchMainModule = switchMainModule;

function renderAllGroupsTable() {
  const tbody = document.getElementById("allGroupsTableBody");
  if (!tbody) return;
  const groups = state.overview?.groups || [];
  if (!groups.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Nenhum grupo encontrado no catálogo.</td></tr>`;
    return;
  }
  tbody.innerHTML = groups.map(g => {
    const isSelected = g.email === state.selected;
    const rowClass = isSelected
      ? "bg-orange-50/70 border-l-4 border-l-enging-orange font-medium"
      : "hover:bg-slate-50 transition";
    return `
      <tr class="${rowClass}">
        <td class="px-4 py-3 font-bold text-slate-900">${escapeHtml(g.email)}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(g.staging_user || '--')}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(g.target_mailbox || '--')}</td>
        <td class="px-4 py-3 text-slate-700 font-semibold">${formatNumber(g.canonical_messages || 0)}</td>
        <td class="px-4 py-3 text-emerald-600 font-bold">${formatNumber(g.verified_messages || 0)}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${g.readiness === 'EXCHANGE_BATCH_COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
            ${readinessLabel(g)}
          </span>
        </td>
        <td class="px-4 py-3 text-right">
          ${isSelected 
            ? '<span class="px-2.5 py-1 rounded-md text-[11px] font-bold text-enging-orange bg-orange-100/60 border border-orange-200">Em trabalho</span>'
            : `<button onclick="selectGroupAndOpen('${escapeHtml(g.email)}')" class="px-3 py-1 rounded-lg text-xs font-bold bg-white text-enging-navy hover:bg-slate-100 border border-slate-200 shadow-2xs transition">Abrir</button>`
          }
        </td>
      </tr>
    `;
  }).join("");
}
window.renderAllGroupsTable = renderAllGroupsTable;

function selectGroupAndOpen(email) {
  state.selected = email;
  const select = document.getElementById("groupSelect");
  if (select) select.value = email;
  const group = selectedGroup();
  if (group) {
    renderWorkspace(group);
    switchMainModule("operation", "cockpit");
  }
}
window.selectGroupAndOpen = selectGroupAndOpen;

function getGroupNextAction(group) {
  if (!group) return null;
  const isMigrated = (
    group.readiness === "EXCHANGE_BATCH_COMPLETED" ||
    Boolean(group.direct_import_completed) ||
    (Number(group.target_current_items || 0) > 0 && Number(group.canonical_messages || 0) > 0 && Number(group.target_current_items) >= Number(group.canonical_messages))
  );

  if (isMigrated) {
    const verifiedTotal = group.target_current_items || group.canonical_messages || 0;
    return {
      action: "m365_status",
      title: "Migração Concluída no Microsoft 365",
      description: `A caixa ${group.target_mailbox} contém ${formatNumber(verifiedTotal)} mensagens. O status está 100% verificado e concluído.`,
      buttonLabel: "Revalidar M365",
    };
  }

  let nextAction = "check_staging";
  let nextTitle = "Verificar a conta Google temporária";
  let nextDescription = "Confirma a conta exata, suspensão e Gmail sem gravar dados.";
  let buttonLabel = "Executar etapa";

  if (group.remote_only && !group.remote_backup?.Objects?.length) {
    nextAction = "remote_backup_inventory";
    nextTitle = "Consultar os arquivos deste grupo no Google";
    nextDescription = "Lista os arquivos exatos e compara com o Mac sem baixar nada.";
    buttonLabel = "Consultar arquivos";
  } else if (group.remote_only) {
    nextAction = "download_backup";
    nextTitle = "Selecionar e baixar o backup";
    nextDescription = "Abra Backups, escolha os arquivos desta exportação e baixe somente o que pretende migrar.";
    buttonLabel = "Escolher arquivos";
  } else if (!group.prepared) {
    nextAction = "prepare";
    nextTitle = "Preparar o backup";
    nextDescription = "Verificar integridade e criar o manifesto canônico.";
    buttonLabel = "Preparar backup";
  } else if (group.content_conflicts > 0 && !group.conflicts_approved) {
    nextAction = "approve_conflicts";
    nextTitle = "Rever variantes do manifesto";
    nextDescription = "Decidir se todas as mensagens distintas devem ser preservadas.";
    buttonLabel = "Rever agora";
  } else if (!group.google_account_ready && group.prepared) {
    nextAction = "m365_direct_import";
    nextTitle = "Inserir E-mails Diretamente no M365 (Recomendado)";
    nextDescription = "Insere as mensagens do backup direto na caixa do M365 via Graph API, dispensando licença Google Workspace e lote IMAP.";
    buttonLabel = "Inserir no M365";
  } else if (group.gmail_google_welcome_messages > 0 && group.gmail_unknown_messages === 0) {
    nextAction = "clean_google_welcome";
    nextTitle = `Remover ${formatNumber(group.gmail_google_welcome_messages)} mensagem(ns) automática(s) do Gmail`;
    nextDescription = "Foram reconhecidas como mensagens de boas-vindas do Google e não pertencem ao backup.";
    buttonLabel = "Remover mensagens";
  } else if (group.gmail_unknown_messages > 0) {
    nextAction = "audit_staging";
    nextTitle = "Rever mensagens desconhecidas no Gmail";
    nextDescription = "A importação permanece bloqueada para impedir mistura ou perda de dados.";
    buttonLabel = "Auditar Gmail";
  } else if (group.verification_failed > 0) {
    nextAction = "repair_dates";
    nextTitle = `Corrigir ${formatNumber(group.verification_failed)} mensagem(ns) rejeitada(s)`;
    nextDescription = "Substituir somente a cópia com data interna incorreta, preservando o backup e evitando duplicidade.";
    buttonLabel = "Corrigir mensagens";
  } else if (!group.gmail_checked || !group.gmail_verified) {
    nextAction = "audit_staging";
    nextTitle = "Reconciliar o Gmail com o diário local";
    nextDescription = "Consulta a conta exata e confirma as mensagens já verificadas.";
    buttonLabel = "Reconciliar Gmail";
  } else if (group.remaining_messages > 0) {
    nextAction = "load_all";
    nextTitle = `Carregar ${formatNumber(group.remaining_messages)} mensagens restantes`;
    nextDescription = "A carga continua do ponto seguro registado no diário.";
    buttonLabel = "Carregar mensagens";
  } else if (group.remaining_messages === 0 && group.canonical_messages > 0 && !group.exchange_checked) {
    nextAction = "m365_status";
    nextTitle = "Pré-validar a caixa de destino M365";
    nextDescription = "Consultar o destino e verificar se já contém itens.";
    buttonLabel = "Validar M365";
  } else if (group.remaining_messages === 0 && group.canonical_messages > 0 && !group.exchange_migration_found) {
    nextAction = "create_start_batch";
    nextTitle = "Criar e iniciar o lote M365";
    nextDescription = "A origem e o destino estão prontos para a migração.";
    buttonLabel = "Iniciar lote M365";
  } else if (group.exchange_migration_found) {
    nextAction = "m365_status";
    nextTitle = group.readiness === "EXCHANGE_BATCH_COMPLETED" ? "Confirmar entrega na caixa M365" : "Atualizar estado do lote M365";
    nextDescription = group.readiness === "EXCHANGE_BATCH_FAILED"
      ? "Consultar o erro e as contagens reais do lote antes de qualquer nova tentativa."
      : "Consulta o Exchange novamente e atualiza mensagens, falhas e estado real do lote.";
    buttonLabel = "Atualizar estado";
  }

  return { action: nextAction, title: nextTitle, description: nextDescription, buttonLabel: buttonLabel };
}
window.getGroupNextAction = getGroupNextAction;

function getAccountCategory(group) {
  const r = group.readiness;
  if (
    r === "EXCHANGE_BATCH_COMPLETED" ||
    r === "EXCHANGE_BATCH_SYNCED" ||
    Boolean(group.direct_import_completed) ||
    (Number(group.target_current_items || 0) > 0 && Number(group.canonical_messages || 0) > 0 && Number(group.target_current_items) >= Number(group.canonical_messages))
  ) {
    return "migrated";
  }
  if (r === "EXCHANGE_BATCH_SYNCING" || r === "EXCHANGE_BATCH_FOUND" || r === "EXCHANGE_BATCH_STARTED" || r === "EXCHANGE_BATCH_CREATED" || r === "READY_FOR_EXCHANGE") {
    return "syncing";
  }
  return "pending";
}
window.getAccountCategory = getAccountCategory;

function getAccountProgress(group) {
  if (
    group.readiness === "EXCHANGE_BATCH_COMPLETED" ||
    group.readiness === "EXCHANGE_BATCH_SYNCED" ||
    Boolean(group.direct_import_completed) ||
    (Number(group.target_current_items || 0) > 0 && Number(group.canonical_messages || 0) > 0 && Number(group.target_current_items) >= Number(group.canonical_messages))
  ) {
    return 100;
  }
  if (Number(group.canonical_messages || 0) > 0 && Number(group.target_current_items || 0) > 0) {
    return Math.min(99, Math.max(1, Math.round((Number(group.target_current_items) / Number(group.canonical_messages)) * 100)));
  }
  if (group.exchange_source_items && group.exchange_items_synced) {
    return Math.min(99, Math.max(1, Math.round((group.exchange_items_synced / group.exchange_source_items) * 100)));
  }
  if (group.canonical_messages && group.verified_messages) {
    return Math.min(50, Math.max(1, Math.round((group.verified_messages / group.canonical_messages) * 50)));
  }
  if (group.prepared) return 10;
  return 0;
}
window.getAccountProgress = getAccountProgress;

function syncM365Mailboxes() {
  runGlobalAction("sync_m365_mailboxes");
}
window.syncM365Mailboxes = syncM365Mailboxes;

function renderOverviewGlobal() {
  const overview = state.overview;
  if (!overview) return;
  const groups = overview.groups || [];
  const setup = overview.setup || {};
  const google = setup.google || {};
  const microsoft = setup.microsoft365 || {};
  const dependencies = setup.dependencies || {};

  // 1. Connection Cards
  const googleIsReady = Boolean(google.authenticated);
  const googleHasAccount = Boolean(google.account);
  const gBadge = document.getElementById("overviewGoogleStatusBadge");
  if (gBadge) {
    gBadge.textContent = googleIsReady ? "● Online" : (googleHasAccount ? "● Sessão Expirada" : "● Não Conectado");
    gBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold ${
      googleIsReady ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : (googleHasAccount ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-600 border border-slate-200")
    }`;
  }
  const gAccount = document.getElementById("overviewGoogleAccount");
  if (gAccount) gAccount.textContent = google.account || "--";
  const gBucket = document.getElementById("overviewGoogleBucketRoot");
  if (gBucket) {
    gBucket.textContent = overview.remote_discovery?.generated_at
      ? `${formatNumber(overview.remote_discovery.groups_with_backups)} grupos com backup Google`
      : "Takeout Google Workspace";
  }

  const m365IsReady = Boolean(microsoft.authenticated);
  const m365HasAccount = Boolean(microsoft.account);
  const mBadge = document.getElementById("overviewM365StatusBadge");
  if (mBadge) {
    mBadge.textContent = m365IsReady ? "● Online" : (m365HasAccount ? "● Sessão Expirada" : "● Não Conectado");
    mBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold ${
      m365IsReady ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : (m365HasAccount ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-600 border border-slate-200")
    }`;
  }
  const mAdmin = document.getElementById("overviewM365Admin");
  if (mAdmin) mAdmin.textContent = microsoft.account || overview.exchange_admin || "--";
  const mDomain = document.getElementById("overviewM365Domain");
  if (mDomain) mDomain.textContent = overview.m365_domain || "--";

  const missingDeps = ["python", "powershell", "gcloud", "exchange_module", "service_account"].filter(name => !dependencies[name]?.ready);
  const dBadge = document.getElementById("overviewDependenciesBadge");
  if (dBadge) {
    dBadge.textContent = missingDeps.length ? "● Faltam Dependências" : "● Ativo";
    dBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold ${
      missingDeps.length ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
    }`;
  }
  const dDetail = document.getElementById("overviewDependenciesDetail");
  if (dDetail) {
    dDetail.textContent = missingDeps.length ? `Faltando: ${missingDeps.join(", ")}` : "PowerShell 7.5 · Python API · Exchange Online";
  }

  // 2. Global KPIs
  const totalGroups = groups.length;
  let migratedCount = 0;
  let syncingCount = 0;
  let pendingCount = 0;
  let totalMessages = 0;
  let syncedMessages = 0;

  for (const g of groups) {
    const cat = getAccountCategory(g);
    if (cat === "migrated") migratedCount++;
    else if (cat === "syncing") syncingCount++;
    else pendingCount++;

    const gMsgs = Number(g.canonical_messages || 0) || Number(g.exchange_source_items || 0);
    totalMessages += gMsgs;

    const gSynced = Number(g.exchange_items_synced || 0) || Number(g.verified_messages || 0);
    syncedMessages += gSynced;
  }

  const elTotalGroups = document.getElementById("kpiTotalGroups");
  if (elTotalGroups) elTotalGroups.textContent = formatNumber(totalGroups);
  const elMigrated = document.getElementById("kpiMigratedGroups");
  if (elMigrated) elMigrated.textContent = formatNumber(migratedCount);
  const elSyncing = document.getElementById("kpiSyncingGroups");
  if (elSyncing) elSyncing.textContent = formatNumber(syncingCount);
  const elTotalMsgs = document.getElementById("kpiTotalMessages");
  if (elTotalMsgs) elTotalMsgs.textContent = formatNumber(totalMessages);
  const elSyncedSub = document.getElementById("kpiMessagesSyncedSub");
  if (elSyncedSub) elSyncedSub.textContent = `${formatNumber(syncedMessages)} sincronizadas`;

  // 3. Filter counts
  const cAll = document.getElementById("countOverviewAll");
  if (cAll) cAll.textContent = totalGroups;
  const cMig = document.getElementById("countOverviewMigrated");
  if (cMig) cMig.textContent = migratedCount;
  const cSync = document.getElementById("countOverviewSyncing");
  if (cSync) cSync.textContent = syncingCount;
  const cPend = document.getElementById("countOverviewPending");
  if (cPend) cPend.textContent = pendingCount;

  // 4. Update Filter Tab Active Buttons
  const currentFilter = state.overviewAccountFilter || "all";
  const filterButtons = {
    all: document.getElementById("btnFilterOverviewAll"),
    migrated: document.getElementById("btnFilterOverviewMigrated"),
    syncing: document.getElementById("btnFilterOverviewSyncing"),
    pending: document.getElementById("btnFilterOverviewPending")
  };
  for (const [key, btn] of Object.entries(filterButtons)) {
    if (!btn) continue;
    if (key === currentFilter) {
      btn.className = "px-3 py-1 rounded-lg bg-white shadow-xs text-enging-navy font-bold";
    } else {
      btn.className = "px-3 py-1 rounded-lg text-slate-600 hover:text-enging-navy transition";
    }
  }

  // 5. Render Accounts Table
  renderOverviewAccountsTable();
}
window.renderOverviewGlobal = renderOverviewGlobal;

function renderOverviewAccountsTable() {
  const tbody = document.getElementById("overviewAccountsTableBody");
  if (!tbody) return;
  const groups = state.overview?.groups || [];
  if (!groups.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">Nenhuma conta encontrada no catálogo.</td></tr>`;
    return;
  }

  const filter = state.overviewAccountFilter || "all";
  const search = (state.overviewAccountSearch || "").trim().toLowerCase();

  const filtered = groups.filter(g => {
    if (filter !== "all" && getAccountCategory(g) !== filter) return false;
    if (search) {
      const matchEmail = (g.email || "").toLowerCase().includes(search);
      const matchTarget = (g.target_mailbox || "").toLowerCase().includes(search);
      const matchStaging = (g.staging_user || "").toLowerCase().includes(search);
      if (!matchEmail && !matchTarget && !matchStaging) return false;
    }
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">Nenhuma conta corresponde ao filtro selecionado.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(g => {
    const cat = getAccountCategory(g);
    const progress = getAccountProgress(g);
    const isSelected = g.email === state.selected;
    
    // Status Badge
    let badgeClass = "bg-slate-100 text-slate-700 border-slate-200";
    let statusIcon = "circle";
    if (cat === "migrated") {
      badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
      statusIcon = "check-circle-2";
    } else if (cat === "syncing") {
      badgeClass = "bg-blue-50 text-blue-700 border-blue-200";
      statusIcon = "refresh-cw";
    }

    // Progress bar color
    const barColor = progress === 100 ? "bg-emerald-500" : (progress > 50 ? "bg-blue-500" : "bg-enging-orange");

    // Message details
    const totalMsgs = g.canonical_messages || g.exchange_source_items || 0;
    const syncedMsgs = g.exchange_items_synced || g.verified_messages || 0;

    return `
      <tr class="hover:bg-slate-50/80 transition ${isSelected ? 'bg-orange-50/40 border-l-4 border-l-enging-orange' : ''}">
        <td class="px-4 py-3">
          <div class="font-bold text-slate-900">${escapeHtml(g.email)}</div>
          <div class="text-[11px] text-slate-400 font-mono">${escapeHtml(g.staging_user || '--')}</div>
        </td>
        <td class="px-4 py-3">
          <div class="font-mono text-slate-800 font-semibold">${escapeHtml(g.target_mailbox || 'Não configurado')}</div>
          <div class="text-[10px] text-slate-400">${escapeHtml(g.target_delivery_domain || 'M365 Principal')}</div>
        </td>
        <td class="px-4 py-3 w-44">
          <div class="flex items-center justify-between text-[11px] mb-1">
            <span class="font-bold ${progress === 100 ? 'text-emerald-600' : 'text-slate-700'}">${progress}%</span>
            <span class="text-slate-400 text-[10px]">${formatNumber(syncedMsgs)} / ${formatNumber(totalMsgs)}</span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300 ${barColor}" style="width: ${progress}%"></div>
          </div>
        </td>
        <td class="px-4 py-3 text-slate-700">
          <div class="font-semibold">${formatNumber(totalMsgs)} msg(s)</div>
          <div class="text-[10px] text-slate-400">${formatNumber(syncedMsgs)} sincronizada(s)</div>
        </td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeClass}">
            <i data-lucide="${statusIcon}" class="w-3 h-3"></i>
            <span>${escapeHtml(readinessLabel(g))}</span>
          </span>
        </td>
        <td class="px-4 py-3 text-right">
          <div class="inline-flex items-center gap-1.5 justify-end">
            <button type="button" onclick="openAccountInFlow('${escapeHtml(g.email)}')" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-orange-50 hover:bg-orange-100 text-enging-orange border border-orange-200 transition shadow-2xs cursor-pointer flex items-center gap-1">
              <i data-lucide="git-branch" class="w-3 h-3"></i>
              <span>Ver Fluxo</span>
            </button>
            <button type="button" onclick="selectGroupAndOpen('${escapeHtml(g.email)}')" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-enging-navy border border-slate-200 transition shadow-2xs cursor-pointer">
              Cockpit
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}
window.renderOverviewAccountsTable = renderOverviewAccountsTable;

function setOverviewAccountFilter(filter) {
  state.overviewAccountFilter = filter;
  renderOverviewGlobal();
}
window.setOverviewAccountFilter = setOverviewAccountFilter;

function onOverviewAccountsSearch(text) {
  state.overviewAccountSearch = text;
  renderOverviewAccountsTable();
}
window.onOverviewAccountsSearch = onOverviewAccountsSearch;

function openAccountInFlow(email) {
  state.flowSelectedGroups.clear();
  state.flowSelectedGroups.add(email);
  state.selected = email;
  const select = document.getElementById("groupSelect");
  if (select) select.value = email;
  switchMainModule("status", "flow");
}
window.openAccountInFlow = openAccountInFlow;

function renderMigrationFlow() {
  const groups = state.overview?.groups || [];
  if (!groups.length) {
    const chipsContainer = document.getElementById("flowObjectChipsContainer");
    if (chipsContainer) {
      chipsContainer.innerHTML = `<span class="text-xs text-slate-400">Nenhum grupo carregado.</span>`;
    }
    const pipelinesContainer = document.getElementById("flowPipelinesContainer");
    if (pipelinesContainer) {
      pipelinesContainer.innerHTML = `<div class="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">Nenhum grupo disponível para exibir o fluxo.</div>`;
    }
    return;
  }

  // Ensure initial selection if none is set
  if (state.flowSelectedGroups.size === 0) {
    if (state.selected && groups.some(g => g.email === state.selected)) {
      state.flowSelectedGroups.add(state.selected);
    } else {
      const activeOne = groups.find(g => getAccountCategory(g) === "syncing" || getAccountCategory(g) === "migrated") || groups[0];
      state.flowSelectedGroups.add(activeOne.email);
    }
  }

  renderFlowObjectChips();
  renderFlowPipelines();
}
window.renderMigrationFlow = renderMigrationFlow;

function renderFlowObjectChips() {
  const chipsContainer = document.getElementById("flowObjectChipsContainer");
  const countText = document.getElementById("flowSelectedCountText");
  if (!chipsContainer) return;

  const groups = state.overview?.groups || [];
  const search = (state.flowAccountSearch || "").trim().toLowerCase();

  const filteredGroups = groups.filter(g => {
    if (!search) return true;
    return (g.email || "").toLowerCase().includes(search) || (g.target_mailbox || "").toLowerCase().includes(search);
  });

  chipsContainer.innerHTML = filteredGroups.map(g => {
    const isSelected = state.flowSelectedGroups.has(g.email);
    const cat = getAccountCategory(g);
    const progress = getAccountProgress(g);

    let dotColor = "bg-slate-400";
    if (cat === "migrated") dotColor = "bg-emerald-500";
    else if (cat === "syncing") dotColor = "bg-blue-500 animate-pulse";

    let chipClass = "";
    if (isSelected) {
      chipClass = "bg-enging-orange text-white border-enging-orange shadow-xs font-bold ring-2 ring-orange-200";
    } else {
      chipClass = "bg-white text-slate-700 hover:bg-slate-50 border-slate-200 font-medium";
    }

    return `
      <button type="button" onclick="toggleFlowObject('${escapeHtml(g.email)}')" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition cursor-pointer select-none ${chipClass}">
        <span class="w-2 h-2 rounded-full ${isSelected ? 'bg-white' : dotColor}"></span>
        <span class="font-mono text-[11px]">${escapeHtml(g.email.split('@')[0])}</span>
        <span class="text-[10px] ${isSelected ? 'text-orange-100' : 'text-slate-400'}">@${escapeHtml(g.email.split('@')[1] || '')}</span>
        ${progress === 100 
          ? `<span class="px-1.5 py-0.2 rounded-md text-[9px] font-bold ${isSelected ? 'bg-orange-600 text-white' : 'bg-emerald-100 text-emerald-700'}">100%</span>` 
          : (progress > 0 ? `<span class="px-1.5 py-0.2 rounded-md text-[9px] font-bold ${isSelected ? 'bg-orange-600 text-white' : 'bg-blue-100 text-blue-700'}">${progress}%</span>` : '')
        }
        ${isSelected ? `<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>` : ''}
      </button>
    `;
  }).join("");

  if (countText) {
    const selCount = state.flowSelectedGroups.size;
    countText.textContent = `${selCount} conta(s) selecionada(s) de ${groups.length}`;
  }

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}
window.renderFlowObjectChips = renderFlowObjectChips;

function renderFlowPipelines() {
  const container = document.getElementById("flowPipelinesContainer");
  if (!container) return;

  const groups = state.overview?.groups || [];
  const selectedList = groups.filter(g => state.flowSelectedGroups.has(g.email));

  if (!selectedList.length) {
    container.innerHTML = `
      <div class="empty-state p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div class="w-12 h-12 mx-auto rounded-full bg-orange-50 text-enging-orange flex items-center justify-center font-bold">
          <i data-lucide="layers" class="w-6 h-6"></i>
        </div>
        <h3 class="text-base font-bold text-slate-800">Nenhum Objeto de Migração Selecionado</h3>
        <p class="text-xs text-slate-500 max-w-md mx-auto">
          Clique em uma ou mais contas no seletor de objetos acima para visualizar e acompanhar os fluxos de migração detalhados.
        </p>
        <div class="pt-2">
          <button type="button" onclick="selectActiveFlowObjects()" class="px-4 py-2 rounded-xl bg-enging-orange hover:bg-enging-orange-hover text-white text-xs font-bold transition shadow-xs cursor-pointer">
            Selecionar Contas Em Andamento
          </button>
        </div>
      </div>
    `;
    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
  }

  container.innerHTML = selectedList.map(g => {
    const nextInfo = getGroupNextAction(g);
    const progress = getAccountProgress(g);
    const cat = getAccountCategory(g);

    // Step 1: Backup Local
    const step1Done = Boolean(g.prepared);
    const step1State = step1Done ? "done" : "current";
    const step1Detail = g.remote_only
      ? "Disponível no Google Takeout"
      : (g.preparation_isolated ? `${checkedLabel(g.preparation_checked_at)} · manifesto pronto` : "Pendente de preparação");

    // Step 2: Conta Google Temporária
    const step2Done = Boolean(g.google_account_ready);
    const step2State = step2Done ? "done" : (step1Done ? "current" : "");
    const accountState = g.google_account_status === "NOT_FOUND"
      ? "conta ainda não criada"
      : (g.google_license_pending ? "conta criada · aguardando licença Gmail" : checkedLabel(g.google_account_checked_at));
    const step2Detail = g.google_account_checked ? `${g.staging_user || '--'} · ${accountState}` : `${g.staging_user || '--'} · ainda não verificada`;

    // Step 3: Validação Gmail
    const step3Done = Boolean(g.gmail_verified && g.remaining_messages === 0 && g.canonical_messages > 0);
    const step3Current = !step3Done && (step2Done || g.verified_messages > 0);
    const step3State = step3Done ? "done" : (step3Current ? "current" : "");
    const step3Detail = g.gmail_checked 
      ? `${formatNumber(g.verified_messages)} de ${formatNumber(g.canonical_messages)} verificadas · ${checkedLabel(g.gmail_checked_at)}`
      : "Gmail ainda não reconciliado com o diário";

    // Step 4: Destino M365
    const step4Done = g.readiness === "EXCHANGE_BATCH_COMPLETED" || g.readiness === "EXCHANGE_BATCH_SYNCED";
    const step4Current = !step4Done && (Boolean(g.exchange_migration_found) || step3Done);
    const step4State = step4Done ? "done" : (step4Current ? "current" : "");
    const step4Detail = g.exchange_checked
      ? `${g.target_mailbox || '--'} · ${g.readiness === "EXCHANGE_BATCH_SYNCED" ? "sincronizado" : (g.exchange_batch_status || "localizado")} · ${checkedLabel(g.exchange_checked_at)}`
      : `${g.target_mailbox || 'Não configurado'} · aguardando lote M365`;

    return `
      <section class="rounded-2xl border border-slate-200 bg-white p-5 lg:p-6 shadow-xs space-y-5">
        
        <!-- Header da Conta Selecionada -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-orange-100 text-enging-orange flex items-center justify-center font-bold text-sm">
              <i data-lucide="layers" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-black text-slate-900">${escapeHtml(g.email)}</h3>
                <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  cat === 'migrated' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : (cat === 'syncing' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-700 border border-slate-200')
                }">
                  ${escapeHtml(readinessLabel(g))}
                </span>
              </div>
              <div class="text-xs text-slate-500 font-mono mt-0.5">
                Destino M365: <span class="font-bold text-slate-700">${escapeHtml(g.target_mailbox || 'Não atribuída')}</span> · Progresso: <span class="font-bold text-enging-orange">${progress}%</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button type="button" onclick="selectGroupAndOpen('${escapeHtml(g.email)}')" class="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-enging-navy border border-slate-200 text-xs font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer">
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              <span>Abrir Cockpit</span>
            </button>
            <button type="button" onclick="toggleFlowObject('${escapeHtml(g.email)}')" title="Remover da visualização" class="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- 4 Step Pipeline -->
        <div class="step-card-grid">
          
          <!-- Step 1: Backup Local -->
          <div class="step-card ${step1State}">
            <div class="step-card-badge">1</div>
            <div class="step-card-content">
              <div class="step-card-title">Backup Local</div>
              <div class="step-card-detail">${escapeHtml(step1Detail)}</div>
              <div class="step-card-meta">
                <span>${formatNumber(g.canonical_messages || 0)} msgs canônicas</span>
                <span>${formatBytes(g.archive_bytes || 0)}</span>
              </div>
            </div>
          </div>

          <!-- Step 2: Conta Google -->
          <div class="step-card ${step2State}">
            <div class="step-card-badge">2</div>
            <div class="step-card-content">
              <div class="step-card-title">Conta Google Temporária</div>
              <div class="step-card-detail">${escapeHtml(step2Detail)}</div>
              <div class="step-card-meta">
                <span>Staging: ${escapeHtml(g.staging_user || '--')}</span>
              </div>
            </div>
          </div>

          <!-- Step 3: Validação Gmail -->
          <div class="step-card ${step3State}">
            <div class="step-card-badge">3</div>
            <div class="step-card-content">
              <div class="step-card-title">Validação Gmail & Diário</div>
              <div class="step-card-detail">${escapeHtml(step3Detail)}</div>
              <div class="step-card-meta">
                <span class="text-emerald-600 font-bold">${formatNumber(g.verified_messages || 0)} verificadas</span>
                <span>${formatNumber(g.remaining_messages || 0)} pendentes</span>
              </div>
            </div>
          </div>

          <!-- Step 4: Destino M365 -->
          <div class="step-card ${step4State}">
            <div class="step-card-badge">4</div>
            <div class="step-card-content">
              <div class="step-card-title">Sincronização & Entrega M365</div>
              <div class="step-card-detail">${escapeHtml(step4Detail)}</div>
              <div class="step-card-meta">
                <span class="text-blue-600 font-bold">${formatNumber(g.exchange_items_synced || 0)} itens no Exchange</span>
              </div>
            </div>
          </div>

        </div>

        <!-- CARD: AÇÃO RECOMENDADA COM ALTO CONTRASTE -->
        <div class="rounded-xl border-2 border-orange-300 border-l-[6px] border-l-enging-orange bg-gradient-to-r from-orange-50 via-white to-amber-50/50 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-100 text-enging-orange border border-orange-200 text-[10px] font-black uppercase tracking-wider">
                <i data-lucide="zap" class="w-3 h-3"></i> Ação Recomendada
              </span>
              <strong class="text-xs font-black text-slate-900">${escapeHtml(nextInfo ? nextInfo.title : "Pronto")}</strong>
            </div>
            <p class="text-xs text-slate-600 pl-0.5">${escapeHtml(nextInfo ? nextInfo.description : "Todas as etapas foram concluídas para esta conta.")}</p>
          </div>
          
          <div class="shrink-0 flex items-center gap-2">
            ${nextInfo ? `
              <button type="button" onclick="executeGroupFlowAction('${escapeHtml(g.email)}', '${nextInfo.action}')" class="px-4 py-2 rounded-xl bg-enging-orange hover:bg-enging-orange-hover text-white text-xs font-bold shadow-xs hover:shadow-md transition flex items-center gap-1.5 cursor-pointer">
                <span>${escapeHtml(nextInfo.buttonLabel)}</span>
                <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
              </button>
            ` : ''}
            <button type="button" onclick="selectGroupAndOpen('${escapeHtml(g.email)}')" class="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-enging-navy border border-slate-200 text-xs font-bold shadow-2xs transition cursor-pointer">
              Abrir Cockpit
            </button>
          </div>
        </div>

      </section>
    `;
  }).join("");

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}
window.renderFlowPipelines = renderFlowPipelines;

function toggleFlowObject(email) {
  if (state.flowSelectedGroups.has(email)) {
    state.flowSelectedGroups.delete(email);
  } else {
    state.flowSelectedGroups.add(email);
  }
  renderFlowObjectChips();
  renderFlowPipelines();
}
window.toggleFlowObject = toggleFlowObject;

function selectAllFlowObjects() {
  const groups = state.overview?.groups || [];
  for (const g of groups) {
    state.flowSelectedGroups.add(g.email);
  }
  renderFlowObjectChips();
  renderFlowPipelines();
}
window.selectAllFlowObjects = selectAllFlowObjects;

function selectActiveFlowObjects() {
  state.flowSelectedGroups.clear();
  const groups = state.overview?.groups || [];
  for (const g of groups) {
    const cat = getAccountCategory(g);
    if (cat === "migrated" || cat === "syncing") {
      state.flowSelectedGroups.add(g.email);
    }
  }
  if (state.flowSelectedGroups.size === 0 && groups.length > 0) {
    state.flowSelectedGroups.add(groups[0].email);
  }
  renderFlowObjectChips();
  renderFlowPipelines();
}
window.selectActiveFlowObjects = selectActiveFlowObjects;

function clearFlowObjects() {
  state.flowSelectedGroups.clear();
  renderFlowObjectChips();
  renderFlowPipelines();
}
window.clearFlowObjects = clearFlowObjects;

function onFlowObjectSearch(text) {
  state.flowAccountSearch = text;
  renderFlowObjectChips();
}
window.onFlowObjectSearch = onFlowObjectSearch;

function executeGroupFlowAction(email, action) {
  state.selected = email;
  const select = document.getElementById("groupSelect");
  if (select) select.value = email;
  const group = selectedGroup();
  if (!group) return;

  if (group.remote_only && action === "download_backup") {
    switchMainModule("backups", "remote");
  } else if (action === "approve_conflicts") {
    approveConflicts();
  } else {
    runAction(action);
  }
}
window.executeGroupFlowAction = executeGroupFlowAction;

function openTargetDialogFromSidebar() {
  const group = selectedGroup();
  if (group) openTargetMailboxDialog(group);
}
window.openTargetDialogFromSidebar = openTargetDialogFromSidebar;


function remoteSelectionFor(group, remote) {
  const objects = Array.isArray(remote.Objects) ? remote.Objects : [];
  const paths = objects.map(object => object.RelativePath).filter(Boolean);
  const signature = `${remote.ExportId || ""}|${remote.GeneratedAtUtc || ""}|${paths.join("|")}`;
  const current = state.remoteSelections[group.email];
  if (!current || current.signature !== signature) {
    state.remoteSelections[group.email] = { signature, paths: new Set(paths) };
  }
  return state.remoteSelections[group.email];
}

function renderBackupDetails(group) {
  if (!workspace) return;
  setText(workspace, ".backup-tab-count", group.backup_exports?.length || 0);
  setText(workspace, ".remote-source", state.overview?.google_takeout_bucket_root || "Origem Google ainda não configurada");
  const remoteSummary = workspace.querySelector(".remote-backup-summary");
  const remote = group.remote_backup || {};
  if (remoteSummary) {
    remoteSummary.hidden = false;
    if (remote.GroupEmail) {
      const missing = Number(remote.MissingBytes || 0);
      remoteSummary.textContent = `${remote.Status || "Consultado"} · ${formatNumber(remote.RemoteObjects)} objeto(s) · ${formatBytes(remote.RemoteBytes)} · ${missing ? `${formatBytes(missing)} por baixar` : "cópia local completa"} · ${checkedLabel(remote.GeneratedAtUtc)}`;
    } else {
      remoteSummary.textContent = "O Google ainda não foi consultado para este grupo nesta interface.";
    }
  }

  const remoteTime = workspace.querySelector(".remote-inventory-time");
  const remoteList = workspace.querySelector(".remote-object-list");
  const remoteObjects = Array.isArray(remote.Objects) ? remote.Objects : [];
  const selection = remoteSelectionFor(group, remote);
  const selectionSummary = workspace.querySelector(".remote-selection-summary");
  const downloadButton = workspace.querySelector(".download-backup-button");
  const updateSelectionControls = () => {
    const selectedObjects = remoteObjects.filter(object => selection.paths.has(object.RelativePath));
    const selectedBytes = selectedObjects.reduce((total, object) => total + Number(object.RemoteBytes || 0), 0);
    if (selectionSummary) {
      selectionSummary.textContent = `${formatNumber(selectedObjects.length)} de ${formatNumber(remoteObjects.length)} · ${formatBytes(selectedBytes)}`;
    }
    if (downloadButton) {
      downloadButton.textContent = selectedObjects.length ? `Baixar selecionados (${selectedObjects.length})` : "Selecione um backup";
      downloadButton.disabled = selectedObjects.length === 0;
    }
  };
  const selectAllButton = workspace.querySelector(".select-all-remote");
  const clearSelectionButton = workspace.querySelector(".clear-remote-selection");
  if (selectAllButton) {
    selectAllButton.disabled = remoteObjects.length === 0;
    selectAllButton.onclick = () => {
      selection.paths = new Set(remoteObjects.map(object => object.RelativePath).filter(Boolean));
      if (remoteList) {
        for (const checkbox of remoteList.querySelectorAll('input[type="checkbox"]')) checkbox.checked = true;
      }
      updateSelectionControls();
    };
  }
  if (clearSelectionButton) {
    clearSelectionButton.disabled = remoteObjects.length === 0;
    clearSelectionButton.onclick = () => {
      selection.paths.clear();
      if (remoteList) {
        for (const checkbox of remoteList.querySelectorAll('input[type="checkbox"]')) checkbox.checked = false;
      }
      updateSelectionControls();
    };
  }
  if (remoteTime) {
    remoteTime.textContent = remote.GeneratedAtUtc
      ? `${formatNumber(remoteObjects.length)} arquivo(s) · ${checkedLabel(remote.GeneratedAtUtc)} · conta ${remote.ActiveAccount || "não informada"}`
      : "Faça uma consulta para obter a lista remota deste grupo.";
  }
  if (remoteList) {
    remoteList.replaceChildren();
    if (!remoteObjects.length) {
      const empty = document.createElement("p");
      empty.className = "backup-empty remote-empty";
      empty.textContent = "Nenhum arquivo remoto foi registado para esta consulta.";
      remoteList.appendChild(empty);
    } else {
      const localStateLabels = {
        Verified: "Cópia local verificada",
      SizeVerifiedNoMd5: "Tamanho local verificado",
      Missing: "Ainda não baixado",
      SizeMismatch: "Tamanho local divergente",
      Md5Mismatch: "MD5 local divergente",
    };
    for (const object of remoteObjects) {
      const row = document.createElement("article");
      row.className = `remote-object ${object.LocalState || "unknown"}`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "remote-object-checkbox";
      checkbox.checked = selection.paths.has(object.RelativePath);
      checkbox.setAttribute("aria-label", `Selecionar ${object.RelativePath}`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selection.paths.add(object.RelativePath);
        else selection.paths.delete(object.RelativePath);
        updateSelectionControls();
      });
      const indicator = document.createElement("span");
      indicator.className = "remote-object-indicator";
      const copy = document.createElement("div");
      copy.className = "remote-object-copy";
      const name = document.createElement("strong");
      name.textContent = object.RelativePath || "Arquivo sem nome";
      const details = document.createElement("small");
      const updated = object.UpdatedUtc ? ` · Google atualizado em ${formatDate(object.UpdatedUtc)}` : "";
      details.textContent = `${formatBytes(object.RemoteBytes)}${updated} · geração ${object.Generation || "não informada"}`;
      copy.append(name, details);
      const stateLabel = document.createElement("span");
      stateLabel.className = "remote-object-state";
      stateLabel.textContent = localStateLabels[object.LocalState] || object.LocalState || "Estado desconhecido";
      row.append(checkbox, indicator, copy, stateLabel);
      if (["Verified", "SizeVerifiedNoMd5"].includes(object.LocalState) && object.LocalPath) {
        const reveal = document.createElement("button");
        reveal.className = "button secondary compact";
        reveal.type = "button";
        reveal.textContent = "Mostrar cópia local";
        reveal.addEventListener("click", () => revealArtifact(object.LocalPath));
        row.appendChild(reveal);
      }
      remoteList.appendChild(row);
    }
  }
  }
  updateSelectionControls();

  const list = workspace.querySelector(".backup-export-list");
  if (!list) return;
  list.replaceChildren();
  if (!group.backup_exports?.length) {
    const empty = document.createElement("p");
    empty.className = "backup-empty";
    empty.textContent = "Nenhuma exportação local registada para este grupo.";
    list.appendChild(empty);
    return;
  }
  for (const backup of group.backup_exports) {
    const card = document.createElement("article");
    card.className = "backup-export-card";
    const heading = document.createElement("div");
    heading.className = "backup-export-heading";
    const title = document.createElement("strong");
    title.textContent = `Exportação ${backup.export_id}`;
    const summary = document.createElement("small");
    summary.textContent = `${backup.available_files}/${backup.file_count} arquivo(s) disponíveis · ${formatBytes(backup.bytes)} · ${checkedLabel(backup.registered_at)}`;
    heading.append(title, summary);
    card.appendChild(heading);
    const files = document.createElement("div");
    files.className = "backup-files";
    for (const file of backup.files) {
      const row = document.createElement("div");
      row.className = `backup-file ${file.state}`;
      const copy = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = file.name;
      const detail = document.createElement("small");
      detail.textContent = `${formatBytes(file.expected_bytes)} · SHA-256 ${file.sha256.slice(0, 14)}… · ${file.state === "verified_size" ? "presente" : (file.state === "missing" ? "ausente" : "tamanho divergente")}`;
      copy.append(name, detail);
      const reveal = document.createElement("button");
      reveal.className = "button secondary compact";
      reveal.type = "button";
      reveal.textContent = "Mostrar no Finder";
      reveal.disabled = file.state === "missing";
      reveal.addEventListener("click", () => revealArtifact(file.path));
      row.append(copy, reveal);
      files.appendChild(row);
    }
    card.appendChild(files);
    list.appendChild(card);
  }
}

function renderActivity(group) {
  if (!workspace) return;
  const list = workspace.querySelector(".activity-list");
  if (!list) return;
  list.replaceChildren();
  if (!group.activity?.length) {
    const empty = document.createElement("p");
    empty.className = "backup-empty";
    empty.textContent = "Ainda não existem eventos registados para este grupo.";
    list.appendChild(empty);
    return;
  }
  for (const event of group.activity) {
    const item = document.createElement("article");
    item.className = "activity-item";
    const marker = document.createElement("span");
    marker.className = `activity-marker ${event.category}`;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = event.title;
    const detail = document.createElement("small");
    detail.textContent = `${event.status || "REGISTADO"} · ${event.detail || "sem detalhes adicionais"}`;
    const time = document.createElement("time");
    time.textContent = formatDate(event.timestamp);
    copy.append(title, detail);
    item.append(marker, copy, time);
    if (event.job_id || event.artifact) {
      const reveal = document.createElement("button");
      reveal.className = "button secondary compact";
      reveal.type = "button";
      reveal.textContent = "Ver evidência";
      reveal.addEventListener("click", () => {
        showEvidenceModal({
          jobId: event.job_id,
          artifactPath: event.artifact,
          event: event,
        });
      });
      item.appendChild(reveal);
    }
    list.appendChild(item);
  }
}

function confirmation({ title, message, acknowledgement = "" }) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmCheckbox.checked = false;
  confirmAcknowledgement.hidden = !acknowledgement;
  confirmCheckboxText.textContent = acknowledgement;
  confirmButton.disabled = Boolean(acknowledgement);
  const updateButton = () => { confirmButton.disabled = Boolean(acknowledgement) && !confirmCheckbox.checked; };
  confirmCheckbox.onchange = updateButton;
  confirmDialog.showModal();
  return new Promise(resolve => {
    confirmDialog.addEventListener("close", () => {
      resolve({ confirmed: confirmDialog.returnValue === "confirm", acknowledged: confirmCheckbox.checked });
    }, { once: true });
  });
}

function renderGroups() {
  if (!groupSelect) return;
  groupSelect.replaceChildren();
  const groups = state.overview?.groups || [];
  const sections = [
    { label: "Grupos registados no Mac", groups: groups.filter(group => !group.remote_only) },
    { label: "Disponíveis somente no Google", groups: groups.filter(group => group.remote_only) },
  ];
  for (const section of sections) {
    if (!section.groups.length) continue;
    const options = document.createElement("optgroup");
    options.label = `${section.label} (${section.groups.length})`;
    for (const group of section.groups) {
      const option = document.createElement("option");
      option.value = group.email;
      option.textContent = `${group.email} — ${readinessLabel(group)}`;
      option.selected = group.email === state.selected;
      options.appendChild(option);
    }
    groupSelect.appendChild(options);
  }
  const group = selectedGroup();
  if (selectedGroupState) {
    selectedGroupState.textContent = group
      ? `${readinessLabel(group)} · ${group.remote_only ? `${formatNumber(group.remote_object_count)} arquivo(s) no Google` : `${formatNumber(group.canonical_messages)} mensagem(ns) canônicas`}`
      : "Nenhum grupo selecionado";
  }
}

function renderWorkspace(group) {
  const fragment = document.querySelector("#workspaceTemplate").content.cloneNode(true);
  
  // SYSTEM Hero Card bindings:
  const pct = group.canonical_messages ? ((group.verified_messages / group.canonical_messages) * 100) : 0;
  setText(fragment, ".verified-load-pct", `${pct.toFixed(1)}%`);
  const sysBar = fragment.querySelector("#system-cpu-bar");
  if (sysBar) sysBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;

  // Selected group email in bold orange
  setText(fragment, ".selected-email", group.email || "Nenhum grupo selecionado");

  // State of preparation
  setText(fragment, ".backup-detail", group.remote_only
    ? "Disponível no Google; ainda não baixado"
    : (group.preparation_isolated ? `${checkedLabel(group.preparation_checked_at)} · manifesto isolado` : "Pendente de preparação"));

  // Local device time
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const localTimeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  setText(fragment, ".system-local-time", localTimeStr);

  // RAM bar (Gmail load)
  const ramPct = group.canonical_messages ? Math.round((group.verified_messages / group.canonical_messages) * 100) : 0;
  setText(fragment, ".verified-note", `${ramPct}%`);
  const ramBar = fragment.querySelector("#kpi-ram-bar");
  if (ramBar) ramBar.style.width = `${ramPct}%`;

  // FLASH bar (M365 sync load)
  const m365Pct = (group.exchange_source_items && group.exchange_items_synced)
    ? Math.round((group.exchange_items_synced / group.exchange_source_items) * 100)
    : (group.readiness === "EXCHANGE_BATCH_COMPLETED" ? 100 : 0);
  setText(fragment, ".m365-sync-pct", `${m365Pct}%`);
  const flashBar = fragment.querySelector("#kpi-flash-bar");
  if (flashBar) flashBar.style.width = `${m365Pct}%`;

  setText(fragment, ".export-id", group.export_id ? `v${group.export_id}` : "v1.0.0");

  // Destino M365 Hero Card bindings:
  const isOnline = group.readiness === "READY_FOR_STAGING" || group.readiness === "READY_FOR_EXCHANGE" || group.readiness === "EXCHANGE_BATCH_COMPLETED" || group.exchange_checked;
  const sessionLabel = fragment.querySelector(".exchange-session-status-label");
  const sessionPill = fragment.querySelector(".exchange-session-pill");
  if (sessionLabel) {
    if (isOnline) {
      sessionLabel.textContent = "ONLINE (Conectado)";
      if (sessionPill) {
        sessionPill.className = "exchange-session-pill inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200";
        const dot = sessionPill.querySelector("span");
        if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
      }
    } else {
      sessionLabel.textContent = "AGUARDANDO CONSULTA";
      if (sessionPill) {
        sessionPill.className = "exchange-session-pill inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200";
        const dot = sessionPill.querySelector("span");
        if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-500";
      }
    }
  }

  setText(fragment, ".mapping-target-smtp", group.target_mailbox || "Não configurado");
  setText(fragment, ".tenant-delivery-domain-label", group.target_delivery_domain ? `Tenant ${group.target_delivery_domain}` : "Tenant Principal Microsoft 365");

  // RECENT SYSTEM EVENTS timestamps:
  const evtTime1 = fragment.querySelector(".system-event-time");
  if (evtTime1) evtTime1.textContent = localTimeStr;
  const evtTime2 = fragment.querySelector(".system-event-time-2");
  if (evtTime2) {
    const prevTime = new Date(now.getTime() - 180000);
    evtTime2.textContent = `${prevTime.getFullYear()}-${pad(prevTime.getMonth() + 1)}-${pad(prevTime.getDate())} ${pad(prevTime.getHours())}:${pad(prevTime.getMinutes())}:${pad(prevTime.getSeconds())}`;
  }

  // Preserve existing mappings and details
  setText(fragment, ".mapping", `${group.staging_user}  →  ${group.target_mailbox}`);
  setText(fragment, ".readiness-pill", readinessLabel(group));
  setText(fragment, ".canonical", formatNumber(group.canonical_messages));
  setText(fragment, ".verified", formatNumber(group.verified_messages));
  setText(fragment, ".remaining", formatNumber(group.remaining_messages));
  setText(fragment, ".failed", formatNumber(group.verification_failed));
  setText(fragment, ".warning-count", `${formatNumber(group.verification_warnings)} aviso(s) verificado(s)`);

  const accountState = group.google_account_status === "NOT_FOUND"
    ? "conta ainda não criada"
    : (group.google_license_pending ? "conta criada · aguardando licença Gmail" : checkedLabel(group.google_account_checked_at));
  setText(fragment, ".account-detail", group.google_account_checked ? `${group.staging_user} · ${accountState}` : `${group.staging_user} · ainda não verificada`);
  const gmailExternal = Number(group.gmail_google_welcome_messages || 0) + Number(group.gmail_unknown_messages || 0);
  const gmailExternalDetail = gmailExternal
    ? ` · ${formatNumber(group.gmail_google_welcome_messages)} automática(s) do Google · ${formatNumber(group.gmail_unknown_messages)} desconhecida(s)`
    : "";
  setText(fragment, ".stage-detail", group.gmail_checked ? `${formatNumber(group.verified_messages)} de ${formatNumber(group.canonical_messages)}${gmailExternalDetail} · ${checkedLabel(group.gmail_checked_at)}` : "Gmail ainda não reconciliado com o diário local");
  const typeBadge = group.exchange_recipient_type === "UserMailbox"
    ? "caixa de utilizador"
    : (group.exchange_recipient_type === "SharedMailbox" ? "caixa partilhada" : (group.exchange_recipient_type || ""));
  const typeText = typeBadge ? ` (${typeBadge})` : "";
  const exchangeIdentity = group.exchange_primary_smtp && group.exchange_primary_smtp !== group.target_mailbox
    ? `${group.target_mailbox}${typeText} → primária ${group.exchange_primary_smtp}`
    : `${group.target_mailbox}${typeText}`;
  const exchangeStatus = group.exchange_batch_status || group.exchange_migration_status;
  const exchangeCounters = group.exchange_source_items !== null && group.exchange_source_items !== undefined
    ? ` · ${formatNumber(group.exchange_items_synced)} de ${formatNumber(group.exchange_source_items)} item(ns)`
    : (group.exchange_items_synced !== null && group.exchange_items_synced !== undefined
      ? ` · ${formatNumber(group.exchange_items_synced)} item(ns) sincronizado(s)`
      : "");
  const exchangeWorkflow = group.exchange_workflow_step
    ? ` · etapa ${group.exchange_workflow_step}`
    : "";
  setText(fragment, ".m365-detail", group.exchange_checked
    ? `${exchangeIdentity} · ${group.target_delivery_domain || "domínio de entrega por detectar"}${exchangeStatus ? ` · ${exchangeStatus}` : ""}${exchangeWorkflow}${exchangeCounters} · ${checkedLabel(group.exchange_checked_at)}`
    : `${group.target_mailbox} · ainda não consultada`);
  setText(fragment, ".conflicts", formatNumber(group.content_conflicts));
  setText(fragment, ".defects", formatNumber(group.parse_defects));
  setText(fragment, ".approval", group.conflicts_approved ? "Registada" : "Pendente");
  setText(fragment, ".earliest", formatDate(group.earliest_message_utc));
  setText(fragment, ".latest", formatDate(group.latest_message_utc));
  setText(fragment, ".backup-size", `${formatBytes(group.archive_bytes)} em ${group.archive_files} arquivo(s)`);

  const stepBackup = fragment.querySelector('[data-step="backup"]');
  if (stepBackup && group.prepared) stepBackup.classList.add("done");

  const stepAccount = fragment.querySelector('[data-step="account"]');
  if (stepAccount) {
    if (group.google_account_ready) stepAccount.classList.add("done");
    else if (group.prepared) stepAccount.classList.add("current");
  }

  const stepStage = fragment.querySelector('[data-step="stage"]');
  if (stepStage) {
    if (group.gmail_verified) stepStage.classList.add(group.remaining_messages ? "current" : "done");
    else if (group.google_account_ready) stepStage.classList.add("current");
  }

  const stepM365 = fragment.querySelector('[data-step="m365"]');
  if (stepM365) {
    if (group.exchange_checked && group.exchange_migration_found) stepM365.classList.add(group.readiness === "EXCHANGE_BATCH_COMPLETED" ? "done" : "current");
    else if (group.gmail_verified && group.remaining_messages === 0 && group.canonical_messages > 0) stepM365.classList.add("current");
  }
  workspace.replaceChildren(fragment);

  // Activate current module and subview page
  switchMainModule(state.currentModule || "status", state.activeSubView || "overview");

  // Wire target mailbox dialog buttons across all views
  for (const btn of workspace.querySelectorAll(".change-target-button")) {
    btn.addEventListener("click", () => openTargetMailboxDialog(group));
  }

  // If group details are already present, render immediately
  if (group.has_details) {
    renderBackupDetails(group);
    renderActivity(group);
  } else {
    // Otherwise fetch details asynchronously on demand
    loadGroupDetails(group.email);
  }
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  const conflictNotice = workspace.querySelector(".conflict-notice");
  if (conflictNotice) {
    if (group.content_conflicts > 0 && !group.conflicts_approved) {
      conflictNotice.hidden = false;
      setText(workspace, ".conflict-notice-text", `${formatNumber(group.content_conflicts)} Message-ID(s) representam mensagens de conteúdo distinto. A carga fica bloqueada até a sua decisão.`);
      const approveBtn = workspace.querySelector(".approve-conflicts");
      if (approveBtn) approveBtn.onclick = approveConflicts;
    } else {
      conflictNotice.hidden = true;
    }
  }

  const nextInfo = getGroupNextAction(group);
  if (nextInfo) {
    setText(workspace, ".next-action-title", nextInfo.title);
    setText(workspace, ".next-action-description", nextInfo.description);
    const nextButton = workspace.querySelector(".next-action-button");
    if (nextButton) {
      nextButton.textContent = nextInfo.buttonLabel;
      nextButton.onclick = () => {
        if (group.remote_only && nextInfo.action === "download_backup") {
          switchMainModule("backups", "remote");
        } else if (nextInfo.action === "approve_conflicts") {
          approveConflicts();
        } else {
          runAction(nextInfo.action);
        }
      };
    }
  }

  for (const button of workspace.querySelectorAll("[data-action]")) {
    const action = button.dataset.action;
    if (!group.prepared && !["prepare", "gcloud_login", "remote_backup_inventory", "download_backup"].includes(action)) button.disabled = true;
    const hasLocalFiles = (group.backup_exports || []).some(x => x.files.some(f => f.state !== "missing"));
    if (action === "prepare" && !hasLocalFiles) button.disabled = true;
    if (action === "download_backup" && !group.remote_backup?.Objects?.length) button.disabled = true;
    if (["audit_staging", "load_test", "load_all", "repair_dates"].includes(action) && !group.google_account_ready) button.disabled = true;
    if (["load_test", "load_all"].includes(action) && gmailExternal > 0) button.disabled = true;
    if (["load_test", "load_all"].includes(action) && group.content_conflicts > 0 && !group.conflicts_approved) button.disabled = true;
    if (["load_test", "load_all"].includes(action) && group.verification_failed > 0) button.disabled = true;
    if (action === "repair_dates" && group.verification_failed === 0) button.disabled = true;
    if (["create_batch", "create_start_batch"].includes(action) && (!group.gmail_verified || !group.exchange_checked || group.remaining_messages > 0 || group.verification_failed > 0)) button.disabled = true;
    button.addEventListener("click", () => runAction(action));
  }
}

async function runGlobalAction(action) {
  const definition = ACTIONS[action];
  if (!definition) return;
  if (definition.mutating) {
    const account = action === "gcloud_login" ? state.overview?.google_admin : state.overview?.exchange_admin;
    const result = await confirmation({
      title: definition.title,
      message: `${definition.message}\n\nConta esperada: ${account || "conta administrativa configurada"}`,
      acknowledgement: `Confirmo a autenticação de ${account || "esta conta"} somente neste computador.`,
    });
    if (!result.confirmed) return;
  }
  try {
    showLoading("A iniciar operação...", definition.title);
    state.m365SuccessNotified = null;
    state.lastCopiedCode = null;
    const job = await api("/api/jobs", {
      method: "POST",
      body: { action, group: "", options: { confirmed: definition.mutating } },
    });
    hideLoading();
    state.activeJob = job;
    renderJob(job);
    pollJob(job.id);
  } catch (error) {
    hideLoading();
    showError(error.message);
  }
}

async function approveConflicts() {
  const group = selectedGroup();
  if (!group) return;
  const result = await confirmation({
    title: "Preservar todas as variantes?",
    message: `Foram encontrados ${formatNumber(group.content_conflicts)} Message-ID(s) reutilizados por mensagens de conteúdo diferente.\n\nA aprovação conserva todas as variantes para evitar perda e fica vinculada ao SHA-256 deste manifesto.`,
    acknowledgement: "Confirmo que quero preservar todas as variantes de conteúdo no Gmail temporário e no M365.",
  });
  if (!result.confirmed) return;
  try {
    showLoading("A registar aprovação...", "A gravar manifesto com preservação de variantes.");
    await api("/api/conflicts/approve", { method: "POST", body: { group: group.email, confirmed: true } });
    await loadOverview({ showLoadingOverlay: true, title: "A atualizar catálogo...", subtitle: "A recarregar métricas após aprovação." });
  } catch (error) {
    hideLoading();
    showError(error.message);
  }
}

async function runAction(action) {
  const group = selectedGroup();
  const definition = ACTIONS[action];
  if (!group || !definition) return;
  let approvedNonempty = false;
  let selectedRemoteFiles = [];
  let partialRemoteSelection = false;
  let selectedRemoteBytes = 0;
  if (action === "download_backup") {
    const remoteObjects = Array.isArray(group.remote_backup?.Objects) ? group.remote_backup.Objects : [];
    const existing = new Set(
      (group.backup_exports || []).flatMap(x => x.files.filter(f => f.state !== "missing").map(f => f.name))
    );
    const selection = remoteSelectionFor(group, group.remote_backup || {});
    selectedRemoteFiles = remoteObjects
      .filter(object => selection.paths.has(object.RelativePath))
      .map(object => object.RelativePath);
    if (!selectedRemoteFiles.length) {
      showError("Selecione pelo menos um arquivo encontrado no Google.");
      return;
    }
    partialRemoteSelection = selectedRemoteFiles.length < remoteObjects.length;
    selectedRemoteBytes = remoteObjects
      .filter(object => selection.paths.has(object.RelativePath))
      .reduce((total, object) => total + Number(object.RemoteBytes || 0), 0);
  }
  if (definition.mutating) {
    const targetHasItems = ["create_batch", "create_start_batch"].includes(action) && Number(group.target_current_items || 0) > 0;
    const actionMessage = action === "gcloud_login"
      ? `O navegador abrirá o login do Google Cloud para ${state.overview.google_admin}. A credencial será guardada pelo gcloud somente neste Mac.`
      : (action === "download_backup"
        ? `${definition.message}\n\nSelecionados: ${selectedRemoteFiles.length} de ${group.remote_backup.Objects.length} arquivo(s), ${formatBytes(selectedRemoteBytes)}.`
        : definition.message);
    const result = await confirmation({
      title: definition.title,
      message: `${actionMessage}\n\nGrupo: ${group.email}\nOrigem: ${group.staging_user}\nDestino: ${group.target_mailbox}`,
      acknowledgement: action === "repair_dates"
        ? "Confirmo a substituição: primeiro verificar a nova cópia e somente depois excluir a cópia com data errada do Gmail temporário."
        : (action === "m365_direct_import"
          ? `Confirmo a inserção direta dos e-mails canónicos do backup diretamente na caixa ${group.target_mailbox} no M365.`
          : (action === "m365_direct_test"
            ? `Confirmo a inserção de teste de 10 e-mails na caixa ${group.target_mailbox} no M365.`
            : (action === "gcloud_login"
              ? "Confirmo que quero autenticar a conta administrativa do Google Cloud neste Mac."
              : (action === "download_backup"
              ? (partialRemoteSelection
                ? "Confirmo que selecionei somente parte desta exportação e compreendo que arquivos não selecionados podem conter outras mensagens do histórico."
                : "Confirmo o download dos arquivos selecionados deste grupo, mantendo os existentes e bloqueando qualquer divergência.")
              : (action === "clean_google_welcome"
              ? `Confirmo a remoção permanente de ${formatNumber(group.gmail_google_welcome_messages)} mensagem(ns) automática(s) conhecida(s) da Equipa do Gmail, sem apagar mensagens do backup ou mensagens desconhecidas.`
              : (targetHasItems ? `A caixa M365 já contém ${formatNumber(group.target_current_items)} item(ns). Confirmo que revi a possível sobreposição.` : "")))))),
    });
    if (!result.confirmed) return;
    approvedNonempty = result.acknowledged;
  }
  try {
    showLoading("A preparar execução...", `${definition.title} · ${group.email}`);
    const job = await api("/api/jobs", {
      method: "POST",
      body: {
        action,
        group: group.email,
        options: {
          confirmed: definition.mutating,
          approve_nonempty_target: approvedNonempty,
          ...(action === "download_backup" ? {
            selected_remote_files: selectedRemoteFiles,
            confirm_partial_export: !partialRemoteSelection || approvedNonempty,
          } : {}),
        },
      },
    });
    hideLoading();
    state.activeJob = job;
    renderJob(job);
    pollJob(job.id);
  } catch (error) {
    hideLoading();
    showError(error.message);
  }
}

function renderJob(job) {
  state.activeJob = job;
  if (jobPanel) jobPanel.hidden = false;
  if (jobTitle) jobTitle.textContent = job.title;
  if (jobSubtitle) jobSubtitle.textContent = job.group;
  const statusLabels = {
    QUEUED: "A aguardar",
    RUNNING: "Em execução",
    COMPLETED: "Etapa local concluída",
    FAILED: "Falhou",
    CANCELLED: "Cancelado",
  };
  if (jobStatus) jobStatus.textContent = statusLabels[job.status] || job.status;
  const hasProgress = Number.isFinite(job.progress_current) && Number.isFinite(job.progress_total) && job.progress_total > 0;
  const percent = hasProgress ? Math.min(100, Math.round((job.progress_current / job.progress_total) * 100)) : (job.status === "COMPLETED" ? 100 : 4);
  if (jobProgressBar) jobProgressBar.style.width = `${percent}%`;
  if (jobProgressText) jobProgressText.textContent = hasProgress ? `${formatNumber(job.progress_current)} de ${formatNumber(job.progress_total)} · ${percent}%` : (job.status === "RUNNING" ? "A processar e verificar…" : "");
  if (jobLog) {
    jobLog.textContent = job.log.length ? job.log.join("\n") : "A iniciar o PowerShell…";
    jobLog.scrollTop = jobLog.scrollHeight;
  }
  const lastLine = [...job.log].reverse().find(line => line.trim().length > 0);
  const jobActivity = document.querySelector("#jobActivity");
  if (jobActivity) jobActivity.textContent = lastLine || "A iniciar execução...";
  if (["QUEUED", "RUNNING"].includes(job.status) && job.device_code) {
    if (jobDeviceAuth) {
      jobDeviceAuth.hidden = false;
      if (deviceAuthCode) deviceAuthCode.textContent = job.device_code;
      if (deviceAuthLink && job.device_url) deviceAuthLink.href = job.device_url;
    }
    if (navigator.clipboard && (!state.lastCopiedCode || state.lastCopiedCode !== job.device_code)) {
      state.lastCopiedCode = job.device_code;
      navigator.clipboard.writeText(job.device_code).catch(() => {});
    }
  } else {
    if (jobDeviceAuth) jobDeviceAuth.hidden = true;
  }
  if (jobRecovery) jobRecovery.hidden = true;
  if (jobRecoveryTitle) jobRecoveryTitle.textContent = "";
  if (jobRecoveryText) jobRecoveryText.textContent = "";
  if (cancelJobButton) cancelJobButton.hidden = !["QUEUED", "RUNNING"].includes(job.status);
  if (continueJobButton) {
    continueJobButton.hidden = true;
    continueJobButton.onclick = null;
  }
  const currentGroup = selectedGroup();
  const offerContinuation = (label, action) => {
    if (continueJobButton) {
      continueJobButton.textContent = label;
      continueJobButton.hidden = false;
      continueJobButton.onclick = () => {
        if (jobPanel) jobPanel.hidden = true;
        runAction(action);
      };
    }
  };
  if (job.status === "FAILED" && job.error_code === "GOOGLE_AUTH_EXPIRED") {
    if (jobRecovery) jobRecovery.hidden = false;
    if (jobRecoveryTitle) jobRecoveryTitle.textContent = "A sessão do Google expirou";
    if (jobRecoveryText) jobRecoveryText.textContent = ["discover_remote_groups", "remote_backup_inventory"].includes(job.action)
      ? "Autentique a conta administrativa no navegador. Quando o login terminar, o painel repetirá automaticamente a consulta deste grupo."
      : "Autentique a conta administrativa no navegador. Depois, o painel permitirá repetir o download deste grupo com uma nova confirmação.";
    if (continueJobButton) {
      continueJobButton.textContent = "Autenticar Google e repetir";
      continueJobButton.hidden = false;
      continueJobButton.onclick = () => {
        state.googleRetry = { action: job.action, group: job.group };
        if (jobPanel) jobPanel.hidden = true;
        runAction("gcloud_login");
      };
    }
  }
  if (job.status === "FAILED" && job.error_code === "M365_AUTH_FAILED") {
    if (jobRecovery) jobRecovery.hidden = false;
    if (jobRecoveryTitle) jobRecoveryTitle.textContent = "O Microsoft 365 não confirmou a sessão";
    if (jobRecoveryText) jobRecoveryText.textContent = "Use exatamente a conta administrativa indicada. O aplicativo repetirá a verificação pelo Exchange Online.";
    if (continueJobButton) {
      continueJobButton.textContent = "Autenticar Microsoft 365";
      continueJobButton.hidden = false;
      continueJobButton.onclick = () => {
        if (jobPanel) jobPanel.hidden = true;
        runGlobalAction("m365_login");
      };
    }
  }
  if (job.status === "FAILED" && job.error_code === "TARGET_MAILBOX_INVALID") {
    if (jobRecovery) jobRecovery.hidden = false;
    if (jobRecoveryTitle) jobRecoveryTitle.textContent = "Destino no Microsoft 365 precisa ser ajustado";
    if (jobRecoveryText) jobRecoveryText.textContent = job.error || "O endereço no Microsoft 365 não é uma caixa de correio válida ou não existe.";
    if (continueJobButton) {
      continueJobButton.textContent = "Alterar Caixa de Destino";
      continueJobButton.hidden = false;
      continueJobButton.onclick = () => {
        const g = (state.overview?.groups || []).find(x => x.email === job.group) || { email: job.group };
        openTargetMailboxDialog(g);
      };
    }
  }
    if (job.status === "COMPLETED" && job.action === "sync_m365_mailboxes") {
    fetchM365Mailboxes().then(mbs => {
      const syncStatus = document.getElementById("syncM365StatusText");
      if (syncStatus) syncStatus.textContent = `${mbs.length} conta(s) M365 sincronizada(s)`;
      const dialog = document.getElementById("targetMailboxDialog");
      if (dialog && dialog.open) {
        const customInput = document.getElementById("targetMailboxCustomInput");
        const cur = customInput ? customInput.value.trim().toLowerCase() : "";
        renderM365MailboxList(mbs, cur, sel => { if (customInput) customInput.value = sel; });
      }
    });
  }

  if (job.status === "COMPLETED" && job.action === "m365_login") {
    if (typeof Swal !== "undefined" && state.m365SuccessNotified !== job.id) {
      state.m365SuccessNotified = job.id;
      Swal.fire({
        icon: "success",
        title: "Microsoft 365 Autenticado!",
        text: "A sessão com o Exchange Online foi estabelecida com sucesso.",
        timer: 3500,
        showConfirmButton: false,
      });
    }
  }

  if (job.status === "COMPLETED" && currentGroup?.email === job.group) {
    if (job.action === "gcloud_login" && state.googleRetry) {
      const retry = state.googleRetry;
      continueJobButton.textContent = retry.action === "download_backup" ? "Repetir download" : "Repetir consulta";
      continueJobButton.hidden = false;
      continueJobButton.onclick = () => {
        const target = state.overview.groups.find(group => group.email === retry.group);
        state.googleRetry = null;
        if (target) {
          state.selected = target.email;
          renderGroups();
          renderWorkspace(target);
        }
        jobPanel.hidden = true;
        runAction(retry.action);
      };
    } else if (job.action === "download_backup") {
      offerContinuation("Preparar backup selecionado", "prepare");
    } else if (job.action === "prepare") {
      offerContinuation("Verificar conta temporária", "check_staging");
    } else if (job.action === "check_staging" && currentGroup.google_account_status === "NOT_FOUND") {
      offerContinuation("Criar conta temporária", "create_staging");
    } else if (job.action === "check_staging" && currentGroup.google_license_pending) {
      offerContinuation("Já apliquei a licença — verificar", "check_staging");
    } else if (job.action === "check_staging" && currentGroup.google_account_ready) {
      offerContinuation("Auditar Gmail temporário", "audit_staging");
    } else if (job.action === "create_staging" && currentGroup.google_license_pending) {
      offerContinuation("Já apliquei a licença — verificar", "check_staging");
    } else if (["audit_staging", "clean_google_welcome", "load_test", "load_all", "repair_dates"].includes(job.action)) {
      if (currentGroup.verification_failed > 0) {
        offerContinuation("Corrigir mensagens rejeitadas", "repair_dates");
      } else if (currentGroup.remaining_messages > 0) {
        offerContinuation(`Carregar ${formatNumber(currentGroup.remaining_messages)} restantes`, "load_all");
      } else {
        offerContinuation("Consultar destino M365", "m365_status");
      }
    } else if (["m365_status", "create_batch", "create_start_batch"].includes(job.action)) {
      if (currentGroup.exchange_migration_found) {
        offerContinuation("Atualizar estado do lote", "m365_status");
      } else if (currentGroup.exchange_checked) {
        offerContinuation("Criar e iniciar lote M365", "create_start_batch");
      }
    }
  }
  if (job.status === "COMPLETED" && job.action === "discover_remote_groups") {
    continueJobButton.textContent = "Ver grupos encontrados";
    continueJobButton.hidden = false;
    continueJobButton.onclick = () => { jobPanel.hidden = true; };
  }
  if (job.status === "COMPLETED" && job.action === "gcloud_login" && state.googleRetry) {
    const retry = state.googleRetry;
    continueJobButton.textContent = retry.action === "download_backup" ? "Repetir download" : "Repetir consulta";
    continueJobButton.hidden = false;
    continueJobButton.onclick = () => {
      const target = state.overview.groups.find(group => group.email === retry.group);
      state.googleRetry = null;
      if (target) {
        state.selected = target.email;
        renderGroups();
        renderWorkspace(target);
      }
      jobPanel.hidden = true;
      if (retry.action === "discover_remote_groups") runGlobalAction(retry.action);
      else runAction(retry.action);
    };
  }
  closeJobButton.disabled = ["QUEUED", "RUNNING"].includes(job.status);
  if (viewJobEvidenceButton) {
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
      viewJobEvidenceButton.hidden = false;
      viewJobEvidenceButton.onclick = () => {
        showEvidenceModal({ jobId: job.id, event: job });
      };
    } else {
      viewJobEvidenceButton.hidden = true;
    }
  }
  if (job.error && job.status === "FAILED" && !job._alertShown) {
    job._alertShown = true;
    showError(job.error, job.error_code);
  }
}

async function pollJob(jobId) {
  if (state.pollTimer) window.clearTimeout(state.pollTimer);
  try {
    const job = await api(`/api/jobs/${jobId}`);
    renderJob(job);
    if (["QUEUED", "RUNNING"].includes(job.status)) {
      state.pollTimer = window.setTimeout(() => pollJob(jobId), 900);
    } else {
      state.pollTimer = null;
      await loadOverview({ showLoadingOverlay: false });
      
      // Atualização em tempo real ao autenticar contas
      if (job.status === "COMPLETED") {
        if (job.action === "m365_login" || job.action === "gcloud_login") {
          setTimeout(() => {
            jobPanel.hidden = true;
          }, 1200);
          if (typeof Swal !== "undefined") {
            const provider = job.action === "m365_login" ? "Microsoft 365" : "Google Cloud";
            Swal.fire({
              icon: "success",
              title: "Autenticação Concluída!",
              text: `A conta de ${provider} foi autenticada e o status foi atualizado em tempo real.`,
              timer: 3500,
              showConfirmButton: false,
              toast: true,
              position: "top-end"
            });
          }
        }
      }

      const retry = state.googleRetry;
      if (job.status === "COMPLETED" && job.action === "gcloud_login" && ["discover_remote_groups", "remote_backup_inventory"].includes(retry?.action)) {
        const target = state.overview.groups.find(group => group.email === retry.group);
        state.googleRetry = null;
        if (target) {
          state.selected = target.email;
          renderGroups();
          renderWorkspace(target);
        }
        jobPanel.hidden = true;
        if (retry.action === "discover_remote_groups") await runGlobalAction("discover_remote_groups");
        else await runAction("remote_backup_inventory");
        return;
      }
      renderJob(job);
    }
  } catch (error) {
    showError(error.message);
    state.pollTimer = window.setTimeout(() => pollJob(jobId), 1800);
  }
}

async function restoreLatestJob() {
  try {
    const payload = await api("/api/jobs");
    const job = payload.jobs.find(item => ["QUEUED", "RUNNING"].includes(item.status));
    if (job) {
      renderJob(job);
      pollJob(job.id);
    }
  } catch (error) {
    showError(error.message);
  }
}

async function loadOverview(options = {}) {
  const showOverlay = Boolean(options.showLoadingOverlay);
  if (showOverlay) {
    showLoading(options.title || "A atualizar dados do sistema...", options.subtitle || "A consultar estado das contas e conexões cloud.");
  }
  refreshButton.classList.add("spinning");
  try {
    const query = state.selected ? `?group=${encodeURIComponent(state.selected)}` : "";
    state.overview = await api("/api/overview" + query);
    renderSetupStatus();

    const lastUpdateEl = document.querySelector("#last-update");
    if (lastUpdateEl) lastUpdateEl.textContent = new Date().toLocaleTimeString("pt-PT");
    const headerTenantDomain = document.querySelector("#headerTenantDomain");
    if (headerTenantDomain && state.overview.m365_domain) {
      headerTenantDomain.textContent = state.overview.m365_domain;
    }
    const adminUserDisplay = document.querySelector("#adminUserDisplay");
    if (adminUserDisplay && state.overview.exchange_admin) {
      adminUserDisplay.textContent = state.overview.exchange_admin.split("@")[0] || state.overview.exchange_admin;
      adminUserDisplay.title = state.overview.exchange_admin;
    }

    if (!state.overview.groups.length) {
      if (groupSelect) groupSelect.replaceChildren();
      if (selectedGroupState) selectedGroupState.textContent = "Nenhum grupo local; consulte o Google para descobrir backups";
      if (remoteDiscoveryStatus) remoteDiscoveryStatus.textContent = "Autentique o Google e clique em Descobrir novos grupos.";
      workspace.innerHTML = `
        <div class="empty-state p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div class="w-12 h-12 mx-auto rounded-full bg-orange-50 text-enging-orange flex items-center justify-center font-bold">
            <i data-lucide="cloud-off" class="w-6 h-6"></i>
          </div>
          <h2 class="text-xl font-bold text-enging-navy">Nenhum Grupo de Migração Carregado</h2>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Não há grupos locais cadastrados no catálogo. Autentique o Google Cloud e execute a descoberta remota para listar os grupos do Google Takeout.
          </p>
          <div class="pt-2">
            <button onclick="runGlobalAction('discover_remote_groups')" class="px-4 py-2 rounded-xl bg-enging-orange hover:bg-enging-orange-hover text-white text-xs font-bold transition shadow-xs">
              Descobrir Grupos no Google
            </button>
          </div>
        </div>
      `;
      if (typeof lucide !== "undefined") {
        lucide.createIcons();
      }
      return;
    }
    if (!state.selected || !state.overview.groups.some(group => group.email === state.selected)) {
      state.selected = state.overview.groups[0].email;
    }
    renderGroups();
    const activeGroup = state.overview.groups.find(group => group.email === state.selected);
    renderWorkspace(activeGroup);
    renderOverviewGlobal();
    if (state.currentModule === "status" && state.activeSubView === "flow") {
      renderMigrationFlow();
    }
    const discovery = state.overview.remote_discovery || {};
    if (remoteDiscoveryStatus) {
      remoteDiscoveryStatus.textContent = discovery.generated_at
        ? `${formatNumber(discovery.groups_with_backups)} grupo(s) com backup · consulta ${formatDate(discovery.generated_at)}`
        : "Clique para consultar os backups disponíveis no Google.";
    }
  } catch (error) {
    showError(error.message);
    workspace.innerHTML = `
      <div class="empty-state p-12 text-center bg-white rounded-2xl border border-rose-200 shadow-xs space-y-3">
        <div class="w-12 h-12 mx-auto rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
          <i data-lucide="alert-triangle" class="w-6 h-6"></i>
        </div>
        <h2 class="text-xl font-bold text-slate-800">Falha ao Carregar Dados</h2>
        <p class="text-xs text-slate-500 max-w-md mx-auto font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          ${escapeHtml(error.message)}
        </p>
        <div class="pt-2">
          <button onclick="loadOverview({ showLoadingOverlay: true })" class="px-4 py-2 rounded-xl bg-enging-navy text-white text-xs font-bold transition shadow-xs">
            Tentar Novamente
          </button>
        </div>
      </div>
    `;
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  } finally {
    refreshButton.classList.remove("spinning");
    if (showOverlay) {
      hideLoading();
    }
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }
}

function renderSetupStatus() {
  const setup = state.overview?.setup || {};
  const dependencies = setup.dependencies || {};
  const dependencyEntries = ["python", "powershell", "gcloud", "exchange_module", "service_account"];
  const missing = dependencyEntries.filter(name => !dependencies[name]?.ready);
  if (dependenciesDot) dependenciesDot.className = `connection-dot ${missing.length ? "error" : "ready"}`;
  if (dependenciesStatus) {
    dependenciesStatus.textContent = missing.length
      ? `Faltando: ${missing.join(", ")}`
      : "Python, PowerShell, gcloud, Exchange e JSON prontos";
  }

  const google = setup.google || {};
  const googleIsReady = Boolean(google.authenticated);
  const googleHasAccount = Boolean(google.account);
  if (googleConnectionDot) {
    googleConnectionDot.className = googleIsReady
      ? "connection-dot text-emerald-400 text-[10px] font-bold"
      : (googleHasAccount ? "connection-dot text-amber-400 text-[10px] font-bold" : "connection-dot text-slate-500 text-[10px] font-bold");
    googleConnectionDot.textContent = googleIsReady ? "● Online" : (googleHasAccount ? "● Sessão Expirada" : "● Não Conectado");
  }
  if (googleConnectionStatus) {
    googleConnectionStatus.textContent = googleIsReady
      ? `${google.account} · sessão ativa`
      : (googleHasAccount ? `${google.account} · sessão expirada` : "Primeiro login ainda não concluído");
  }
  if (authenticateGoogleButton) {
    authenticateGoogleButton.textContent = googleIsReady ? "Renovar" : "Autenticar";
  }

  const microsoft = setup.microsoft365 || {};
  const m365IsReady = Boolean(microsoft.authenticated);
  const m365HasAccount = Boolean(microsoft.account);
  if (m365ConnectionDot) {
    m365ConnectionDot.className = m365IsReady
      ? "connection-dot text-emerald-400 text-[10px] font-bold"
      : (m365HasAccount ? "connection-dot text-amber-400 text-[10px] font-bold" : "connection-dot text-slate-500 text-[10px] font-bold");
    m365ConnectionDot.textContent = m365IsReady ? "● Online" : (m365HasAccount ? "● Sessão Expirada" : "● Não Conectado");
  }
  if (m365ConnectionStatus) {
    m365ConnectionStatus.textContent = m365IsReady
      ? "ONLINE (NORMAL)"
      : (m365HasAccount ? "SESSÃO EXPIRADA" : "DESCONECTADO");
  }
  const statusPill = document.querySelector("#status-pill");
  if (statusPill) {
    if (m365IsReady) {
      statusPill.className = "flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/40 bg-emerald-50 text-emerald-700 text-xs font-bold";
      const led = statusPill.querySelector("span:first-child");
      if (led) led.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
    } else {
      statusPill.className = "flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-50 text-amber-700 text-xs font-bold";
      const led = statusPill.querySelector("span:first-child");
      if (led) led.className = "w-2 h-2 rounded-full bg-amber-500";
    }
  }
  if (authenticateM365Button) {
    authenticateM365Button.textContent = m365IsReady ? "Renovar" : "Autenticar";
  }

  // System -> Cloud Connections Page elements
  const sysGoogleDot = document.getElementById("systemPageGoogleDot");
  const sysGoogleAccount = document.getElementById("systemPageGoogleAccount");
  if (sysGoogleDot) {
    sysGoogleDot.className = googleIsReady
      ? "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
      : "px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200";
    sysGoogleDot.textContent = googleIsReady ? "● Conectado" : "● Não Conectado";
  }
  if (sysGoogleAccount) {
    sysGoogleAccount.textContent = google.account || state.overview?.google_admin || "Não autenticado";
  }

  const sysM365Dot = document.getElementById("systemPageM365Dot");
  const sysM365Tenant = document.getElementById("systemPageM365Tenant");
  const sysM365Admin = document.getElementById("systemPageM365Admin");
  if (sysM365Dot) {
    sysM365Dot.className = m365IsReady
      ? "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
      : "px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200";
    sysM365Dot.textContent = m365IsReady ? "● Conectado" : "● Não Conectado";
  }
  if (sysM365Tenant) {
    sysM365Tenant.textContent = state.overview?.m365_domain || "dynamox.net";
  }
  if (sysM365Admin) {
    sysM365Admin.textContent = microsoft.account || state.overview?.exchange_admin || "Não autenticado";
  }
  if (state.overview) {
    renderOverviewGlobal();
  }
}


/* ─── M365 Mailboxes & Target Mailbox Dialog ──────────────────────────────── */
let cachedM365Mailboxes = [];

async function fetchM365Mailboxes() {
  try {
    const res = await api("/api/m365/mailboxes");
    cachedM365Mailboxes = res.mailboxes || [];
    return cachedM365Mailboxes;
  } catch (err) {
    console.error("Erro ao carregar caixas M365:", err);
    return [];
  }
}

function renderM365MailboxList(mailboxes, currentSelected, onSelect) {
  const container = document.getElementById("m365MailboxList");
  if (!container) return;
  container.innerHTML = "";

  if (!mailboxes || mailboxes.length === 0) {
    container.innerHTML = '<div class="target-empty-msg">Nenhuma caixa M365 encontrada.<br>Tente outro filtro ou digite o e-mail abaixo.</div>';
    return;
  }

  const maxDisplay = 60;
  const toShow = mailboxes.slice(0, maxDisplay);

  toShow.forEach(m => {
    const item = document.createElement("div");
    const isSelected = (m.primary_smtp || "").toLowerCase() === (currentSelected || "").toLowerCase();
    item.className = "m365-mailbox-item" + (isSelected ? " selected" : "");
    item.setAttribute("role", "option");

    const info = document.createElement("div");
    info.className = "m365-item-info";

    const name = document.createElement("span");
    name.className = "m365-item-name";
    name.textContent = m.display_name || m.primary_smtp;

    const email = document.createElement("span");
    email.className = "m365-item-email";
    email.textContent = m.primary_smtp;

    info.appendChild(name);
    info.appendChild(email);
    item.appendChild(info);

    const badge = document.createElement("span");
    const isUser = m.recipient_type === "UserMailbox";
    badge.className = "m365-item-type " + (isUser ? "user" : "shared");
    badge.textContent = isUser ? "Utilizador" : (m.recipient_type === "SharedMailbox" ? "Partilhada" : (m.recipient_type || "Caixa"));
    item.appendChild(badge);

    item.addEventListener("click", () => {
      container.querySelectorAll(".m365-mailbox-item").forEach(el => el.classList.remove("selected"));
      item.classList.add("selected");
      onSelect(m.primary_smtp);
    });

    container.appendChild(item);
  });

  if (mailboxes.length > maxDisplay) {
    const moreNotice = document.createElement("div");
    moreNotice.className = "target-more-notice";
    moreNotice.textContent = `A mostrar 60 de ${mailboxes.length} caixas disponíveis. Use a pesquisa acima para encontrar rapidamente.`;
    container.appendChild(moreNotice);
  }
}

function openTargetMailboxDialog(group) {
  const dialog = document.getElementById("targetMailboxDialog");
  if (!dialog) return;

  const groupEmail = group.email || state.selected || "";
  const localPart = groupEmail.split("@")[0].toLowerCase();

  const title = document.getElementById("targetDialogGroupSubtitle");
  if (title) title.textContent = `Grupo de origem: ${groupEmail}`;

  const customInput = document.getElementById("targetMailboxCustomInput");
  if (customInput) customInput.value = group.target_mailbox || "";

  const searchInput = document.getElementById("m365SearchInput");
  if (searchInput) {
    searchInput.value = "";
    searchInput.placeholder = `Filtrar por nome ou e-mail (ex: ${localPart})...`;
  }

  const syncStatus = document.getElementById("syncM365StatusText");

  function sortCandidates(list, filterTerm = "") {
    if (filterTerm) return list;
    return [...list].sort((a, b) => {
      const aMatches = ((a.primary_smtp && a.primary_smtp.toLowerCase().includes(localPart)) ||
                        (a.display_name && a.display_name.toLowerCase().includes(localPart))) ? 1 : 0;
      const bMatches = ((b.primary_smtp && b.primary_smtp.toLowerCase().includes(localPart)) ||
                        (b.display_name && b.display_name.toLowerCase().includes(localPart))) ? 1 : 0;
      if (aMatches !== bMatches) return bMatches - aMatches;
      return (a.display_name || a.primary_smtp).localeCompare(b.display_name || b.primary_smtp);
    });
  }

  function updateList(filterText = "") {
    const term = filterText.trim().toLowerCase();
    const filtered = cachedM365Mailboxes.filter(m =>
      !term ||
      (m.primary_smtp && m.primary_smtp.toLowerCase().includes(term)) ||
      (m.display_name && m.display_name.toLowerCase().includes(term))
    );
    const sorted = sortCandidates(filtered, term);
    renderM365MailboxList(sorted, customInput.value.trim().toLowerCase(), (selectedEmail) => {
      customInput.value = selectedEmail;
    });
    if (syncStatus) {
      syncStatus.textContent = `${cachedM365Mailboxes.length} conta(s) M365 sincronizada(s)`;
    }
  }

  if (searchInput) {
    searchInput.oninput = (e) => updateList(e.target.value);
  }

  fetchM365Mailboxes().then(() => {
    updateList();
  });

  const saveBtn = document.getElementById("saveTargetMailboxBtn");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const newTarget = customInput.value.trim().toLowerCase();
      if (!newTarget) {
        showError("Indique o endereço de e-mail de destino no M365.");
        return;
      }
      const emailPattern = /^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;
      if (!emailPattern.test(newTarget)) {
        showError(`O endereço "${newTarget}" não é um e-mail válido.`);
        return;
      }

      saveBtn.disabled = true;
      try {
        const payload = await api(`/api/groups/${encodeURIComponent(groupEmail)}/target-mailbox`, {
          method: "POST",
          body: { target_mailbox: newTarget }
        });
        dialog.close();
        if (typeof Swal !== "undefined") {
          Swal.fire({
            icon: "success",
            title: "Destino atualizado!",
            text: `O destino de ${groupEmail} foi alterado para ${newTarget}.`,
            timer: 2500,
            timerProgressBar: true,
            confirmButtonColor: "#0284c7"
          });
        }
        if (payload.overview) {
          state.overview = payload.overview;
          renderGroups();
          const target = state.overview.groups.find(g => g.email === state.selected);
          if (target) renderWorkspace(target);
        } else {
          loadOverview();
        }
      } catch (err) {
        showError(err.message);
      } finally {
        saveBtn.disabled = false;
      }
    };
  }

  const closeBtn = document.getElementById("closeTargetDialog");
  if (closeBtn) closeBtn.onclick = () => dialog.close();

  const cancelBtn = document.getElementById("cancelTargetDialog");
  if (cancelBtn) cancelBtn.onclick = () => dialog.close();

  const syncBtn = document.getElementById("syncM365MailboxesBtn");
  if (syncBtn) {
    syncBtn.onclick = () => {
      runGlobalAction("sync_m365_mailboxes");
    };
  }

  dialog.showModal();
}

const syncM365NavBtn = document.getElementById("syncM365NavButton");
if (syncM365NavBtn) {
  syncM365NavBtn.addEventListener("click", () => runGlobalAction("sync_m365_mailboxes"));
}
const subnavOverview = document.querySelector("#subnav-overview");
if (subnavOverview) {
  subnavOverview.style.cursor = "pointer";
  subnavOverview.addEventListener("click", () => {
    state.activeTab = "operation";
    const group = selectedGroup();
    if (group) renderWorkspace(group);
  });
}
refreshButton.addEventListener("click", () => {
  loadOverview({ showLoadingOverlay: true, title: "A atualizar dados...", subtitle: "A consultar estado das contas e conexões cloud." });
});
discoverGoogleGroupsButton.addEventListener("click", () => runGlobalAction("discover_remote_groups"));
authenticateGoogleButton.addEventListener("click", () => runGlobalAction("gcloud_login"));
authenticateM365Button.addEventListener("click", () => runGlobalAction("m365_login"));
groupSelect.addEventListener("change", () => {
  state.selected = groupSelect.value;
  const group = selectedGroup();
  if (group) {
    renderGroups();
    renderWorkspace(group);
  }
});
for (const button of functionMenuButtons) {
  button.addEventListener("click", () => {
    state.activeTab = button.dataset.view;
    const group = selectedGroup();
    if (group) renderWorkspace(group);
  });
}
if (deviceAuthCopyBtn) {
  deviceAuthCopyBtn.addEventListener("click", () => {
    if (deviceAuthCode && deviceAuthCode.textContent && deviceAuthCode.textContent !== "--------") {
      navigator.clipboard.writeText(deviceAuthCode.textContent.trim());
      const oldText = deviceAuthCopyBtn.textContent;
      deviceAuthCopyBtn.textContent = "✅ Copiado!";
      setTimeout(() => { deviceAuthCopyBtn.textContent = oldText; }, 2500);
    }
  });
}
closeJobButton.addEventListener("click", () => { jobPanel.hidden = true; });
cancelJobButton.addEventListener("click", async () => {
  if (!state.activeJob) return;
  const result = await confirmation({
    title: "Cancelar o trabalho em curso?",
    message: "A execução será interrompida. Nas cargas Gmail, as mensagens já verificadas continuarão registadas e uma nova execução poderá retomar do ponto seguro.",
    acknowledgement: "Confirmo que quero interromper este trabalho agora.",
  });
  if (!result.confirmed) return;
  try {
    const job = await api(`/api/jobs/${state.activeJob.id}/cancel`, { method: "POST", body: { confirmed: true } });
    if (state.pollTimer) {
      window.clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
    state.activeJob = null;
    renderJob(job);
    jobPanel.hidden = true;
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "info",
        title: "Operação Cancelada",
        text: "O processo foi interrompido com sucesso e o aplicativo retornou ao estado normal.",
        timer: 2500,
        showConfirmButton: false,
      });
    }
    await loadOverview();
  } catch (error) {
    showError(error.message);
  }
});

loadOverview().then(async () => {
  switchMainModule(state.currentModule || "status", state.activeSubView || "overview");
  await restoreLatestJob();
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}).catch(err => {
  console.error("Erro na inicialização:", err);
  showError(err.message || "Erro ao inicializar o painel.");
}).finally(() => {
  hideLoading();
});

// Sincronização em tempo real quando o utilizador regressa à aba após login
window.addEventListener("focus", async () => {
  if (!state.pollTimer) {
    await loadOverview({ showLoadingOverlay: false });
  }
});

// Sincronização em segundo plano periódica a cada 10 segundos para status em tempo real
setInterval(async () => {
  if (!state.pollTimer && document.visibilityState === "visible") {
    await loadOverview({ showLoadingOverlay: false });
  }
}, 10000);

