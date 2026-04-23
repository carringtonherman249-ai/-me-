const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: path.join(__dirname, '../uploads') });
const dbPath = path.join(__dirname, '../data.json');

function readDb() {
  if (!fs.existsSync(dbPath)) return { lastId: 0, orders: [] };
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function writeDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

function calcAmount({ wordCount, paperType, fontType, urgent }) {
  const copyFee = wordCount / 250;
  const paperFee = paperType === 'A4' ? wordCount / 1000 : wordCount / 3000;
  const fontFee = fontType === '宋楷体' ? (wordCount / 1000) * 2 : 0;
  let total = copyFee + paperFee + fontFee;
  if (urgent) total *= 2.5;
  return Number(total.toFixed(2));
}

async function generateWithAI(prompt, wordCount) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'deepseek/deepseek-chat:free';
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1';

  if (!apiKey) {
    return `【演示模式】\n你尚未配置 OPENAI_API_KEY，以下是根据提示生成的示例文本：\n\n${prompt}\n\n（建议目标字数：约 ${Math.min(wordCount, 1500)} 字）`;
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: '你是专业中文写作助手，请输出结构清晰、可直接使用的中文稿件。'
        },
        {
          role: 'user',
          content: `${prompt}\n\n请生成约${Math.min(wordCount, 1500)}字内容。`
        }
      ],
      temperature: 0.7
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AI 接口调用失败: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || 'AI 未返回有效内容';
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = '';

    if (ext === '.txt') {
      text = fs.readFileSync(req.file.path, 'utf8');
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: req.file.path });
      text = result.value || '';
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '仅支持 .txt 或 .docx 文件' });
    }

    fs.unlinkSync(req.file.path);
    return res.json({ text });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt, wordCount = 1000 } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: '请输入AI提示词' });
    }

    const content = await generateWithAI(prompt.trim(), Number(wordCount));
    return res.json({ content });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const { nickname, inputText, paperType, fontType, urgent, aiPrompt = '', aiOutput = '' } = req.body;

    if (!nickname || !nickname.trim()) {
      return res.status(400).json({ error: '下单昵称必填' });
    }
    if (!inputText || !inputText.trim()) {
      return res.status(400).json({ error: '文本内容必填' });
    }

    const wordCount = inputText.trim().length;
    if (wordCount > 30000) {
      return res.status(400).json({ error: '字数不能超过 30000' });
    }

    const amount = calcAmount({
      wordCount,
      paperType: paperType || '普通纸',
      fontType: fontType || '楷宋体',
      urgent: Boolean(urgent)
    });

    const db = readDb();
    const id = db.lastId + 1;
    db.lastId = id;
    db.orders.unshift({
      id,
      nickname: nickname.trim(),
      input_text: inputText,
      word_count: wordCount,
      paper_type: paperType || '普通纸',
      font_type: fontType || '楷宋体',
      urgent: urgent ? 1 : 0,
      ai_prompt: aiPrompt,
      ai_output: aiOutput,
      amount,
      created_at: new Date().toISOString()
    });
    writeDb(db);

    return res.json({ id, wordCount, amount });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', (req, res) => {
  const db = readDb();
  res.json({ list: db.orders });
});

app.get('/api/orders/:id', (req, res) => {
  const db = readDb();
  const row = db.orders.find((o) => o.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: '订单不存在' });
  res.json(row);
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
