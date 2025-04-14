require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const apilog = process.env.API_LOG || false;

// 配置中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// API代理路由
app.use('/api', async (req, res) => {
  try {

    console.log('req.url:', req.url);
    const targetUrl = process.env.API_BASE_URL + req.url.replace('/chat', '/chat/completions');
    console.log('Proxying request to:', targetUrl);

    // 检查API_BASE_URL是否配置
    if (!process.env.API_BASE_URL) {
      throw new Error('API_BASE_URL未配置');
    }

    // 获取系统提示词
    const systemPrompt = process.env.API_SYSTEM_PROMPT;

    // 生成当前日期（格式可自定义）
    // const currentDate = new Date().toLocaleDateString();
    const currentDate = new Date();
    const formattedDate = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long'
    }).format(currentDate);

    // 替换占位符（默认使用双大括号包裹的 {{date}}）
    const formattedPrompt = systemPrompt.replace(/{{date}}/g, currentDate);

    // 构建完整的消息数组
    const messages = [
      { role: 'system', content: formattedPrompt }, // 替换后的系统提示
      ...(req.body.messages || [{ role: 'user', content: req.body.message || '' }])
    ];

    // 构建符合OpenAI API规范的请求体
    const requestBody = {
      messages: messages,
      model: process.env.MODEL_NAME || 'gpt-3.5-turbo',
      stream: true
    };

    // 从环境变量中获取API key
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error('API_KEY未配置');
    }

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}` || ''
      },
      body: JSON.stringify(requestBody)
    };

    const apiResponse = await fetch(targetUrl, options);

    // 处理非200状态码
    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      throw new Error(errorData.message || `API请求失败: ${apiResponse.statusText}`);
    }

    // 处理SSE流式响应
    if (apiResponse.headers.get('content-type')?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = apiResponse.body.getReader();
      const decoder = new TextDecoder();

      // 创建调试日志文件
      const fs = require('fs');
      const logStream = fs.createWriteStream('api_response.log', { flags: 'a' });
      if (apilog) {
        logStream.write(`[${new Date().toISOString()}] Starting API response logging\n`);
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        if (apilog) {
          // 记录原始响应数据
          logStream.write(`[${new Date().toISOString()}] Raw chunk:\n${chunk}\n\n`);
        }

        // 直接转发原始SSE数据
        res.write(chunk);
      }

      if (apilog) { logStream.end(); }

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const data = await apiResponse.json();
      res.json(data);
    }
  } catch (error) {
    console.error('API代理错误:', error);
    res.status(500).json({
      error: error.message,
      details: error.stack
    });
  }
});

// 静态文件服务
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
