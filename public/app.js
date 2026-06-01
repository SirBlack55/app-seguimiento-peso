const STORAGE_KEY = "mi-peso-pwa-state-v1";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STATE = {
  entries: [],
  goal: "",
};

let state = loadState();
let editingId = null;
let deferredInstallPrompt = null;
let toastTimer = null;

const refs = {
  currentWeight: document.querySelector("#currentWeight"),
  currentDate: document.querySelector("#currentDate"),
  totalChange: document.querySelector("#totalChange"),
  totalLabel: document.querySelector("#totalLabel"),
  weeklyTrend: document.querySelector("#weeklyTrend"),
  weeklyLabel: document.querySelector("#weeklyLabel"),
  goalDistance: document.querySelector("#goalDistance"),
  goalLabel: document.querySelector("#goalLabel"),
  entryForm: document.querySelector("#entryForm"),
  entryTitle: document.querySelector("#entryTitle"),
  dateInput: document.querySelector("#dateInput"),
  weightInput: document.querySelector("#weightInput"),
  noteInput: document.querySelector("#noteInput"),
  saveEntryButton: document.querySelector("#saveEntryButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  goalForm: document.querySelector("#goalForm"),
  goalInput: document.querySelector("#goalInput"),
  rangeSelect: document.querySelector("#rangeSelect"),
  weightChart: document.querySelector("#weightChart"),
  chartEmpty: document.querySelector("#chartEmpty"),
  historyList: document.querySelector("#historyList"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  exportJsonButton: document.querySelector("#exportJsonButton"),
  importInput: document.querySelector("#importInput"),
  clearDataButton: document.querySelector("#clearDataButton"),
  installHelp: document.querySelector("#installHelp"),
  installButton: document.querySelector("#installButton"),
  toast: document.querySelector("#toast"),
};

init();

function init() {
  refs.dateInput.value = todayISO();
  refs.dateInput.max = todayISO();
  refs.goalInput.value = state.goal || "";

  refs.entryForm.addEventListener("submit", handleEntrySubmit);
  refs.cancelEditButton.addEventListener("click", resetEntryForm);
  refs.goalForm.addEventListener("submit", handleGoalSubmit);
  refs.rangeSelect.addEventListener("change", renderChart);
  refs.historyList.addEventListener("click", handleHistoryAction);
  refs.exportCsvButton.addEventListener("click", exportCsv);
  refs.exportJsonButton.addEventListener("click", exportJson);
  refs.importInput.addEventListener("change", importJson);
  refs.clearDataButton.addEventListener("click", clearAllData);
  refs.installButton.addEventListener("click", promptInstall);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    refs.installButton.hidden = false;
  });

  if (isStandalone()) {
    refs.installHelp.hidden = true;
  }

  registerServiceWorker();
  render();
}

function loadState() {
  try {
    const rawState = localStorage.getItem(STORAGE_KEY);
    return normalizeState(rawState ? JSON.parse(rawState) : DEFAULT_STATE);
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function normalizeState(rawState) {
  const rawEntries = Array.isArray(rawState?.entries) ? rawState.entries : [];
  const entries = rawEntries
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : createId(),
      date: typeof entry.date === "string" ? entry.date : "",
      weight: roundWeight(Number(entry.weight)),
      note: typeof entry.note === "string" ? entry.note.slice(0, 140) : "",
    }))
    .filter((entry) => isValidDate(entry.date) && isValidWeight(entry.weight))
    .sort(sortByDateAsc);

  const goal = roundWeight(Number(rawState?.goal));

  return {
    entries,
    goal: isValidWeight(goal) ? goal : "",
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  state.entries.sort(sortByDateAsc);
  renderSummary();
  renderChart();
  renderHistory();
}

function renderSummary() {
  const entries = state.entries;
  const firstEntry = entries[0];
  const latestEntry = entries[entries.length - 1];

  resetDeltaClasses(refs.totalChange, refs.weeklyTrend, refs.goalDistance);

  if (!latestEntry) {
    refs.currentWeight.textContent = "—";
    refs.currentDate.textContent = "Añade tu primer registro";
    refs.totalChange.textContent = "—";
    refs.totalLabel.textContent = "Desde el primer registro";
    refs.weeklyTrend.textContent = "—";
    refs.weeklyLabel.textContent = "Últimos registros";
    refs.goalDistance.textContent = "—";
    refs.goalLabel.textContent = state.goal ? `Meta: ${formatWeight(state.goal)}` : "Define una meta";
    return;
  }

  refs.currentWeight.textContent = formatWeight(latestEntry.weight);
  refs.currentDate.textContent = formatDate(latestEntry.date);

  if (entries.length > 1) {
    const totalDelta = roundWeight(latestEntry.weight - firstEntry.weight);
    refs.totalChange.textContent = formatDelta(totalDelta);
    refs.totalLabel.textContent = `Desde ${formatDate(firstEntry.date)}`;
    applyDeltaClass(refs.totalChange, totalDelta);
  } else {
    refs.totalChange.textContent = "—";
    refs.totalLabel.textContent = "Necesitas otro registro";
  }

  const comparisonEntry = findComparisonEntry(entries, latestEntry.date, 7);
  if (comparisonEntry) {
    const trendDelta = roundWeight(latestEntry.weight - comparisonEntry.weight);
    refs.weeklyTrend.textContent = formatDelta(trendDelta);
    refs.weeklyLabel.textContent = `vs ${formatDate(comparisonEntry.date)}`;
    applyDeltaClass(refs.weeklyTrend, trendDelta);
  } else {
    refs.weeklyTrend.textContent = "—";
    refs.weeklyLabel.textContent = "Necesitas otro registro";
  }

  if (state.goal) {
    const distance = roundWeight(latestEntry.weight - state.goal);
    const absDistance = Math.abs(distance);
    refs.goalDistance.textContent =
      absDistance < 0.05 ? "Meta lograda" : `${formatNumber(absDistance)} kg`;
    refs.goalLabel.textContent =
      absDistance < 0.05
        ? `Objetivo: ${formatWeight(state.goal)}`
        : `${distance > 0 ? "por encima" : "por debajo"} de ${formatWeight(state.goal)}`;
    applyDeltaClass(refs.goalDistance, distance);
  } else {
    refs.goalDistance.textContent = "—";
    refs.goalLabel.textContent = "Define una meta";
  }
}

function renderChart() {
  const entries = getVisibleEntries();
  refs.weightChart.innerHTML = "";
  refs.chartEmpty.hidden = entries.length >= 2;

  if (entries.length < 2) {
    return;
  }

  const width = 640;
  const height = 280;
  const padding = { top: 28, right: 28, bottom: 44, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const times = entries.map((entry) => dateToTime(entry.date));
  const weights = entries.map((entry) => entry.weight);
  const valuePool = state.goal ? weights.concat(state.goal) : weights;
  let minValue = Math.min(...valuePool);
  let maxValue = Math.max(...valuePool);

  if (minValue === maxValue) {
    minValue -= 1;
    maxValue += 1;
  } else {
    const valuePadding = (maxValue - minValue) * 0.16;
    minValue -= valuePadding;
    maxValue += valuePadding;
  }

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const xForDate = (date) => {
    if (maxTime === minTime) {
      return padding.left + chartWidth / 2;
    }

    return padding.left + ((dateToTime(date) - minTime) / (maxTime - minTime)) * chartWidth;
  };
  const yForWeight = (weight) =>
    padding.top + ((maxValue - weight) / (maxValue - minValue)) * chartHeight;

  const points = entries.map((entry) => ({
    ...entry,
    x: xForDate(entry.date),
    y: yForWeight(entry.weight),
  }));
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${padding.top + chartHeight} L ${points[0].x.toFixed(2)} ${padding.top + chartHeight} Z`;
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const y = padding.top + ratio * chartHeight;
    const value = maxValue - ratio * (maxValue - minValue);
    return `
      <line x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}" stroke="rgba(100,116,139,.18)" />
      <text x="${padding.left - 12}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="12">${formatNumber(value)}</text>
    `;
  }).join("");
  const firstPoint = points[0];
  const latestPoint = points[points.length - 1];
  const goalLine = state.goal
    ? `<line x1="${padding.left}" x2="${width - padding.right}" y1="${yForWeight(state.goal)}" y2="${yForWeight(state.goal)}" stroke="#f59e0b" stroke-width="2" stroke-dasharray="7 7" />
       <text x="${width - padding.right}" y="${yForWeight(state.goal) - 8}" text-anchor="end" fill="#b45309" font-size="13" font-weight="800">meta ${formatWeight(state.goal)}</text>`
    : "";
  const circles = points
    .map(
      (point) => `
        <circle cx="${point.x}" cy="${point.y}" r="5.5" fill="#0f766e" stroke="#fff" stroke-width="3">
          <title>${formatDate(point.date)} · ${formatWeight(point.weight)}</title>
        </circle>
      `,
    )
    .join("");

  refs.weightChart.innerHTML = `
    <defs>
      <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#0f766e" />
        <stop offset="100%" stop-color="#0284c7" />
      </linearGradient>
      <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#14b8a6" stop-opacity=".26" />
        <stop offset="100%" stop-color="#14b8a6" stop-opacity="0" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
    ${gridLines}
    ${goalLine}
    <path d="${areaPath}" fill="url(#areaGradient)" />
    <path d="${linePath}" fill="none" stroke="url(#lineGradient)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    ${circles}
    <text x="${firstPoint.x}" y="${height - 16}" text-anchor="middle" fill="#64748b" font-size="13">${shortDate(firstPoint.date)}</text>
    <text x="${latestPoint.x}" y="${height - 16}" text-anchor="middle" fill="#64748b" font-size="13">${shortDate(latestPoint.date)}</text>
    <text x="${latestPoint.x}" y="${latestPoint.y - 16}" text-anchor="middle" fill="#0f172a" font-size="15" font-weight="900">${formatWeight(latestPoint.weight)}</text>
  `;
}

function renderHistory() {
  refs.historyList.replaceChildren();

  if (!state.entries.length) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-history";
    emptyMessage.textContent = "Todavía no hay registros. El primero siempre cuesta menos de lo que parece.";
    refs.historyList.append(emptyMessage);
    return;
  }

  state.entries
    .slice()
    .sort(sortByDateDesc)
    .forEach((entry) => {
      const item = document.createElement("article");
      item.className = "entry-item";

      const main = document.createElement("div");
      main.className = "entry-main";

      const weight = document.createElement("strong");
      weight.textContent = formatWeight(entry.weight);

      const date = document.createElement("span");
      date.textContent = formatDate(entry.date);

      main.append(weight, date);

      if (entry.note) {
        const note = document.createElement("p");
        note.textContent = entry.note;
        main.append(note);
      }

      const actions = document.createElement("div");
      actions.className = "entry-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Editar";
      editButton.dataset.edit = entry.id;

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Borrar";
      deleteButton.dataset.delete = entry.id;

      actions.append(editButton, deleteButton);
      item.append(main, actions);
      refs.historyList.append(item);
    });
}

function handleEntrySubmit(event) {
  event.preventDefault();

  const formData = new FormData(refs.entryForm);
  const date = String(formData.get("date") || "");
  const weight = roundWeight(Number(String(formData.get("weight") || "").replace(",", ".")));
  const note = String(formData.get("note") || "").trim().slice(0, 140);

  if (!isValidDate(date)) {
    showToast("Elige una fecha válida.");
    return;
  }

  if (dateToTime(date) > dateToTime(todayISO())) {
    showToast("La fecha no puede estar en el futuro.");
    return;
  }

  if (!isValidWeight(weight)) {
    showToast("Introduce un peso entre 20 y 350 kg.");
    return;
  }

  const existingEntry = state.entries.find((entry) => entry.date === date && entry.id !== editingId);
  if (existingEntry && !confirm("Ya existe un registro para esa fecha. ¿Quieres reemplazarlo?")) {
    return;
  }

  if (existingEntry) {
    state.entries = state.entries.filter((entry) => entry.id !== existingEntry.id);
  }

  if (editingId) {
    state.entries = state.entries.map((entry) =>
      entry.id === editingId ? { ...entry, date, weight, note } : entry,
    );
    showToast("Registro actualizado.");
  } else {
    state.entries.push({ id: createId(), date, weight, note });
    showToast("Registro guardado.");
  }

  state.entries.sort(sortByDateAsc);
  saveState();
  resetEntryForm();
  render();
}

function handleGoalSubmit(event) {
  event.preventDefault();

  const rawGoal = refs.goalInput.value.trim();
  if (!rawGoal) {
    state.goal = "";
    saveState();
    render();
    showToast("Objetivo eliminado.");
    return;
  }

  const goal = roundWeight(Number(rawGoal.replace(",", ".")));
  if (!isValidWeight(goal)) {
    showToast("Introduce un objetivo entre 20 y 350 kg.");
    return;
  }

  state.goal = goal;
  refs.goalInput.value = goal;
  saveState();
  render();
  showToast("Objetivo actualizado.");
}

function handleHistoryAction(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const editId = button.dataset.edit;
  const deleteId = button.dataset.delete;

  if (editId) {
    startEditing(editId);
  }

  if (deleteId) {
    deleteEntry(deleteId);
  }
}

function startEditing(entryId) {
  const entry = state.entries.find((currentEntry) => currentEntry.id === entryId);
  if (!entry) {
    return;
  }

  editingId = entry.id;
  refs.entryTitle.textContent = "Editar registro";
  refs.dateInput.value = entry.date;
  refs.weightInput.value = entry.weight;
  refs.noteInput.value = entry.note;
  refs.saveEntryButton.textContent = "Actualizar registro";
  refs.cancelEditButton.hidden = false;
  refs.weightInput.focus();
}

function resetEntryForm() {
  editingId = null;
  refs.entryForm.reset();
  refs.dateInput.value = todayISO();
  refs.dateInput.max = todayISO();
  refs.entryTitle.textContent = "Añadir peso";
  refs.saveEntryButton.textContent = "Guardar registro";
  refs.cancelEditButton.hidden = true;
}

function deleteEntry(entryId) {
  const entry = state.entries.find((currentEntry) => currentEntry.id === entryId);
  if (!entry || !confirm(`¿Borrar el registro de ${formatDate(entry.date)}?`)) {
    return;
  }

  state.entries = state.entries.filter((currentEntry) => currentEntry.id !== entryId);
  saveState();
  render();
  showToast("Registro borrado.");
}

function exportCsv() {
  if (!state.entries.length) {
    showToast("No hay datos para exportar.");
    return;
  }

  const header = ["fecha", "peso_kg", "nota"];
  const rows = state.entries.map((entry) => [entry.date, entry.weight, entry.note]);
  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  downloadBlob(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }), "seguimiento-peso.csv");
  showToast("CSV exportado.");
}

function exportJson() {
  const payload = {
    app: "mi-peso-pwa",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: state.entries,
    goal: state.goal,
  };

  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    "seguimiento-peso.json",
  );
  showToast("JSON exportado.");
}

async function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const importedState = normalizeState(Array.isArray(parsed) ? { entries: parsed } : parsed);

    if (!importedState.entries.length && !confirm("El archivo no contiene registros válidos. ¿Importar igualmente?")) {
      return;
    }

    state = importedState;
    refs.goalInput.value = state.goal || "";
    saveState();
    resetEntryForm();
    render();
    showToast("Datos importados.");
  } catch {
    showToast("No se pudo importar el archivo JSON.");
  } finally {
    refs.importInput.value = "";
  }
}

function clearAllData() {
  if (!state.entries.length && !state.goal) {
    showToast("No hay datos que borrar.");
    return;
  }

  if (!confirm("Esto borrará todos tus registros guardados en este dispositivo. ¿Continuar?")) {
    return;
  }

  state = { ...DEFAULT_STATE, entries: [] };
  refs.goalInput.value = "";
  saveState();
  resetEntryForm();
  render();
  showToast("Datos borrados.");
}

function getVisibleEntries() {
  const entries = state.entries.slice().sort(sortByDateAsc);
  const selectedRange = refs.rangeSelect.value;
  if (selectedRange === "all" || entries.length < 2) {
    return entries;
  }

  const latestEntry = entries[entries.length - 1];
  const cutoff = dateToTime(latestEntry.date) - Number(selectedRange) * DAY_IN_MS;
  return entries.filter((entry) => dateToTime(entry.date) >= cutoff);
}

function findComparisonEntry(entries, latestDate, daysBack) {
  if (entries.length < 2) {
    return null;
  }

  const cutoff = dateToTime(latestDate) - daysBack * DAY_IN_MS;
  let comparisonEntry = null;

  for (const entry of entries) {
    if (dateToTime(entry.date) <= cutoff) {
      comparisonEntry = entry;
    }
  }

  return comparisonEntry || entries[entries.length - 2];
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      showToast("La app funciona, pero el modo offline no se pudo activar.");
    });
  });
}

async function promptInstall() {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  refs.installButton.hidden = true;
}

function isStandalone() {
  return window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(dateToTime(date));
}

function isValidWeight(weight) {
  return Number.isFinite(weight) && weight >= 20 && weight <= 350;
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayISO() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function dateToTime(date) {
  return new Date(`${date}T00:00:00`).getTime();
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function shortDate(date) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${date}T00:00:00`));
}

function formatWeight(weight) {
  return `${formatNumber(weight)} kg`;
}

function formatDelta(delta) {
  if (Math.abs(delta) < 0.05) {
    return "0 kg";
  }

  return `${delta > 0 ? "+" : ""}${formatNumber(delta)} kg`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

function roundWeight(value) {
  return Math.round(value * 10) / 10;
}

function sortByDateAsc(firstEntry, secondEntry) {
  return firstEntry.date.localeCompare(secondEntry.date);
}

function sortByDateDesc(firstEntry, secondEntry) {
  return secondEntry.date.localeCompare(firstEntry.date);
}

function applyDeltaClass(element, delta) {
  if (delta < -0.05) {
    element.classList.add("delta-down");
  } else if (delta > 0.05) {
    element.classList.add("delta-up");
  }
}

function resetDeltaClasses(...elements) {
  elements.forEach((element) => element.classList.remove("delta-down", "delta-up"));
}

function escapeCsv(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showToast(message) {
  clearTimeout(toastTimer);
  refs.toast.textContent = message;
  refs.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => refs.toast.classList.remove("is-visible"), 2600);
}
