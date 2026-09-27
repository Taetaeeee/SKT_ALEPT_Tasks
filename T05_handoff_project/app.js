const imageInput = document.querySelector("#imageInput");
const imageDropZone = document.querySelector("#imageDropZone");
const fileMessage = document.querySelector("#fileMessage");
const textList = document.querySelector("#textList");
const addTextBtn = document.querySelector("#addTextBtn");
const fontSize = document.querySelector("#fontSize");
const rotation = document.querySelector("#rotation");
const rotationInput = document.querySelector("#rotationInput");
const textColor = document.querySelector("#textColor");
const fontSizeValue = document.querySelector("#fontSizeValue");
const rotationValue = document.querySelector("#rotationValue");
const positionValue = document.querySelector("#positionValue");
const ratioLabel = document.querySelector("#ratioLabel");
const ratioButtons = [...document.querySelectorAll(".ratio-btn")];
const downloadBtn = document.querySelector("#downloadBtn");
const resetBtn = document.querySelector("#resetBtn");
const imagePositionBtn = document.querySelector("#imagePositionBtn");
const templateNameInput = document.querySelector("#templateNameInput");
const saveTemplateBtn = document.querySelector("#saveTemplateBtn");
const templateMessage = document.querySelector("#templateMessage");
const templateList = document.querySelector("#templateList");
const exportJsonBtn = document.querySelector("#exportJsonBtn");
const importJsonInput = document.querySelector("#importJsonInput");
const jsonMessage = document.querySelector("#jsonMessage");
const canvas = document.querySelector("#previewCanvas");
const ctx = canvas.getContext("2d");

const RATIO_SIZES = {
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
  "9:16": [1080, 1920],
};

const TEMPLATE_STORAGE_KEY = "memeMakerTemplatesV1";
const TEMPLATE_IMAGE_MAX_SIZE = 1000;
const JSON_FORMAT = "meme-maker-templates";
const JSON_VERSION = 1;

let templates = [];
let loadedTemplateId = null;
let textIdSequence = 1;
let downloadSequence = 1;

function createTextBlock(overrides = {}) {
  return {
    id: textIdSequence++,
    text: "",
    x: 50,
    y: 50,
    fontSize: 48,
    color: "#ffffff",
    rotation: 0,
    ...overrides,
  };
}

const state = {
  image: null,
  imageName: "",
  imageData: "",
  imageOffsetX: 0,
  imageOffsetY: 0,
  ratio: "1:1",
  texts: [createTextBlock()],
  activeTextId: 1,
};

const drag = {
  active: false,
  type: null,
  offsetX: 0,
  offsetY: 0,
  textId: null,
  startPointerX: 0,
  startPointerY: 0,
  startImageOffsetX: 0,
  startImageOffsetY: 0,
};

let imageMoveMode = false;

function getActiveText() {
  return state.texts.find((item) => item.id === state.activeTextId) || null;
}

function updateTextSelectionUI() {
  const items = [...textList.querySelectorAll(".text-item")];

  items.forEach((item) => {
    const id = Number(item.dataset.id);
    const isActive = id === state.activeTextId;
    item.classList.toggle("is-active", isActive);

    const selectBtn = item.querySelector('[data-role="select-text"]');
    if (selectBtn) {
      selectBtn.textContent = isActive ? "선택됨" : "선택";
      selectBtn.setAttribute("aria-pressed", String(isActive));
    }
  });
}

function setActiveText(id) {
  if (!state.texts.some((item) => item.id === id)) return;

  state.activeTextId = id;
  updateTextSelectionUI();
  updateOutputs();
  render();
}

function setMessage(text, type = "") {
  fileMessage.textContent = text;
  fileMessage.className = `message ${type}`.trim();
}

function updateOutputs() {
  const activeText = getActiveText();

  if (!activeText) {
    fontSizeValue.value = "-";
    rotationValue.value = "-";
    rotationInput.value = 0;
    positionValue.value = "-";
    return;
  }

  fontSize.value = activeText.fontSize;
  rotation.value = activeText.rotation;
  textColor.value = activeText.color;
  fontSizeValue.value = `${activeText.fontSize}px`;
  rotationValue.value = `${activeText.rotation}°`;
  rotationInput.value = activeText.rotation;
  positionValue.value = `${Math.round(activeText.x)}%, ${Math.round(activeText.y)}%`;
}

function setCanvasRatio(ratio) {
  const [width, height] = RATIO_SIZES[ratio];
  canvas.width = width;
  canvas.height = height;
  ratioLabel.textContent = ratio;
}

function getImageCoverLayout(img) {
  const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;
  const overflowX = Math.max(0, width - canvas.width);
  const overflowY = Math.max(0, height - canvas.height);
  const centerX = -overflowX / 2;
  const centerY = -overflowY / 2;
  const x = centerX + (state.imageOffsetX / 100) * (overflowX / 2);
  const y = centerY + (state.imageOffsetY / 100) * (overflowY / 2);

  return { x, y, width, height, overflowX, overflowY };
}

function drawCoverImage(img) {
  const layout = getImageCoverLayout(img);
  ctx.drawImage(img, layout.x, layout.y, layout.width, layout.height);
}

function updateImagePositionButton() {
  const hasImage = Boolean(state.image);
  imagePositionBtn.disabled = !hasImage;
  imagePositionBtn.classList.toggle("is-active", imageMoveMode && hasImage);
  imagePositionBtn.setAttribute("aria-pressed", String(imageMoveMode && hasImage));
  canvas.classList.toggle("image-move-mode", imageMoveMode && hasImage);
}

function setImageMoveMode(enabled) {
  imageMoveMode = Boolean(enabled && state.image);
  updateImagePositionButton();
}

function resetImagePosition() {
  state.imageOffsetX = 0;
  state.imageOffsetY = 0;
}

function splitTextIntoLines(text) {
  return text.split(/\r?\n/);
}

function getTextMetrics(textBlock) {
  if (!textBlock || !textBlock.text) return null;

  const x = (textBlock.x / 100) * canvas.width;
  const y = (textBlock.y / 100) * canvas.height;
  const scale = canvas.width / 1080;
  const actualFontSize = textBlock.fontSize * scale;
  const lineHeight = actualFontSize * 1.25;
  const lines = splitTextIntoLines(textBlock.text);
  ctx.font = `800 ${actualFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const lineWidths = lines.map((line) => ctx.measureText(line || " ").width);
  const maxWidth = Math.max(...lineWidths, 0);
  const totalHeight = lineHeight * lines.length;

  return { x, y, actualFontSize, lineHeight, lines, maxWidth, totalHeight };
}

function renderTextBlock(textBlock, isActive = false) {
  const metrics = getTextMetrics(textBlock);
  if (!metrics) return;

  ctx.save();
  ctx.translate(metrics.x, metrics.y);
  ctx.rotate((textBlock.rotation * Math.PI) / 180);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = textBlock.color;
  ctx.strokeStyle = "rgba(0, 0, 0, .72)";
  ctx.lineWidth = Math.max(4, metrics.actualFontSize * 0.09);
  ctx.lineJoin = "round";

  metrics.lines.forEach((line, index) => {
    const lineY = -metrics.totalHeight / 2 + metrics.lineHeight / 2 + index * metrics.lineHeight;
    ctx.strokeText(line, 0, lineY);
    ctx.fillText(line, 0, lineY);
  });

  if (isActive) {
    const paddingX = 20;
    const paddingY = 16;
    ctx.strokeStyle = "rgba(47, 128, 237, 0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(
      -metrics.maxWidth / 2 - paddingX,
      -metrics.totalHeight / 2 - paddingY,
      metrics.maxWidth + paddingX * 2,
      metrics.totalHeight + paddingY * 2
    );
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function render(showSelection = true) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.image) {
    drawCoverImage(state.image);
  } else {
    ctx.fillStyle = "#dfeaf8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#6d7f9a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 42px system-ui, sans-serif";
    ctx.fillText("PNG 또는 JPEG 이미지를 불러오세요", canvas.width / 2, canvas.height / 2);
  }

  state.texts.forEach((textBlock) => {
    const showActiveOutline = showSelection && textBlock.id === state.activeTextId;
    renderTextBlock(textBlock, showActiveOutline);
  });
}

function isSupportedImageFile(file) {
  return file && (file.type === "image/png" || file.type === "image/jpeg");
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function pointInsideText(textBlock, pointX, pointY) {
  const metrics = getTextMetrics(textBlock);
  if (!metrics) return false;

  const dx = pointX - metrics.x;
  const dy = pointY - metrics.y;
  const angle = (-textBlock.rotation * Math.PI) / 180;
  const rotatedX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const rotatedY = dx * Math.sin(angle) + dy * Math.cos(angle);
  const paddingX = 30;
  const paddingY = 20;

  return (
    rotatedX >= -metrics.maxWidth / 2 - paddingX &&
    rotatedX <= metrics.maxWidth / 2 + paddingX &&
    rotatedY >= -metrics.totalHeight / 2 - paddingY &&
    rotatedY <= metrics.totalHeight / 2 + paddingY
  );
}

function findTextAtPoint(pointX, pointY) {
  for (let i = state.texts.length - 1; i >= 0; i -= 1) {
    const textBlock = state.texts[i];
    if (pointInsideText(textBlock, pointX, pointY)) {
      return textBlock;
    }
  }
  return null;
}

function clampTextPosition(textBlock, xPercent, yPercent) {
  textBlock.x = Math.min(95, Math.max(5, xPercent));
  textBlock.y = Math.min(95, Math.max(5, yPercent));
  updateOutputs();
}

function setTemplateMessage(text, type = "") {
  templateMessage.textContent = text;
  templateMessage.className = `message ${type}`.trim();
}

function makeStableTemplateId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function compressImageForTemplate(img) {
  if (!img) return "";

  const scale = Math.min(1, TEMPLATE_IMAGE_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const offscreenCtx = offscreen.getContext("2d");
  offscreenCtx.drawImage(img, 0, 0, width, height);

  // WebP는 사진 용량을 줄이면서 투명도도 보존할 수 있다.
  const webp = offscreen.toDataURL("image/webp", 0.82);
  if (webp.startsWith("data:image/webp")) {
    return webp;
  }
  return offscreen.toDataURL("image/png");
}

function buildTemplateSnapshot(id, name) {
  return {
    id,
    name,
    ratio: state.ratio,
    imageName: state.imageName || "",
    imageData: state.image ? compressImageForTemplate(state.image) : "",
    imageOffsetX: state.imageOffsetX,
    imageOffsetY: state.imageOffsetY,
    texts: state.texts.map((item) => ({
      text: item.text,
      x: item.x,
      y: item.y,
      fontSize: item.fontSize,
      color: item.color,
      rotation: item.rotation,
    })),
    updatedAt: Date.now(),
  };
}

function persistTemplates(nextTemplates) {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(nextTemplates));
    templates = nextTemplates;
    return true;
  } catch (error) {
    console.error("템플릿 저장 실패:", error);
    setTemplateMessage("브라우저 저장 공간이 부족해 템플릿을 저장하지 못했습니다. 더 작은 이미지를 사용해 주세요.", "error");
    return false;
  }
}

function restoreTemplatesFromStorage() {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) {
      templates = [];
      return;
    }

    const parsed = JSON.parse(raw);
    templates = Array.isArray(parsed) ? parsed.map((template) => ({
      ...template,
      imageOffsetX: Number.isFinite(template.imageOffsetX) ? template.imageOffsetX : 0,
      imageOffsetY: Number.isFinite(template.imageOffsetY) ? template.imageOffsetY : 0,
    })) : [];
  } catch (error) {
    console.error("저장된 템플릿 읽기 실패:", error);
    templates = [];
    setTemplateMessage("저장된 템플릿 데이터를 읽지 못해 빈 목록으로 시작합니다.", "error");
  }
}


function setJsonMessage(text, type = "") {
  jsonMessage.textContent = text;
  jsonMessage.className = `message ${type}`.trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumberInRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function validateTextForJson(text, templateIndex, textIndex) {
  const prefix = `템플릿 ${templateIndex + 1}의 문구 ${textIndex + 1}`;
  if (!isPlainObject(text)) return `${prefix}가 객체가 아닙니다.`;

  const required = ["text", "x", "y", "fontSize", "color", "rotation"];
  const missing = required.find((key) => !(key in text));
  if (missing) return `${prefix}에 필수 항목 '${missing}'이 없습니다.`;

  if (typeof text.text !== "string") return `${prefix}의 text가 문자열이 아닙니다.`;
  if (!isFiniteNumberInRange(text.x, 0, 100)) return `${prefix}의 x 값이 0~100 범위를 벗어났습니다.`;
  if (!isFiniteNumberInRange(text.y, 0, 100)) return `${prefix}의 y 값이 0~100 범위를 벗어났습니다.`;
  if (!isFiniteNumberInRange(text.fontSize, 16, 140)) return `${prefix}의 fontSize 값이 16~140 범위를 벗어났습니다.`;
  if (typeof text.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(text.color)) return `${prefix}의 color 형식이 올바르지 않습니다.`;
  if (!isFiniteNumberInRange(text.rotation, -180, 180)) return `${prefix}의 rotation 값이 -180~180 범위를 벗어났습니다.`;

  return "";
}

function validateTemplateForJson(template, index, seenIds) {
  const prefix = `템플릿 ${index + 1}`;
  if (!isPlainObject(template)) return `${prefix}가 객체가 아닙니다.`;

  const required = ["id", "name", "ratio", "imageName", "imageData", "texts", "updatedAt"];
  const missing = required.find((key) => !(key in template));
  if (missing) return `${prefix}에 필수 항목 '${missing}'이 없습니다.`;

  if (typeof template.id !== "string" || !template.id.trim()) return `${prefix}의 id가 올바르지 않습니다.`;
  if (seenIds.has(template.id)) return `${prefix}의 id가 다른 템플릿과 중복됩니다.`;
  seenIds.add(template.id);

  if (typeof template.name !== "string" || !template.name.trim() || template.name.length > 40) return `${prefix}의 name이 올바르지 않습니다.`;
  if (!RATIO_SIZES[template.ratio]) return `${prefix}의 ratio가 지원되지 않습니다.`;
  if (typeof template.imageName !== "string") return `${prefix}의 imageName이 문자열이 아닙니다.`;
  if (typeof template.imageData !== "string") return `${prefix}의 imageData가 문자열이 아닙니다.`;
  if (template.imageData && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(template.imageData)) return `${prefix}의 imageData 형식이 올바르지 않습니다.`;
  if ("imageOffsetX" in template && !isFiniteNumberInRange(template.imageOffsetX, -100, 100)) return `${prefix}의 imageOffsetX 값이 -100~100 범위를 벗어났습니다.`;
  if ("imageOffsetY" in template && !isFiniteNumberInRange(template.imageOffsetY, -100, 100)) return `${prefix}의 imageOffsetY 값이 -100~100 범위를 벗어났습니다.`;
  if (!Array.isArray(template.texts) || template.texts.length < 1) return `${prefix}의 texts는 문구 1개 이상을 포함한 배열이어야 합니다.`;
  if (!Number.isFinite(template.updatedAt)) return `${prefix}의 updatedAt이 숫자가 아닙니다.`;

  for (let textIndex = 0; textIndex < template.texts.length; textIndex += 1) {
    const error = validateTextForJson(template.texts[textIndex], index, textIndex);
    if (error) return error;
  }

  return "";
}

function validateJsonBackup(parsed) {
  if (!isPlainObject(parsed)) {
    return { ok: false, error: "JSON 최상위 값은 객체여야 합니다." };
  }

  const requiredRoot = ["format", "version", "templates"];
  const missingRoot = requiredRoot.find((key) => !(key in parsed));
  if (missingRoot) {
    return { ok: false, error: `JSON에 필수 항목 '${missingRoot}'이 없습니다.` };
  }

  if (parsed.format !== JSON_FORMAT) {
    return { ok: false, error: "이 파일은 밈만들기 템플릿 JSON 형식이 아닙니다." };
  }
  if (parsed.version !== JSON_VERSION) {
    return { ok: false, error: `지원하지 않는 JSON 버전입니다. 현재 지원 버전은 ${JSON_VERSION}입니다.` };
  }
  if (!Array.isArray(parsed.templates)) {
    return { ok: false, error: "templates 항목은 배열이어야 합니다." };
  }

  const seenIds = new Set();
  for (let index = 0; index < parsed.templates.length; index += 1) {
    const error = validateTemplateForJson(parsed.templates[index], index, seenIds);
    if (error) return { ok: false, error };
  }

  return { ok: true, templates: parsed.templates };
}

function exportTemplatesToJson() {
  const backup = {
    format: JSON_FORMAT,
    version: JSON_VERSION,
    exportedAt: new Date().toISOString(),
    templates,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "meme-templates.json";
  link.click();
  URL.revokeObjectURL(url);
  setJsonMessage(`템플릿 ${templates.length}개를 JSON으로 내보냈습니다.`, "success");
}

async function importTemplatesFromJsonFile(file) {
  if (!file) return;

  let parsed;
  try {
    const raw = await file.text();
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("JSON 문법 오류:", error);
    setJsonMessage("JSON 문법이 손상되어 가져오기를 거부했습니다. 기존 템플릿은 유지됩니다.", "error");
    importJsonInput.value = "";
    return;
  }

  const validation = validateJsonBackup(parsed);
  if (!validation.ok) {
    setJsonMessage(`${validation.error} 기존 템플릿은 유지됩니다.`, "error");
    importJsonInput.value = "";
    return;
  }

  // 전체 검증이 끝난 뒤에만 localStorage와 메모리의 템플릿 목록을 교체한다.
  const nextTemplates = validation.templates.map((template) => ({
    id: template.id,
    name: template.name,
    ratio: template.ratio,
    imageName: template.imageName,
    imageData: template.imageData,
    imageOffsetX: Number.isFinite(template.imageOffsetX) ? template.imageOffsetX : 0,
    imageOffsetY: Number.isFinite(template.imageOffsetY) ? template.imageOffsetY : 0,
    texts: template.texts.map((text) => ({
      text: text.text,
      x: text.x,
      y: text.y,
      fontSize: text.fontSize,
      color: text.color,
      rotation: text.rotation,
    })),
    updatedAt: template.updatedAt,
  }));

  if (!persistTemplates(nextTemplates)) {
    setJsonMessage("JSON은 정상이지만 브라우저 저장 공간이 부족해 복원하지 못했습니다. 기존 템플릿은 유지됩니다.", "error");
    importJsonInput.value = "";
    return;
  }

  loadedTemplateId = null;
  renderTemplateList();
  setJsonMessage(`정상 JSON을 확인해 템플릿 ${templates.length}개를 복원했습니다.`, "success");
  importJsonInput.value = "";
}

function renderTemplateList() {
  templateList.innerHTML = "";

  if (!templates.length) {
    const empty = document.createElement("p");
    empty.className = "template-empty";
    empty.textContent = "저장된 템플릿이 없습니다.";
    templateList.appendChild(empty);
    return;
  }

  templates.forEach((template) => {
    const item = document.createElement("div");
    item.className = `template-item ${template.id === loadedTemplateId ? "is-loaded" : ""}`.trim();
    item.dataset.templateId = template.id;

    const head = document.createElement("div");
    head.className = "template-item-head";

    const name = document.createElement("div");
    name.className = "template-item-name";
    name.textContent = template.name;

    const meta = document.createElement("div");
    meta.className = "template-item-meta";
    meta.textContent = `${template.ratio} · 문구 ${template.texts?.length || 0}개`;

    head.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "template-actions";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "template-action-btn";
    loadBtn.textContent = "불러오기";
    loadBtn.addEventListener("click", () => loadTemplate(template.id));

    const overwriteBtn = document.createElement("button");
    overwriteBtn.type = "button";
    overwriteBtn.className = "template-action-btn";
    overwriteBtn.textContent = "덮어쓰기";
    overwriteBtn.addEventListener("click", () => overwriteTemplate(template.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "template-action-btn delete";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", () => deleteTemplate(template.id));

    actions.append(loadBtn, overwriteBtn, deleteBtn);
    item.append(head, actions);
    templateList.appendChild(item);
  });
}

function saveNewTemplate() {
  const name = templateNameInput.value.trim();
  if (!name) {
    setTemplateMessage("템플릿 이름을 입력해 주세요.", "error");
    templateNameInput.focus();
    return;
  }

  const template = buildTemplateSnapshot(makeStableTemplateId(), name);
  const nextTemplates = [...templates, template];
  if (!persistTemplates(nextTemplates)) return;

  loadedTemplateId = template.id;
  templateNameInput.value = "";
  renderTemplateList();
  setTemplateMessage(`"${name}" 템플릿을 저장했습니다.`, "success");
}

function overwriteTemplate(id) {
  const target = templates.find((item) => item.id === id);
  if (!target) return;

  const replacement = buildTemplateSnapshot(target.id, target.name);
  const nextTemplates = templates.map((item) => item.id === id ? replacement : item);
  if (!persistTemplates(nextTemplates)) return;

  loadedTemplateId = id;
  renderTemplateList();
  setTemplateMessage(`"${target.name}" 템플릿을 현재 작업으로 수정했습니다.`, "success");
}

function deleteTemplate(id) {
  const target = templates.find((item) => item.id === id);
  if (!target) return;

  const nextTemplates = templates.filter((item) => item.id !== id);
  if (!persistTemplates(nextTemplates)) return;

  if (loadedTemplateId === id) {
    loadedTemplateId = null;
  }
  renderTemplateList();
  setTemplateMessage(`"${target.name}" 템플릿을 삭제했습니다.`, "success");
}

function restoreTextBlocks(savedTexts) {
  const source = Array.isArray(savedTexts) && savedTexts.length ? savedTexts : [{}];
  return source.map((saved) => createTextBlock({
    text: typeof saved.text === "string" ? saved.text : "",
    x: Number.isFinite(saved.x) ? saved.x : 50,
    y: Number.isFinite(saved.y) ? saved.y : 50,
    fontSize: Number.isFinite(saved.fontSize) ? saved.fontSize : 48,
    color: typeof saved.color === "string" ? saved.color : "#ffffff",
    rotation: Number.isFinite(saved.rotation) ? saved.rotation : 0,
  }));
}

function loadTemplate(id) {
  const template = templates.find((item) => item.id === id);
  if (!template) return;

  state.ratio = RATIO_SIZES[template.ratio] ? template.ratio : "1:1";
  state.texts = restoreTextBlocks(template.texts);
  state.activeTextId = state.texts[0].id;
  state.imageName = template.imageName || "";
  state.imageData = template.imageData || "";
  state.imageOffsetX = Number.isFinite(template.imageOffsetX) ? template.imageOffsetX : 0;
  state.imageOffsetY = Number.isFinite(template.imageOffsetY) ? template.imageOffsetY : 0;
  setImageMoveMode(false);
  loadedTemplateId = template.id;

  setCanvasRatio(state.ratio);
  ratioButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.ratio === state.ratio);
  });
  renderTextEditors();
  updateOutputs();
  renderTemplateList();

  if (state.imageData) {
    const restoredImage = new Image();
    restoredImage.onload = () => {
      state.image = restoredImage;
      updateImagePositionButton();
      render();
      setTemplateMessage(`"${template.name}" 템플릿을 불러왔습니다.`, "success");
    };
    restoredImage.onerror = () => {
      state.image = null;
      setImageMoveMode(false);
      updateImagePositionButton();
      render();
      setTemplateMessage(`"${template.name}" 템플릿의 이미지를 복원하지 못했습니다.`, "error");
    };
    restoredImage.src = state.imageData;
  } else {
    state.image = null;
    setImageMoveMode(false);
    updateImagePositionButton();
    render();
    setTemplateMessage(`"${template.name}" 템플릿을 불러왔습니다.`, "success");
  }
}

function loadImageFile(file) {
  if (!file) return;

  if (!isSupportedImageFile(file)) {
    setMessage(`"${file.name}"은 지원하지 않는 형식입니다. PNG 또는 JPEG 파일만 사용할 수 있습니다. 기존 작업은 유지됩니다.`, "error");
    imageInput.value = "";
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const candidateImage = new Image();

  candidateImage.onload = () => {
    state.image = candidateImage;
    state.imageName = file.name;
    state.imageData = compressImageForTemplate(candidateImage);
    resetImagePosition();
    setImageMoveMode(false);
    updateImagePositionButton();
    setMessage(`"${file.name}" 이미지를 불러왔습니다.`, "success");
    render();
  };

  candidateImage.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    setMessage(`"${file.name}" 파일을 이미지로 읽을 수 없습니다. 기존 작업은 유지됩니다.`, "error");
    imageInput.value = "";
  };

  candidateImage.src = objectUrl;
}

function renderTextEditors() {
  textList.innerHTML = "";

  state.texts.forEach((textBlock, index) => {
    const item = document.createElement("div");
    item.className = `text-item ${textBlock.id === state.activeTextId ? "is-active" : ""}`.trim();
    item.dataset.id = textBlock.id;

    const head = document.createElement("div");
    head.className = "text-item-head";

    const title = document.createElement("div");
    title.className = "text-item-title";
    title.textContent = `문구 ${index + 1}`;

    const tools = document.createElement("div");
    tools.className = "text-item-tools";

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "mini-btn";
    selectBtn.dataset.role = "select-text";
    selectBtn.textContent = textBlock.id === state.activeTextId ? "선택됨" : "선택";
    selectBtn.setAttribute("aria-pressed", String(textBlock.id === state.activeTextId));
    selectBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      setActiveText(textBlock.id);
    });

    tools.appendChild(selectBtn);

    if (state.texts.length > 1) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "mini-btn";
      removeBtn.textContent = "삭제";
      removeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        removeTextBlock(textBlock.id);
      });
      tools.appendChild(removeBtn);
    }

    head.append(title, tools);

    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.placeholder = "여기에 문구를 입력하세요";
    textarea.value = textBlock.text;
    textarea.addEventListener("focus", () => {
      if (state.activeTextId !== textBlock.id) {
        setActiveText(textBlock.id);
      }
    });
    textarea.addEventListener("input", (event) => {
      textBlock.text = event.target.value;
      if (state.activeTextId !== textBlock.id) {
        setActiveText(textBlock.id);
      } else {
        render();
      }
    });

    item.addEventListener("click", (event) => {
      if (event.target.tagName !== "TEXTAREA") {
        setActiveText(textBlock.id);
      }
    });

    item.append(head, textarea);
    textList.appendChild(item);
  });
}

function addTextBlock() {
  const newBlock = createTextBlock({
    x: 50 + state.texts.length * 3 > 90 ? 50 : 50 + state.texts.length * 3,
    y: 50 + state.texts.length * 3 > 90 ? 50 : 50 + state.texts.length * 3,
  });
  state.texts.push(newBlock);
  state.activeTextId = newBlock.id;
  renderTextEditors();
  updateOutputs();
  render();
}

function removeTextBlock(id) {
  state.texts = state.texts.filter((item) => item.id !== id);
  if (!state.texts.length) {
    const fallback = createTextBlock();
    state.texts = [fallback];
    state.activeTextId = fallback.id;
  } else if (!state.texts.some((item) => item.id === state.activeTextId)) {
    state.activeTextId = state.texts[0].id;
  }
  renderTextEditors();
  updateOutputs();
  render();
}

imageInput.addEventListener("change", () => {
  loadImageFile(imageInput.files?.[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  imageDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    imageDropZone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  imageDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    imageDropZone.classList.remove("is-dragover");
  });
});

imageDropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  loadImageFile(file);
});

addTextBtn.addEventListener("click", () => {
  addTextBlock();
});

saveTemplateBtn.addEventListener("click", () => {
  saveNewTemplate();
});

templateNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveNewTemplate();
  }
});


exportJsonBtn.addEventListener("click", () => {
  exportTemplatesToJson();
});

importJsonInput.addEventListener("change", () => {
  importTemplatesFromJsonFile(importJsonInput.files?.[0]);
});

fontSize.addEventListener("input", () => {
  const activeText = getActiveText();
  if (!activeText) return;
  activeText.fontSize = Number(fontSize.value);
  updateOutputs();
  render();
});

rotation.addEventListener("input", () => {
  const activeText = getActiveText();
  if (!activeText) return;
  activeText.rotation = Number(rotation.value);
  updateOutputs();
  render();
});

rotationInput.addEventListener("input", () => {
  const activeText = getActiveText();
  if (!activeText || rotationInput.value === "") return;

  const value = Math.max(-180, Math.min(180, Number(rotationInput.value)));
  if (!Number.isFinite(value)) return;

  activeText.rotation = value;
  rotation.value = value;
  updateOutputs();
  render();
});

rotationInput.addEventListener("change", () => {
  const activeText = getActiveText();
  if (!activeText) return;
  if (rotationInput.value === "") {
    rotationInput.value = activeText.rotation;
  }
});

textColor.addEventListener("input", () => {
  const activeText = getActiveText();
  if (!activeText) return;
  activeText.color = textColor.value;
  updateOutputs();
  render();
});

ratioButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.ratio = button.dataset.ratio;
    setCanvasRatio(state.ratio);
    ratioButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn === button);
    });
    render();
  });
});

imagePositionBtn.addEventListener("click", () => {
  if (!state.image) return;
  setImageMoveMode(!imageMoveMode);
  render();
});

canvas.addEventListener("pointerdown", (event) => {
  const point = getCanvasPoint(event);

  if (imageMoveMode && state.image) {
    drag.active = true;
    drag.type = "image";
    drag.textId = null;
    drag.startPointerX = point.x;
    drag.startPointerY = point.y;
    drag.startImageOffsetX = state.imageOffsetX;
    drag.startImageOffsetY = state.imageOffsetY;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  const hitText = findTextAtPoint(point.x, point.y);
  if (!hitText) return;

  setActiveText(hitText.id);

  drag.active = true;
  drag.type = "text";
  drag.textId = hitText.id;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(event.pointerId);

  const currentX = (hitText.x / 100) * canvas.width;
  const currentY = (hitText.y / 100) * canvas.height;
  drag.offsetX = point.x - currentX;
  drag.offsetY = point.y - currentY;
});

canvas.addEventListener("pointermove", (event) => {
  const point = getCanvasPoint(event);

  if (drag.active && drag.type === "image" && state.image) {
    const layout = getImageCoverLayout(state.image);
    const dx = point.x - drag.startPointerX;
    const dy = point.y - drag.startPointerY;

    if (layout.overflowX > 0) {
      const offsetDeltaX = (dx / (layout.overflowX / 2)) * 100;
      state.imageOffsetX = Math.max(-100, Math.min(100, drag.startImageOffsetX + offsetDeltaX));
    } else {
      state.imageOffsetX = 0;
    }

    if (layout.overflowY > 0) {
      const offsetDeltaY = (dy / (layout.overflowY / 2)) * 100;
      state.imageOffsetY = Math.max(-100, Math.min(100, drag.startImageOffsetY + offsetDeltaY));
    } else {
      state.imageOffsetY = 0;
    }

    render();
    return;
  }

  if (drag.active && drag.type === "text") {
    const activeText = state.texts.find((item) => item.id === drag.textId);
    if (!activeText) return;

    const newX = ((point.x - drag.offsetX) / canvas.width) * 100;
    const newY = ((point.y - drag.offsetY) / canvas.height) * 100;
    clampTextPosition(activeText, newX, newY);
    render();
    return;
  }

  if (imageMoveMode && state.image) {
    canvas.style.cursor = "move";
  } else {
    canvas.style.cursor = findTextAtPoint(point.x, point.y) ? "grab" : "default";
  }
});

function stopDragging(event) {
  if (!drag.active) return;
  drag.active = false;
  drag.type = null;
  drag.textId = null;
  canvas.classList.remove("dragging");
  if (event && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

canvas.addEventListener("pointerup", stopDragging);
canvas.addEventListener("pointercancel", stopDragging);
canvas.addEventListener("pointerleave", () => {
  if (!drag.active) {
    canvas.style.cursor = imageMoveMode && state.image ? "move" : "default";
  }
});

downloadBtn.addEventListener("click", () => {
  // 저장용 렌더링에서는 편집용 선택 점선 테두리를 숨긴다.
  render(false);

  const link = document.createElement("a");
  link.download = `Image${downloadSequence}.png`;
  downloadSequence += 1;
  link.href = canvas.toDataURL("image/png");
  link.click();

  // 저장이 끝나면 편집 화면의 선택 표시를 다시 보여준다.
  render(true);
});

resetBtn.addEventListener("click", () => {
  state.image = null;
  state.imageName = "";
  state.imageData = "";
  resetImagePosition();
  setImageMoveMode(false);
  updateImagePositionButton();
  state.ratio = "1:1";
  loadedTemplateId = null;
  state.texts = [createTextBlock()];
  state.activeTextId = state.texts[0].id;
  imageInput.value = "";
  setCanvasRatio(state.ratio);
  ratioButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.ratio === state.ratio);
  });
  setMessage("편집 설정을 초기화했습니다. 이미지가 있다면 다시 불러와 주세요.", "success");
  renderTextEditors();
  updateOutputs();
  renderTemplateList();
  render();
});

restoreTemplatesFromStorage();
setCanvasRatio(state.ratio);
updateImagePositionButton();
renderTextEditors();
renderTemplateList();
updateOutputs();
render();
