// app.js
import { db, auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from './firebase-config.js';
import { collection, addDoc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userEmail = document.getElementById('userEmail');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerSubmitBtn = document.getElementById('registerSubmitBtn');
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

let currentTranslation = '';
let currentLangs = {};
let currentUid = null;

// Load saved API key
apiKeyInput.value = localStorage.getItem('geminiApiKey') || '';
apiKeySaveBtn.addEventListener('click', () => {
  localStorage.setItem('geminiApiKey', apiKeyInput.value.trim());
  const modal = bootstrap.Modal.getInstance(document.getElementById('apiKeyModal'));
  modal.hide();
});

// Auth state observer
onAuthStateChanged(auth, user => {
  if (user) {
    currentUid = user.uid;
    userEmail.textContent = user.email || '匿名';
    loginBtn.classList.add('d-none');
    registerBtn.classList.add('d-none');
    logoutBtn.classList.remove('d-none');
    bookmarkBtn.removeAttribute('hidden');
    loadBookmarks();
  } else {
    currentUid = null;
    userEmail.textContent = '';
    loginBtn.classList.remove('d-none');
    registerBtn.classList.remove('d-none');
    logoutBtn.classList.add('d-none');
    bookmarkBtn.setAttribute('hidden', '');
    bookmarkList.innerHTML = '';
  }
});

// Login
loginSubmitBtn.addEventListener('click', async () => {
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
    bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
  } catch (e) {
    alert('ログイン失敗: ' + e.message);
  }
});

// Register
registerSubmitBtn.addEventListener('click', async () => {
  try {
    await createUserWithEmailAndPassword(auth, registerEmail.value, registerPassword.value);
    bootstrap.Modal.getInstance(document.getElementById('registerModal')).hide();
  } catch (e) {
    alert('登録失敗: ' + e.message);
  }
});

// Logout
logoutBtn.addEventListener('click', () => signOut(auth));

// Translate
translateBtn.addEventListener('click', async () => {
  const apiKey = localStorage.getItem('geminiApiKey');
  const text = inputText.value.trim();
  if (!apiKey || !text) return;

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
    saveBtn.disabled = !currentUid;
  } catch (e) {
    console.error(e);
    resultBox.innerHTML = `<div class="text-danger">⚠️ 翻訳失敗: ${e.message}</div>`;
  }
});

// Save Bookmark
saveBtn.addEventListener('click', async () => {
  if (!currentUid) return;
  try {
    await addDoc(collection(db,'translations'),{
      userId:currentUid,
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
  if (!currentUid) return;
  const q = query(collection(db,'translations'),where('userId','==',currentUid));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    const d = doc.data();
    const card = document.createElement('div');
    card.className = 'card mb-2';
    card.innerHTML = `
      <div class="card-body p-2">
        <div class="d-flex justify-content-between">
          <small class="text-muted">${new Date(d.timestamp).toLocaleString()}</small>
        </div>
        <div><strong>原文:</strong> ${d.original}</div>
        <div><strong>訳文:</strong> ${d.translated}</div>
      </div>`;
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
    return `당신은 일본어 학습을 위한 번역기입니다. 아래의 한국어 문장을 자연스러운 일본語로 번역하고、意味や用法を日本語で説明してください。\n\n번역元：${text}`;
  }
}
