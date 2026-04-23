const inputText = document.getElementById('inputText');
const wordCountEl = document.getElementById('wordCount');
const amountEl = document.getElementById('amount');

function getWordCount() {
  return (inputText.value || '').trim().length;
}

function calcAmount(wordCount, paperType, fontType, urgent) {
  const copyFee = wordCount / 250;
  const paperFee = paperType === 'A4' ? wordCount / 1000 : wordCount / 3000;
  const fontFee = fontType === '宋楷体' ? (wordCount / 1000) * 2 : 0;
  let total = copyFee + paperFee + fontFee;
  if (urgent) total *= 2.5;
  return total.toFixed(2);
}

function refreshMeta() {
  const wc = getWordCount();
  wordCountEl.textContent = `字数：${wc} / 30000`;

  const paperType = document.getElementById('paperType').value;
  const fontType = document.getElementById('fontType').value;
  const urgent = document.getElementById('urgent').checked;
  amountEl.textContent = `预估金额：¥${calcAmount(wc, paperType, fontType, urgent)}`;

  if (wc > 30000) {
    wordCountEl.style.color = '#fca5a5';
  } else {
    wordCountEl.style.color = '';
  }
}

['input', 'change'].forEach((ev) => {
  inputText.addEventListener(ev, refreshMeta);
  document.getElementById('paperType').addEventListener(ev, refreshMeta);
  document.getElementById('fontType').addEventListener(ev, refreshMeta);
  document.getElementById('urgent').addEventListener(ev, refreshMeta);
});

// 上传文本
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  const resp = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || '上传失败');
  inputText.value = data.text || '';
  refreshMeta();
});

// AI生成
document.getElementById('aiGenerateBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('aiPrompt').value;
  if (!prompt.trim()) return alert('请先输入AI提示词');

  const resp = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, wordCount: getWordCount() || 1000 })
  });
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'AI生成失败');
  document.getElementById('aiOutput').value = data.content;
});

// 提交订单
document.getElementById('submitBtn').addEventListener('click', async () => {
  const payload = {
    nickname: document.getElementById('nickname').value,
    inputText: inputText.value,
    paperType: document.getElementById('paperType').value,
    fontType: document.getElementById('fontType').value,
    urgent: document.getElementById('urgent').checked,
    aiPrompt: document.getElementById('aiPrompt').value,
    aiOutput: document.getElementById('aiOutput').value
  };

  if ((payload.inputText || '').trim().length > 30000) {
    return alert('字数不能超过30000');
  }

  const resp = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || '提交失败');

  const resultBox = document.getElementById('orderResult');
  resultBox.hidden = false;
  resultBox.innerHTML = `
    <strong>提交成功！订单ID：${data.id}</strong><br>
    总价格预估值：<strong>¥${data.amount}</strong><br>
    联系微信账号：<br>
    1) zh3110241437<br>
    2) XCS1949749
  `;
});

refreshMeta();
