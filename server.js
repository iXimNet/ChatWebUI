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
// Serve static files only from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

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

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders(); // Important for SSE

      // Attempt to disable Nagle's algorithm for the response socket
      if (res.socket) {
        res.socket.setNoDelay(true);
      }

      const reader = apiResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // 创建调试日志文件 (如果需要)
      let logStream;
      if (apilog) {
        const fs = require('fs');
        logStream = fs.createWriteStream('api_response.log', { flags: 'a' });
        logStream.write(`[${new Date().toISOString()}] Starting API response logging for a new request\n`);
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (apilog && logStream) {
              logStream.write(`[${new Date().toISOString()}] Stream finished. Remaining buffer: "${buffer}"\n`);
            }
            // If there's anything left in the buffer when the stream is done,
            // send it, assuming it's the end of a message or a [DONE] signal.
            if (buffer.length > 0) {
              if (apilog && logStream) {
                logStream.write(`[${new Date().toISOString()}] Writing remaining buffer: ${buffer}\n`);
              }
              res.write(buffer);
            }
            break;
          }

          const rawChunk = decoder.decode(value, { stream: true });
          if (apilog && logStream) {
            logStream.write(`[${new Date().toISOString()}] Raw chunk received:\n${rawChunk}\n---\n`);
          }
          buffer += rawChunk;

          let eolIndex;
          // SSE messages are separated by double newlines (\n\n)
          while ((eolIndex = buffer.indexOf('\n\n')) >= 0) {
            const message = buffer.substring(0, eolIndex + 2); // Include the \n\n
            buffer = buffer.substring(eolIndex + 2);
            if (apilog && logStream) {
              logStream.write(`[${new Date().toISOString()}] Forwarding complete SSE message:\n${message}\n---\n`);
            }
            res.write(message);
          }
        }
      } catch (streamError) {
        console.error('Error while reading or processing stream:', streamError);
        if (apilog && logStream) {
          logStream.write(`[${new Date().toISOString()}] Error during stream processing: ${streamError.message}\nStack: ${streamError.stack}\n`);
        }
        // Don't try to write to res if headers already sent and errored
      } finally {
        if (apilog && logStream) {
          logStream.write(`[${new Date().toISOString()}] Ending API response logging for this request.\n\n`);
          logStream.end();
        }
        // Ensure res.end() is called, but only if not already ended due to an error.
        // The 'data: [DONE]\n\n' is typically sent by the OpenAI API itself.
        // If your specific backend API doesn't send it, you might need to add it here,
        // but it's better if the upstream API handles the [DONE] signal.
        // For now, we assume the upstream API sends its own [DONE] or equivalent.
        if (!res.writableEnded) {
          res.end();
        }
      }
    } else {
      // Handle non-streamed JSON response
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
// All static assets are now served by express.static from the 'public' directory.
// This catch-all for index.html should now point to the 'public' directory as well.
app.get('*', (req, res) => {
  // Check if the request is for a file that should exist in public (e.g. index.html)
  // or if it's a route for a single-page application.
  // For a simple setup, always serving index.html for non-API GET requests is common.
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
