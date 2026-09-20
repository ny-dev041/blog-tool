"use strict";

/* ============================================================
   [ 설정 구역 ] 나중에 바뀔 값은 전부 여기에 모아둡니다.
   비개발자도 이 구역만 보고 고칠 수 있도록 한글 주석을 달아둡니다.
   ============================================================ */

// localStorage에 데이터를 저장할 때 쓰는 키 이름 (바꾸면 기존 데이터를 못 읽어옴 — 함부로 바꾸지 말 것)
const 저장소_키 = "blogRequestTool_companies_v1";

// 주제를 감싸는 표식. 클로드에게 "이 표식으로 감싸서 써달라"고 요청서에 안내하고,
// 다음 주 일괄 입력 때 이 표식 사이의 글자만 "이전 주제"로 뽑아옵니다.
const 주제_시작표식 = "[[";
const 주제_끝표식 = "]]";

// 이전 주제 일괄 입력(붙여넣기)에서, 한 행(줄) 안에 탭으로 구분된 칸 중
// 업체명이 몇 번째 칸에 있는지 (1부터 셈). 스프레드시트 칸 구성이 바뀌면 이 숫자만 고치면 됨.
const 칸_업체명_위치 = 2;
// 주제가 들어있는 칸 위치(참고용 — 실제 추출은 위의 [[ ]] 표식 기준으로 하므로,
// 표식이 있는 한 이 숫자가 정확히 몇 번째든 상관없이 잘 찾아집니다).
const 칸_주제_위치 = 6;
// 키워드가 들어있는 칸 위치 (1부터 셈). "이전 키워드"는 이 칸 값을 그대로 가져와 저장합니다.
const 칸_키워드_위치 = 4;

// 검색창 자동완성에 최대 몇 개까지 보여줄지
const 검색_최대표시개수 = 8;

// 요청서 양식 (항목 순서/문구). {중괄호} 부분이 실제 값으로 바뀝니다.
// 항목 사이 빈 줄(\n\n)은 요청서에 각 항목을 한 줄씩 띄워서 보여주기 위한 것.
const 요청서_양식 = `이전 주제 : {이전주제}

키워드 : {키워드}

업체명 : {업체명}

업체정보 : {업체설문}`;

// "추가 요청" 줄 양식 — 추가 입력이 있을 때만 위 양식 뒤에 덧붙습니다.
const 추가요청_줄양식 = `추가 요청 : {추가요청}`;

// 요청서 맨 끝에 항상 붙는 안내문 (클로드가 주제를 [[ ]]로 감싸서 쓰게 유도)
const 주제표식_안내문 =
  `\n\n(주제 부분은 반드시 ${주제_시작표식}주제내용${주제_끝표식} 형식으로 감싸서 작성해 주세요.)`;

/* ============================================================
   여기부터는 기능 구현 (평소엔 안 건드려도 됨)
   ============================================================ */

// ---------- 상태 ----------
let companies = loadCompanies();   // 전체 업체 목록
let currentCompany = null;         // 현재 선택된 업체(객체, companies 배열 안의 항목을 그대로 참조)
let suggestMatches = [];           // 지금 검색창 아래 떠 있는 추천 업체 목록 (방향키 이동용)
let suggestIndex = -1;             // 방향키로 지금 몇 번째 추천이 하이라이트됐는지 (-1이면 없음)
let hasGeneratedRequest = false;   // [요청서 생성]으로 실제 결과물이 만들어진 상태인지 (placeholder 문구는 복사 대상 아님)
let hasUnexportedChanges = false;  // [+ 업체 추가]로 새 업체를 저장했는데 아직 [JSON 내보내기]로 백업 안 한 상태인지

const 결과창_안내문구 = "[요청서 생성]을 누르면 여기에 완성된 요청서가 표시됩니다.";
const 결과창_안내문구_초기 = "업체를 선택하고 [요청서 생성]을 누르면 여기에 완성된 요청서가 표시됩니다.";

// ---------- DOM 참조 ----------
const $ = (id) => document.getElementById(id);

const el = {
  btnExport: $("btnExport"),
  btnImport: $("btnImport"),
  importFileInput: $("importFileInput"),

  weeklyPaste: $("weeklyPaste"),
  btnApplyWeekly: $("btnApplyWeekly"),
  weeklyResult: $("weeklyResult"),

  btnAddCompany: $("btnAddCompany"),
  searchInput: $("searchInput"),
  suggestBox: $("suggestBox"),

  emptyState: $("emptyState"),
  companyForm: $("companyForm"),
  coName: $("coName"),
  coAliasTag: $("coAliasTag"),
  btnBlogLink: $("btnBlogLink"),
  btnPlaceLink: $("btnPlaceLink"),
  prevTopicInput: $("prevTopicInput"),
  refKeywordArea: $("refKeywordArea"),
  newKeywordInput: $("newKeywordInput"),
  newKeywordWarning: $("newKeywordWarning"),
  extraInput: $("extraInput"),
  surveyInput: $("surveyInput"),
  btnGenerate: $("btnGenerate"),

  resultOutput: $("resultOutput"),
  btnCopy: $("btnCopy"),
  resultFoot: $("resultFoot"),

  modalOverlay: $("modalOverlay"),
  modalName: $("modalName"),
  modalAlias: $("modalAlias"),
  modalSurvey: $("modalSurvey"),
  modalBlogUrl: $("modalBlogUrl"),
  modalPlaceUrl: $("modalPlaceUrl"),
  modalCancel: $("modalCancel"),
  modalSave: $("modalSave"),

  confirmOverlay: $("confirmOverlay"),
  confirmTitle: $("confirmTitle"),
  confirmMessage: $("confirmMessage"),
  confirmOkBtn: $("confirmOkBtn"),
  confirmCancelBtn: $("confirmCancelBtn"),
};

// ---------- 확인/알림 모달 (브라우저 기본 confirm·alert 대체) ----------
// 일부 브라우저·미리보기 환경은 보안상 네이티브 confirm()/alert()를 막고 조용히
// 취소 처리해버려서, 클릭해도 아무 반응이 없는 것처럼 보이는 문제가 있었음.
// 그래서 항상 같은 방식으로 동작하는 커스텀 모달로 대체.
function showConfirm(message, { showCancel = true, okText = "확인", cancelText = "취소" } = {}) {
  return new Promise((resolve) => {
    el.confirmMessage.textContent = message;
    el.confirmOkBtn.textContent = okText;
    el.confirmCancelBtn.textContent = cancelText;
    el.confirmCancelBtn.style.display = showCancel ? "inline-block" : "none";
    el.confirmOverlay.style.display = "flex";

    function cleanup(result) {
      el.confirmOverlay.style.display = "none";
      el.confirmOkBtn.removeEventListener("click", onOk);
      el.confirmCancelBtn.removeEventListener("click", onCancel);
      el.confirmOverlay.removeEventListener("click", onOverlayClick);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlayClick(e) {
      if (e.target === el.confirmOverlay) cleanup(false);
    }

    el.confirmOkBtn.addEventListener("click", onOk);
    el.confirmCancelBtn.addEventListener("click", onCancel);
    el.confirmOverlay.addEventListener("click", onOverlayClick);
  });
}

function showAlert(message) {
  return showConfirm(message, { showCancel: false });
}

// ---------- localStorage 저장/불러오기 ----------
function loadCompanies() {
  try {
    const raw = localStorage.getItem(저장소_키);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.companies)) return data.companies;
    return [];
  } catch (e) {
    console.error("업체 데이터를 불러오는 중 오류:", e);
    return [];
  }
}

function saveCompanies(list) {
  const data = { version: 1, backupDate: todayISO(), companies: list };
  localStorage.setItem(저장소_키, JSON.stringify(data));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- 업체 검색 (자동완성) ----------
function renderSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    hideSuggestions();
    return;
  }
  const matches = companies.filter((c) => {
    const name = (c.name || "").toLowerCase();
    const alias = (c.alias || "").toLowerCase();
    return name.includes(q) || (alias && alias.includes(q));
  }).slice(0, 검색_최대표시개수);

  suggestMatches = matches;
  suggestIndex = -1;

  el.suggestBox.innerHTML = "";
  if (matches.length === 0) {
    const div = document.createElement("div");
    div.className = "suggest-empty";
    div.textContent = "일치하는 업체가 없어요. [+ 업체 추가]로 새로 등록해보세요.";
    el.suggestBox.appendChild(div);
  } else {
    matches.forEach((c, idx) => {
      const item = document.createElement("div");
      item.className = "suggest-item";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = c.name;
      item.appendChild(nameSpan);
      if (c.alias) {
        const aliasSpan = document.createElement("span");
        aliasSpan.className = "alias";
        aliasSpan.textContent = "시트명 · " + c.alias;
        item.appendChild(aliasSpan);
      }
      item.addEventListener("click", () => {
        pickSuggestion(c);
      });
      // 마우스를 올리면 방향키 하이라이트 위치도 같이 맞춰줌
      item.addEventListener("mouseenter", () => {
        suggestIndex = idx;
        updateSuggestHighlight();
      });
      el.suggestBox.appendChild(item);
    });
  }
  el.suggestBox.style.display = "block";
}

function updateSuggestHighlight() {
  const items = el.suggestBox.querySelectorAll(".suggest-item");
  items.forEach((item, idx) => {
    item.classList.toggle("active", idx === suggestIndex);
  });
  if (suggestIndex >= 0 && items[suggestIndex]) {
    items[suggestIndex].scrollIntoView({ block: "nearest" });
  }
}

function pickSuggestion(c) {
  el.searchInput.value = c.name;
  hideSuggestions();
  selectCompany(c.name);
}

function moveSuggestHighlight(delta) {
  if (suggestMatches.length === 0) return;
  suggestIndex = (suggestIndex + delta + suggestMatches.length) % suggestMatches.length;
  updateSuggestHighlight();
}

function hideSuggestions() {
  el.suggestBox.style.display = "none";
  el.suggestBox.innerHTML = "";
  suggestMatches = [];
  suggestIndex = -1;
}

// ---------- 업체 선택 시 자동 채움 ----------
function selectCompany(name) {
  const company = companies.find((c) => c.name === name);
  if (!company) return;
  currentCompany = company;

  el.emptyState.style.display = "none";
  el.companyForm.style.display = "block";

  el.coName.textContent = company.name;
  if (company.alias) {
    el.coAliasTag.textContent = "시트명 · " + company.alias;
    el.coAliasTag.style.display = "inline-block";
  } else {
    el.coAliasTag.style.display = "none";
  }
  updateCompanyLinkButtons(company);

  el.prevTopicInput.value = company.prevTopic || "";
  el.surveyInput.value = company.survey || "";
  el.extraInput.value = "";
  el.newKeywordInput.value = "";

  renderRefKeyword();
  updateKeywordValidation();

  // 결과창은 새 업체를 고르면 다시 생성하기 전까지 비워둠
  resetResultPanel();
}

// 결과창을 안내 문구 상태로 되돌림 (아직 요청서를 생성하지 않은 상태로 표시)
function resetResultPanel(message = 결과창_안내문구) {
  hasGeneratedRequest = false;
  el.resultOutput.textContent = message;
}

// ---------- 업체명 옆 블로그·플레이스 버튼 ----------
// 링크가 등록 안 된 업체는 버튼 자체를 숨김 (http(s)가 안 붙어 있으면 자동으로 붙여줌)
function normalizeUrl(url) {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
}

function updateCompanyLinkButtons(company) {
  const blogUrl = normalizeUrl(company.blogUrl);
  const placeUrl = normalizeUrl(company.placeUrl);

  if (blogUrl) {
    el.btnBlogLink.href = blogUrl;
    el.btnBlogLink.style.display = "inline-block";
  } else {
    el.btnBlogLink.removeAttribute("href");
    el.btnBlogLink.style.display = "none";
  }

  if (placeUrl) {
    el.btnPlaceLink.href = placeUrl;
    el.btnPlaceLink.style.display = "inline-block";
  } else {
    el.btnPlaceLink.removeAttribute("href");
    el.btnPlaceLink.style.display = "none";
  }
}

function renderRefKeyword() {
  el.refKeywordArea.innerHTML = "";
  if (currentCompany && currentCompany.prevKeyword) {
    const chip = document.createElement("span");
    chip.className = "chip ref";
    chip.textContent = currentCompany.prevKeyword;
    el.refKeywordArea.appendChild(chip);
  } else {
    const empty = document.createElement("span");
    empty.className = "kw-empty";
    empty.textContent = "없음";
    el.refKeywordArea.appendChild(empty);
  }
}

// ---------- 새 키워드 입력 (1개만) + 이전 키워드 중복 실시간 검사 ----------
// 로그인 폼에서 아이디·비번이 틀리면 바로 빨간 문구가 뜨는 것과 같은 방식:
// 별도 확인 절차 없이, 입력하는 즉시 이전 키워드와 같은지 검사해서 경고를 보여줌.
function isKeywordDuplicate(company, keyword) {
  if (!company || !keyword) return false;
  const prevKeyword = (company.prevKeyword || "").trim();
  return prevKeyword !== "" && prevKeyword === keyword.trim();
}

function updateKeywordValidation() {
  const keyword = el.newKeywordInput.value.trim();
  const duplicate = isKeywordDuplicate(currentCompany, keyword);
  el.newKeywordInput.classList.toggle("invalid", duplicate);
  if (duplicate) {
    el.newKeywordWarning.textContent = "이전 키워드와 같아요. 다른 키워드를 입력해주세요.";
    el.newKeywordWarning.style.display = "block";
  } else {
    el.newKeywordWarning.style.display = "none";
  }
  return duplicate;
}

// [요청서 생성]을 눌렀는데 새 키워드가 비어있을 때만 쓰는 경고 (입력하는 즉시 사라짐 —
// 위 updateKeywordValidation이 매 입력마다 다시 검사해서 값이 생기면 자동으로 감춰줌)
function showKeywordEmptyWarning() {
  el.newKeywordInput.classList.add("invalid");
  el.newKeywordWarning.textContent = "새 키워드를 입력해주세요.";
  el.newKeywordWarning.style.display = "block";
}

// ---------- 요청서 생성 ----------
function buildRequestText({ prevTopic, keyword, companyName, survey, extra }) {
  let text = 요청서_양식
    .replace("{이전주제}", prevTopic || "")
    .replace("{키워드}", keyword || "")
    .replace("{업체명}", companyName || "")
    .replace("{업체설문}", survey || "");

  if (extra && extra.trim()) {
    text += "\n\n" + 추가요청_줄양식.replace("{추가요청}", extra.trim());
  }
  text += 주제표식_안내문;
  return text;
}

function generateRequest() {
  if (!currentCompany) return;

  const keyword = el.newKeywordInput.value.trim();

  // 새 키워드를 안 넣었으면 생성을 막음
  if (!keyword) {
    showKeywordEmptyWarning();
    el.newKeywordInput.focus();
    return;
  }

  // 새 키워드가 이전 키워드와 같으면 생성을 막음 (로그인 실패처럼 진행 자체가 안 되도록)
  if (updateKeywordValidation()) {
    el.newKeywordInput.focus();
    return;
  }

  const prevTopic = el.prevTopicInput.value.trim();
  const survey = el.surveyInput.value.trim();
  const extra = el.extraInput.value.trim();

  const text = buildRequestText({
    prevTopic,
    keyword,
    companyName: currentCompany.name,
    survey,
    extra,
  });

  el.resultOutput.textContent = text;
  hasGeneratedRequest = true;

  // 이전 주제/업체 설문은 이번에 확인·수정한 값을 그대로 업체 기록에 반영해둠
  // (이전 키워드는 여기서 건드리지 않음 — 다음 주 일괄 입력 때 시트의 키워드 칸에서 갱신됨)
  currentCompany.prevTopic = prevTopic;
  currentCompany.survey = survey;
  saveCompanies(companies);
}

// ---------- 복사 ----------
function copyResult() {
  // [요청서 생성]으로 실제 결과물이 만들어지기 전(안내 문구만 떠 있는 상태)에는 복사 자체를 하지 않음
  if (!hasGeneratedRequest) return;

  const text = el.resultOutput.textContent;
  if (!text || !text.trim()) return;

  // navigator.clipboard.writeText()는 file:// 로 연 페이지에서 부작용(페이지가 스스로 다시 로드됨)이
  // 있어서 안 씀. execCommand 방식은 file://·http(s) 어디서든 그런 문제 없이 잘 동작함.
  // (복사 성공 여부는 버튼 표시 대신, 붙여넣기 해보면 바로 확인 가능하므로 별도 상태 표시는 안 함)
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

// ---------- 업체 추가 (모달) ----------
function openAddCompanyModal() {
  el.modalName.value = "";
  el.modalAlias.value = "";
  el.modalSurvey.value = "";
  el.modalBlogUrl.value = "";
  el.modalPlaceUrl.value = "";
  el.modalOverlay.style.display = "flex";
  el.modalName.focus();
}

function closeAddCompanyModal() {
  el.modalOverlay.style.display = "none";
}

function saveNewCompany() {
  const name = el.modalName.value.trim();
  if (!name) {
    showAlert("업체명을 입력해주세요.");
    return;
  }
  if (companies.some((c) => c.name === name)) {
    showAlert("이미 등록된 업체명이에요.");
    return;
  }
  const alias = el.modalAlias.value.trim();
  const survey = el.modalSurvey.value.trim();
  const blogUrl = el.modalBlogUrl.value.trim();
  const placeUrl = el.modalPlaceUrl.value.trim();

  const newCompany = {
    name,
    alias,
    survey,
    prevTopic: "",
    prevKeyword: "",
    blogUrl,
    placeUrl,
  };
  companies.push(newCompany);
  saveCompanies(companies);
  hasUnexportedChanges = true; // JSON 백업을 아직 안 했다는 표시 (내보내기 하면 꺼짐)

  closeAddCompanyModal();
  el.searchInput.value = name;
  hideSuggestions();
  selectCompany(name);
}

// ---------- 이전 주제 일괄 입력 ----------

// 탭으로 구분된 붙여넣기 텍스트를 표(행 x 칸)로 변환.
// 구글시트에서 복사하면 긴 셀(주제)이 큰따옴표로 감싸이고 그 안에 줄바꿈이 들어있을 수 있어서,
// 단순히 줄바꿈으로만 나누면 데이터가 깨짐 → 큰따옴표를 인식하는 파서를 직접 구현.
function parseTSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
    } else if (char === "\t") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      if (field.endsWith("\r")) field = field.slice(0, -1);
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  // 마지막 줄 처리 (줄바꿈으로 안 끝난 경우)
  if (field.length > 0 || row.length > 0) {
    if (field.endsWith("\r")) field = field.slice(0, -1);
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function isHeaderRow(nameCell) {
  const v = (nameCell || "").trim();
  return v === "업체명" || v.toLowerCase() === "name";
}

function applyWeeklyBatch(rawText) {
  const rows = parseTSV(rawText).filter((r) => r.some((c) => c.trim() !== ""));
  let filled = 0;
  const notFound = [];

  rows.forEach((row) => {
    const nameCell = (row[칸_업체명_위치 - 1] || "").trim();
    if (!nameCell || isHeaderRow(nameCell)) return;

    const rowText = row.join("\t");
    const start = rowText.indexOf(주제_시작표식);
    const end = start === -1 ? -1 : rowText.indexOf(주제_끝표식, start + 주제_시작표식.length);

    if (start === -1 || end === -1) {
      notFound.push(`${nameCell} (주제 표식 못 찾음)`);
      return;
    }
    const topic = rowText.slice(start + 주제_시작표식.length, end).trim();

    // 3단계 매칭: 정식 업체명 → 별칭 → 실패
    let company = companies.find((c) => c.name === nameCell);
    if (!company) company = companies.find((c) => c.alias && c.alias === nameCell);

    if (!company) {
      notFound.push(nameCell);
      return;
    }

    company.prevTopic = topic;

    // 키워드 칸도 같은 행에서 그대로 가져와 "이전 키워드"로 저장 (표식 없이 칸 값 그대로)
    const keywordCell = (row[칸_키워드_위치 - 1] || "").trim();
    if (keywordCell) company.prevKeyword = keywordCell;

    filled++;
  });

  saveCompanies(companies);
  return { filled, notFound };
}

function handleApplyWeekly() {
  const text = el.weeklyPaste.value;
  if (!text.trim()) return;

  const { filled, notFound } = applyWeeklyBatch(text);

  el.weeklyResult.style.display = "block";
  el.weeklyResult.className = "weekly-result " + (notFound.length > 0 ? "warn" : "ok");
  let msg = `${filled}개 채움 / ${notFound.length}개 못 찾음`;
  if (notFound.length > 0) msg += ` (${notFound.join(", ")})`;
  el.weeklyResult.textContent = msg;

  // 지금 화면에 선택되어 있는 업체가 방금 갱신됐다면 이전 주제·이전 키워드 표시도 새로고침
  if (currentCompany) {
    const updated = companies.find((c) => c.name === currentCompany.name);
    if (updated) {
      currentCompany = updated;
      el.prevTopicInput.value = updated.prevTopic || "";
      renderRefKeyword();
    }
  }
}

// ---------- JSON 내보내기 / 불러오기 ----------
function exportJSON() {
  const data = { version: 1, backupDate: todayISO(), companies };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `업체데이터_${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  hasUnexportedChanges = false; // 방금 백업했으니 표시 해제
}

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.companies)) {
        throw new Error("companies 목록이 없는 파일이에요.");
      }
      const ok = await showConfirm(
        `현재 데이터를 이 파일 내용으로 덮어쓸까요?\n(불러올 업체 수: ${data.companies.length}개)`
      );
      if (!ok) return;

      companies = data.companies;
      saveCompanies(companies);

      currentCompany = null;
      el.emptyState.style.display = "block";
      el.companyForm.style.display = "none";
      el.searchInput.value = "";
      hideSuggestions();
      resetResultPanel(결과창_안내문구_초기);
    } catch (err) {
      showAlert("JSON 파일을 읽는 중 문제가 발생했어요: " + err.message);
    } finally {
      el.importFileInput.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
}

// ---------- 이벤트 연결 ----------

// 새 업체를 추가해놓고 JSON 백업(내보내기)을 아직 안 한 채로 창을 닫으려 하면 브라우저가 한 번 물어보게 함.
// (브라우저 정책상 문구는 커스터마이징 안 되고 "변경사항을 저장하지 않았을 수 있습니다" 같은
// 브라우저 기본 문구가 뜸 — 그래도 실수로 닫는 건 막아줌)
window.addEventListener("beforeunload", (e) => {
  if (hasUnexportedChanges) {
    e.preventDefault();
    e.returnValue = "";
  }
});

el.searchInput.addEventListener("input", (e) => renderSuggestions(e.target.value));
el.searchInput.addEventListener("focus", (e) => {
  if (e.target.value.trim()) renderSuggestions(e.target.value);
});
// 방향키(↑↓)로 추천 목록 이동, 엔터로 선택, ESC로 닫기
el.searchInput.addEventListener("keydown", (e) => {
  const isOpen = el.suggestBox.style.display !== "none" && suggestMatches.length > 0;
  if (!isOpen) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveSuggestHighlight(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moveSuggestHighlight(-1);
  } else if (e.key === "Enter") {
    const picked =
      (suggestIndex >= 0 && suggestMatches[suggestIndex]) ||
      (suggestMatches.length === 1 ? suggestMatches[0] : null);
    if (picked) {
      e.preventDefault();
      // 한글 입력 중(조합 미확정) 엔터를 누르면, 브라우저가 조합을 확정하면서
      // 마지막 글자를 검색창 끝에 다시 덧붙이는 경우가 있음(예: "비"+업체명 → "업체명비").
      // 그 조합 확정이 끝난 다음에 업체명으로 완전히 덮어쓰도록 한 박자 늦춰서 처리.
      setTimeout(() => pickSuggestion(picked), 0);
    }
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) hideSuggestions();
});

el.btnAddCompany.addEventListener("click", openAddCompanyModal);
el.modalCancel.addEventListener("click", closeAddCompanyModal);
el.modalSave.addEventListener("click", saveNewCompany);
el.modalOverlay.addEventListener("click", (e) => {
  if (e.target === el.modalOverlay) closeAddCompanyModal();
});

// 타이핑하는 즉시 이전 키워드와 같은지 검사해서 경고 표시 (로그인 폼 실시간 검증과 같은 방식)
el.newKeywordInput.addEventListener("input", updateKeywordValidation);

el.btnGenerate.addEventListener("click", generateRequest);
el.btnCopy.addEventListener("click", copyResult);

el.btnApplyWeekly.addEventListener("click", handleApplyWeekly);

el.btnExport.addEventListener("click", exportJSON);
el.btnImport.addEventListener("click", () => el.importFileInput.click());
el.importFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importJSONFile(file);
});

// ---------- 시작 상태 ----------
el.emptyState.style.display = "block";
el.companyForm.style.display = "none";
