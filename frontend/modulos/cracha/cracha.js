/**
 * cracha.js — Studio de Crachá LAIFT (antes um <script> inline no
 * index.html; externo para a CSP sem 'unsafe-inline' da Onda 2).
 * Tudo que a pessoa digita vai para o crachá por textContent.
 */
const $ = (id) => document.getElementById(id);

const elements = {
  org: $("orgInput"),
  name: $("nameInput"),
  role: $("roleInput"),
  id: $("idInput"),
  qr: $("qrInput"),
  instructions: $("instructionsInput"),
  bg: $("bgColor"),
  accent: $("accentColor"),
  text: $("textColor"),
  photoUrl: $("photoUrl"),
  photoFile: $("photoFile"),
  showPhoto: $("showPhoto"),
  showOrg: $("showOrg"),
  showRole: $("showRole"),
  showQr: $("showQr"),
  showInstructions: $("showInstructions"),
  showId: $("showId")
};

let localPhotoUrl = "";

function getInitials(name) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "ID";
}

function setVisibility(selector, visible) {
  document.querySelectorAll(selector).forEach((element) => {
    element.classList.toggle("hidden", !visible);
  });
}

/**
 * Desenha o QR como <img> (data URL) com a mesma biblioteca local da
 * credencial da plataforma. Antes: qrcodejs do cdnjs, sem versão fixa
 * verificada nem SRI, e o conteúdo do QR processado por código de terceiro.
 */
function renderQr(target) {
  LaiftDom.clear(target);
  if (typeof qrcode !== "function") return;
  const texto = elements.qr.value.trim() || " ";
  try {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    const qr = qrcode(0, "M");
    qr.addData(texto);
    qr.make();
    const modulos = qr.getModuleCount();
    const img = document.createElement("img");
    img.src = qr.createDataURL(Math.max(2, Math.floor(160 / (modulos + 8))), 4);
    img.alt = "QR Code de validação: " + texto;
    img.width = 160;
    img.height = 160;
    img.style.imageRendering = "pixelated";
    target.appendChild(img);
  } catch (err) {
    target.appendChild(LaiftDom.h("span", { className: "hint", text: "Texto longo demais para o QR Code." }));
  }
}

function renderPhoto() {
  const image = $("photoImage");
  const avatar = $("avatar");
  // Só http(s) ou o blob: do arquivo enviado (nada de javascript:/data: arbitrário).
  const imageUrl = LaiftDom.safeUrl(elements.photoUrl.value.trim()) || localPhotoUrl;

  avatar.textContent = getInitials(elements.name.value);

  if (!imageUrl) {
    image.classList.add("hidden");
    avatar.classList.remove("hidden");
    return;
  }

  image.src = imageUrl;
  image.classList.remove("hidden");
  avatar.classList.add("hidden");

  image.onerror = () => {
    image.classList.add("hidden");
    avatar.classList.remove("hidden");
  };
}

function syncBadge() {
  document.documentElement.style.setProperty("--badge-bg", elements.bg.value);
  document.documentElement.style.setProperty("--badge-accent", elements.accent.value);
  document.documentElement.style.setProperty("--badge-text", elements.text.value);

  document.querySelectorAll(".bind-org").forEach((item) => item.textContent = elements.org.value);
  document.querySelectorAll(".bind-name").forEach((item) => item.textContent = elements.name.value);
  document.querySelectorAll(".bind-role").forEach((item) => item.textContent = elements.role.value);
  document.querySelectorAll(".bind-instructions").forEach((item) => item.textContent = elements.instructions.value);

  document.querySelectorAll(".bind-id").forEach((item) => {
    item.textContent = elements.id.value.trim() ? `ID ${elements.id.value.trim()}` : "";
  });

  setVisibility(".bind-photo", elements.showPhoto.checked);
  setVisibility(".bind-org", elements.showOrg.checked);
  setVisibility(".bind-role", elements.showRole.checked);
  setVisibility(".bind-qr", elements.showQr.checked);
  setVisibility(".bind-instructions", elements.showInstructions.checked);
  setVisibility(".bind-id", elements.showId.checked);

  renderPhoto();
}

let qrDelay;

Object.values(elements).forEach((element) => {
  element.addEventListener("input", () => {
    syncBadge();

    if (element === elements.qr) {
      clearTimeout(qrDelay);
      qrDelay = setTimeout(() => renderQr($("qrCode")), 180);
    }
  });

  element.addEventListener("change", syncBadge);
});

elements.photoFile.addEventListener("change", (event) => {
  const file = event.target.files[0];

  if (!file) return;

  if (localPhotoUrl) {
    URL.revokeObjectURL(localPhotoUrl);
  }

  localPhotoUrl = URL.createObjectURL(file);
  elements.photoUrl.value = "";
  syncBadge();
});

$("flipBtn").addEventListener("click", () => {
  $("card").classList.toggle("flipped");
});

function cloneCardFace(face) {
  const wrapper = document.createElement("div");
  wrapper.className = "print-badge";

  const clone = face.cloneNode(true);

  clone.querySelectorAll("[id]").forEach((element) => {
    element.removeAttribute("id");
  });

  wrapper.appendChild(clone);

  const clonedQr = wrapper.querySelector(".qr-box");

  if (clonedQr && !clonedQr.classList.contains("hidden")) {
    renderQr(clonedQr);
  }

  return wrapper;
}

function preparePrint() {
  const printArea = $("printArea");

  LaiftDom.clear(printArea);
  printArea.appendChild(cloneCardFace($("front")));
  printArea.appendChild(cloneCardFace($("back")));
}

$("printBtn").addEventListener("click", () => {
  preparePrint();
  window.print();
});

window.addEventListener("beforeprint", preparePrint);

syncBadge();
renderQr($("qrCode"));

// O script é carregado no fim do <body>: o DOM já está pronto aqui, mas
// o listener continua valendo se a ordem de carga mudar.
// URLSearchParams já decodifica; o decodeURIComponent extra (legado do
// fiscal, que codificava duas vezes) lançava URIError com um "%" solto.
function decodificar(valor) {
  try { return decodeURIComponent(valor); } catch (e) { return valor; }
}

function aplicarParametros() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const nome = params.get("nome");
  const cargo = params.get("cargo");
  const qr = params.get("qr");

  if (nome) elements.name.value = decodificar(nome);
  if (cargo) elements.role.value = decodificar(cargo);
  if (id) {
    const idLimpo = decodificar(id);
    elements.id.value = idLimpo;
    elements.qr.value = qr ? decodificar(qr) : `LAIFT:ID:${idLimpo}`;
  }

  syncBadge();
  renderQr($("qrCode"));
}

if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", aplicarParametros);
else aplicarParametros();
