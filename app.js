const reader = document.querySelector("#reader");
const supportStatus = document.querySelector("#supportStatus");
const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const imageInput = document.querySelector("#imageInput");
const manualInput = document.querySelector("#manualInput");
const interpretButton = document.querySelector("#interpretButton");
const copyButton = document.querySelector("#copyButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const resultTitle = document.querySelector("#resultTitle");
const summary = document.querySelector("#summary");
const rawOutput = document.querySelector("#rawOutput");
const fields = document.querySelector("#fields");
const actions = document.querySelector("#actions");
const historyList = document.querySelector("#historyList");
const cameraFrame = document.querySelector(".camera-frame");

let detector;
let scannerRunning = false;
let lastValue = "";
let history = JSON.parse(localStorage.getItem("qrIntelHistory") || "[]");

function initDetector() {
  if (!("Html5Qrcode" in window)) {
    supportStatus.textContent = "Leitor não carregado";
    supportStatus.className = "status-pill warn";
    return false;
  }

  if (!detector) {
    detector = new Html5Qrcode("reader", { verbose: false });
  }

  supportStatus.textContent = "Pronto no iOS";
  supportStatus.className = "status-pill ready";
  return true;
}

function saveHistory(item) {
  history = [item, ...history.filter((entry) => entry.raw !== item.raw)].slice(0, 8);
  localStorage.setItem("qrIntelHistory", JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("li");
    empty.className = "history-item";
    empty.innerHTML = "<strong>Vazio</strong><span>As leituras recentes aparecem aqui.</span>";
    historyList.append(empty);
    return;
  }

  history.forEach((item) => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.tabIndex = 0;
    li.innerHTML = `<strong>${escapeHtml(item.type)}</strong><span>${escapeHtml(item.raw.slice(0, 120))}</span>`;
    li.addEventListener("click", () => showResult(interpret(item.raw), false));
    li.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") showResult(interpret(item.raw), false);
    });
    historyList.append(li);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showResult(result, shouldSave = true) {
  lastValue = result.raw;
  resultTitle.textContent = result.type;
  summary.textContent = result.summary;
  rawOutput.textContent = result.raw || "Sem conteúdo.";
  copyButton.disabled = !result.raw;

  fields.innerHTML = "";
  Object.entries(result.fields).forEach(([key, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = key;
    dd.textContent = value || "-";
    fields.append(dt, dd);
  });

  actions.innerHTML = "";
  result.actions.forEach((action) => {
    const link = document.createElement("a");
    link.href = action.href;
    link.textContent = action.label;
    if (action.external) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    actions.append(link);
  });

  if (shouldSave && result.raw) {
    saveHistory({ raw: result.raw, type: result.type, date: new Date().toISOString() });
  }
}

async function startCamera() {
  if (!detector && !initDetector()) {
    showResult({
      type: "Leitura indisponível",
      summary: "Não consegui carregar o leitor de QR. Confira a conexão ou publique o app com os arquivos completos.",
      raw: "",
      fields: { Navegador: navigator.userAgent },
      actions: []
    }, false);
    return;
  }

  await detector.start(
    { facingMode: "environment" },
    {
      fps: 12,
      aspectRatio: 1.333,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
        return { width: edge, height: edge };
      }
    },
    (decodedText) => {
      if (decodedText && decodedText !== lastValue) {
        showResult(interpret(decodedText));
      }
    }
  );

  scannerRunning = true;
  cameraFrame.classList.add("active");
  startButton.disabled = true;
  stopButton.disabled = false;
}

async function stopCamera() {
  if (scannerRunning && detector) {
    await detector.stop();
    await detector.clear();
  }

  scannerRunning = false;
  cameraFrame.classList.remove("active");
  startButton.disabled = false;
  stopButton.disabled = true;
}

async function readImage(file) {
  if (!detector && !initDetector()) return;

  if (scannerRunning) {
    await stopCamera();
  }

  try {
    const decodedText = await detector.scanFile(file, true);
    showResult(interpret(decodedText));
  } catch {
    showResult({
      type: "QR não encontrado",
      summary: "Não encontrei um QR Code nessa imagem. Tente uma imagem mais nítida ou recortada.",
      raw: "",
      fields: { Arquivo: file.name },
      actions: []
    }, false);
  }
}

function interpret(rawInput) {
  const raw = String(rawInput || "").trim();
  const upper = raw.toUpperCase();

  if (!raw) return baseResult("Vazio", "Nenhum conteúdo para interpretar.", raw);
  if (/^https?:\/\//i.test(raw)) return parseUrl(raw);
  if (/^WIFI:/i.test(raw)) return parseWifi(raw);
  if (/^BEGIN:VCARD/i.test(raw)) return parseVcard(raw);
  if (/^BEGIN:VEVENT/i.test(raw)) return parseEvent(raw);
  if (/^MATMSG:/i.test(raw) || /^mailto:/i.test(raw)) return parseEmail(raw);
  if (/^SMSTO:/i.test(raw) || /^sms:/i.test(raw)) return parseSms(raw);
  if (/^tel:/i.test(raw)) return parsePhone(raw);
  if (/^geo:/i.test(raw)) return parseGeo(raw);
  if (looksLikePix(raw)) return parsePix(raw);
  if (looksLikeJson(raw)) return parseJson(raw);
  if (upper.startsWith("OTPAUTH://")) return parseOtp(raw);

  return baseResult("Texto", "Conteúdo textual comum. Dá para copiar, pesquisar ou usar em outro app.", raw, {
    Tamanho: `${raw.length} caracteres`
  }, [
    { label: "Pesquisar", href: `https://www.google.com/search?q=${encodeURIComponent(raw)}`, external: true }
  ]);
}

function baseResult(type, summaryText, raw, extraFields = {}, extraActions = []) {
  return {
    type,
    summary: summaryText,
    raw,
    fields: {
      Tipo: type,
      ...extraFields
    },
    actions: extraActions
  };
}

function parseUrl(raw) {
  const url = new URL(raw);
  const suspicious = isSuspiciousUrl(url);
  return baseResult(
    suspicious ? "Link suspeito" : "Link",
    suspicious
      ? "O QR contém um link, mas alguns sinais merecem atenção antes de abrir."
      : `Link para ${url.hostname}. Confira o endereço antes de abrir.`,
    raw,
    {
      Domínio: url.hostname,
      Protocolo: url.protocol.replace(":", ""),
      Caminho: url.pathname,
      Aviso: suspicious ? "URL curta, IP direto, caracteres incomuns ou protocolo inseguro." : "Nenhum alerta básico."
    },
    [{ label: "Abrir link", href: raw, external: true }]
  );
}

function isSuspiciousUrl(url) {
  const host = url.hostname;
  const hasIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const shorteners = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "cutt.ly"];
  const oddChars = /xn--|@|%00/i.test(url.href);
  return url.protocol !== "https:" || hasIp || shorteners.includes(host) || oddChars;
}

function parseWifi(raw) {
  const body = raw.replace(/^WIFI:/i, "").replace(/;;$/, "");
  const parts = parseSemicolonFields(body);
  const security = parts.T || "sem senha";
  return baseResult("Wi-Fi", `Rede Wi-Fi "${parts.S || "sem nome"}" com segurança ${security}.`, raw, {
    Rede: parts.S || "",
    Segurança: security,
    Senha: parts.P || "",
    Oculta: parts.H || "false"
  });
}

function parseSemicolonFields(body) {
  const parts = {};
  let key = "";
  let value = "";
  let readingKey = true;
  let escaped = false;

  for (const char of body) {
    if (escaped) {
      value += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (readingKey && char === ":") {
      readingKey = false;
    } else if (char === ";") {
      if (key) parts[key] = value;
      key = "";
      value = "";
      readingKey = true;
    } else if (readingKey) {
      key += char;
    } else {
      value += char;
    }
  }

  if (key) parts[key] = value;
  return parts;
}

function parseVcard(raw) {
  const map = parseLines(raw);
  return baseResult("Contato", `Contato ${map.FN || map.N || "sem nome"} encontrado.`, raw, {
    Nome: map.FN || map.N || "",
    Telefone: map.TEL || "",
    Email: map.EMAIL || "",
    Empresa: map.ORG || "",
    Site: map.URL || ""
  }, map.TEL ? [{ label: "Ligar", href: `tel:${map.TEL}` }] : []);
}

function parseEvent(raw) {
  const map = parseLines(raw);
  return baseResult("Evento", `Evento ${map.SUMMARY || "sem título"} encontrado.`, raw, {
    Título: map.SUMMARY || "",
    Início: formatIcsDate(map.DTSTART),
    Fim: formatIcsDate(map.DTEND),
    Local: map.LOCATION || "",
    Descrição: map.DESCRIPTION || ""
  });
}

function parseLines(raw) {
  return raw.split(/\r?\n/).reduce((map, line) => {
    const index = line.indexOf(":");
    if (index === -1) return map;
    const key = line.slice(0, index).split(";")[0].toUpperCase();
    const value = line.slice(index + 1).replace(/\\n/g, "\n");
    map[key] = value;
    return map;
  }, {});
}

function formatIcsDate(value) {
  if (!value) return "";
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/);
  if (!match) return value;
  const [, year, month, day, hour = "00", minute = "00"] = match;
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function parseEmail(raw) {
  if (/^mailto:/i.test(raw)) {
    const url = new URL(raw);
    return baseResult("E-mail", `E-mail para ${url.pathname}.`, raw, {
      Para: url.pathname,
      Assunto: url.searchParams.get("subject") || "",
      Mensagem: url.searchParams.get("body") || ""
    }, [{ label: "Escrever e-mail", href: raw }]);
  }

  const body = raw.replace(/^MATMSG:/i, "");
  const parts = parseSemicolonFields(body);
  const mailto = `mailto:${encodeURIComponent(parts.TO || "")}?subject=${encodeURIComponent(parts.SUB || "")}&body=${encodeURIComponent(parts.BODY || "")}`;
  return baseResult("E-mail", `E-mail para ${parts.TO || "destinatário não identificado"}.`, raw, {
    Para: parts.TO || "",
    Assunto: parts.SUB || "",
    Mensagem: parts.BODY || ""
  }, [{ label: "Escrever e-mail", href: mailto }]);
}

function parseSms(raw) {
  const normalized = raw.replace(/^SMSTO:/i, "sms:");
  const body = normalized.replace(/^sms:/i, "");
  const [number, message = ""] = body.split(":");
  return baseResult("SMS", `SMS para ${number}.`, raw, {
    Número: number,
    Mensagem: message
  }, [{ label: "Enviar SMS", href: `sms:${number}?body=${encodeURIComponent(message)}` }]);
}

function parsePhone(raw) {
  const number = raw.replace(/^tel:/i, "");
  return baseResult("Telefone", `Número de telefone ${number}.`, raw, {
    Número: number
  }, [{ label: "Ligar", href: `tel:${number}` }]);
}

function parseGeo(raw) {
  const value = raw.replace(/^geo:/i, "");
  const [coords] = value.split("?");
  const [lat, lng] = coords.split(",");
  return baseResult("Localização", `Coordenadas ${lat}, ${lng}.`, raw, {
    Latitude: lat || "",
    Longitude: lng || ""
  }, [{ label: "Abrir mapa", href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`, external: true }]);
}

function looksLikePix(raw) {
  return /^000201/.test(raw) && /BR\.GOV\.BCB\.PIX/i.test(raw);
}

function parsePix(raw) {
  const pix = parseEmv(raw);
  const merchantAccount = parseEmv(pix["26"] || "");
  const merchant = pix["59"] || "";
  const city = pix["60"] || "";
  const amount = pix["54"] || "";
  return baseResult("Pix", amount ? `Pix para ${merchant} no valor de R$ ${amount}.` : `Pix para ${merchant || "recebedor não identificado"}.`, raw, {
    "Chave Pix": merchantAccount["01"] || "",
    Descrição: merchantAccount["02"] || "",
    Recebedor: merchant,
    Cidade: city,
    Valor: amount ? `R$ ${amount}` : "Não informado",
    Moeda: pix["53"] === "986" ? "BRL" : pix["53"] || "",
    CRC: pix["63"] || ""
  });
}

function parseEmv(value) {
  const result = {};
  let index = 0;
  while (index + 4 <= value.length) {
    const id = value.slice(index, index + 2);
    const length = Number(value.slice(index + 2, index + 4));
    if (!Number.isFinite(length)) break;
    const data = value.slice(index + 4, index + 4 + length);
    result[id] = data;
    index += 4 + length;
  }
  return result;
}

function looksLikeJson(raw) {
  return /^[\[{]/.test(raw);
}

function parseJson(raw) {
  try {
    const data = JSON.parse(raw);
    const keys = Array.isArray(data) ? data.length : Object.keys(data).length;
    return baseResult("JSON", `Dados estruturados em JSON com ${keys} item(ns) no nível principal.`, raw, {
      Estrutura: Array.isArray(data) ? "Lista" : "Objeto",
      Itens: String(keys)
    });
  } catch {
    return baseResult("Texto", "Parece JSON, mas não consegui validar a estrutura.", raw, {
      Aviso: "JSON inválido"
    });
  }
}

function parseOtp(raw) {
  const url = new URL(raw);
  return baseResult("Autenticador 2FA", "QR de configuração para aplicativo autenticador. Trate este conteúdo como secreto.", raw, {
    Conta: decodeURIComponent(url.pathname.replace(/^\//, "")),
    Emissor: url.searchParams.get("issuer") || "",
    Algoritmo: url.searchParams.get("algorithm") || "SHA1",
    Dígitos: url.searchParams.get("digits") || "6"
  });
}

startButton.addEventListener("click", () => {
  startCamera().catch((error) => {
    showResult({
      type: "Câmera bloqueada",
      summary: "Não consegui acessar a câmera. Verifique a permissão do navegador e tente novamente.",
      raw: "",
      fields: { Erro: error.message },
      actions: []
    }, false);
  });
});

stopButton.addEventListener("click", () => {
  stopCamera().catch(() => {
    scannerRunning = false;
    cameraFrame.classList.remove("active");
  });
});

imageInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) readImage(file);
});

interpretButton.addEventListener("click", () => {
  showResult(interpret(manualInput.value));
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(lastValue);
  copyButton.textContent = "Copiado";
  window.setTimeout(() => {
    copyButton.textContent = "Copiar";
  }, 1200);
});

clearHistoryButton.addEventListener("click", () => {
  history = [];
  localStorage.removeItem("qrIntelHistory");
  renderHistory();
});

initDetector();
renderHistory();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
