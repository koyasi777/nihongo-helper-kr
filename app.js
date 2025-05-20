import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Elements
const mobileMenu = document.getElementById('mobileMenu');
const mobileBookmarkBtn = document.getElementById('mobileBookmarkBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeySaveBtn = document.getElementById('apiKeySaveBtn');
const translateBtn = document.getElementById('translateBtn');
const saveBtn = document.getElementById('saveBtn');
const inputText = document.getElementById('inputText');
const resultBox = document.getElementById('result');
const srcInfo = document.getElementById('srcInfo');
const tgtInfo = document.getElementById('tgtInfo');
const bookmarkBtn = document.getElementById('bookmarkBtn');
const bookmarkList = document.getElementById('bookmarkList');
const loginCode = document.getElementById('loginCode');
const generatedCode = document.getElementById('generatedCode');
const generateCodeBtn = document.getElementById('generateCodeBtn');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const registerSubmitBtn = document.getElementById('registerSubmitBtn');

let currentTranslation = '';
let currentLangs = {};
let userCode = localStorage.getItem('userCode') || null;

// Offcanvas bookmark trigger for mobile
mobileBookmarkBtn.addEventListener('click', () => {
  bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('bookmarkSidebar')).show();
  bootstrap.Offcanvas.getOrCreateInstance(mobileMenu).hide();
});

// API Key handling
apiKeyInput.value = localStorage.getItem('geminiApiKey') || '';
apiKeySaveBtn.addEventListener('click', () => {
  localStorage.setItem('geminiApiKey', apiKeyInput.value.trim());
  bootstrap.Modal.getInstance(document.getElementById('apiKeyModal')).hide();
});

// Account: code generation and login
function formatCode(raw) {
  return raw.match(/.{1,4}/g).join('-');
}

generateCodeBtn.addEventListener('click', () => {
  const raw = Array.from({length:16},()=>(Math.floor(Math.random()*10))).join('');
  const formatted = formatCode(raw);
  generatedCode.textContent = formatted;
});

registerSubmitBtn.addEventListener('click', () => {
  userCode = generatedCode.textContent;
  localStorage.setItem('userCode', userCode);
  updateAccountUI();
  bootstrap.Modal.getInstance(document.getElementById('accountModal')).hide();
});

loginSubmitBtn.addEventListener('click', () => {
  const code = loginCode.value.trim();
  if (code) {
    userCode = code;
    localStorage.setItem('userCode', userCode);
    updateAccountUI();
    bootstrap.Modal.getInstance(document.getElementById('accountModal')).hide();
  }
});

function updateAccountUI() {
  if (userCode) {
    document.getElementById('loginMenuItem').classList.add('d-none');
    document.getElementById('logoutMenuItem').classList.remove('d-none');
    bookmarkBtn.classList.remove('d-none');
  }
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('userCode');
  userCode = null;
  document.getElementById('loginMenuItem').classList.remove('d-none');
  document.getElementById('logoutMenuItem').classList.add('d-none');
  bookmarkBtn.classList.add('d-none');
  bookmarkList.innerHTML = '';
});

// Initialize account UI
updateAccountUI();

// Translation
translateBtn.addEventListener('click', async () => {
  const apiKey = localStorage.getItem('geminiApiKey');
  const text = inputText.value.trim();
  if (!apiKey) {
    bootstrap.Modal.getOrCreateInstance(document.getElementById('apiKeyModal')).show();
    return;
  }
  if (!text) return;

  currentLangs = detectLangs(text);
  srcInfo.textContent = `翻訳元（${currentLangs.src==='ja'?'日本語':'한국어'}）`;
  tgtInfo.textContent = `翻訳先（${currentLangs.tgt==='ja'?'日本語':'한국어'}）`;

  resultBox.innerHTML = `<div class="text-center py-5"><div class="spinner-border" role="status"></div></div>`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          contents:[{parts:[{text:generatePrompt(text,currentLangs.src)}]}],
          generationConfig:{temperature:0.7,topP:0.95,topK:40,maxOutputTokens:1024}
        })
      }
    );
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    const out = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) throw new Error('候補がありませんでした');
    currentTranslation = out;
    resultBox.innerHTML = `<div class="markdown-body">${marked.parse(out)}</div>`;
    saveBtn.disabled = !userCode;
  } catch (e) {
    console.error(e);
    resultBox.innerHTML = `<div class="text-danger">⚠️ 翻訳失敗: ${e.message}</div>`;
    if (/api key/i.test(e.message)) {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('apiKeyModal')).show();
    }
  }
});

// Save Bookmark
saveBtn.addEventListener('click', async () => {
  if (!userCode) return;
  try {
    await addDoc(collection(db,'translations'),{
      userCode,
      timestamp:Date.now(),
      original:inputText.value.trim(),
      translated:currentTranslation,
      src:currentLangs.src,
      tgt:currentLangs.tgt
    });
    loadBookmarks();
  } catch (e) {
    alert('保存失敗: ' + e.message);
  }
});

// Load Bookmarks
async function loadBookmarks() {
  bookmarkList.innerHTML = '';
  if (!userCode) return;
  const q = query(collection(db,'translations'),where('userCode','==',userCode));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    const d = doc.data();
    const card = document.createElement('div');
    card.className = 'card mb-2';
    card.innerHTML = `
      <div class="card-body p-2">
        <div class="d-flex justify-content mellom">` +
        `<small class="text-muted">${new Date(d.timestamp).toLocaleString()}</small>` +
        `</div>` +
        `<div><strong>原文:</strong> ${d.original}</div>` +
        `<div><strong>訳文:</strong> ${d.translated}</div>` +
      `</div>`;
    bookmarkList.appendChild(card);
  });
}

// Utils
function detectLangs(text) {
  const hasKorean = /[\uac00-\ud7af]/.test(text);
  const src = hasKorean ? 'ko' : 'ja';
  const tgt = src === 'ko' ? 'ja' : 'ko';
  return { src, tgt };
}

function generatePrompt(text, src) {
  if (src === 'ja') {
    return `あなたは韓国人向けの翻訳アプリです。以下の日本語を韓国語に自然に翻訳し、背景や文化、例文を韓国語で詳しく説明してください。\n\n翻訳元：${text}`;
  } else {
    return `당신은 일본어 학습을 위한 번역기입니다. 아래의 한국어 문장을 자연스러운日本語로 번역하고、意味や用法を日本語で説明してください。\n\n번역元：${text}`;
  }
}
