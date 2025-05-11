// 初始化marked
const marked = window.marked || {
    parse: (text) => {
        console.warn('marked未正确加载，使用纯文本显示');
        return text.replace(/</g, '<').replace(/>/g, '>');
    }
};

// 全局变量
let chatBox, input, sendBtn, spinner;
let prevScrollHeight;
let isManuallyScrolled = false;
let mdContent = '';

// 检查marked是否加载成功
if (!window.marked) {
    console.error('marked库未正确加载，请确保在HTML中引入marked.js');
}

// 确保DOM加载完成后再绑定事件
document.addEventListener('DOMContentLoaded', () => {
    chatBox = document.getElementById('chat-box');
    input = document.getElementById('input');
    sendBtn = document.getElementById('send-btn');
    spinner = document.querySelector('.loading-spinner');

    if (!chatBox || !input || !sendBtn || !spinner) {
        console.error('无法找到必要的DOM元素');
        return;
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 监听滚动事件
    window.addEventListener('scroll', () => {
        // 当滚动到底部后，重置 isManuallyScrolled 或者允许自动滚动
        isManuallyScrolled = window.innerHeight + window.scrollY < window.document.body.scrollHeight - 80;
    });

});

// 配置marked
marked.setOptions({
    breaks: false,
    gfm: true
});
marked.use({
    mangle: false
});
function appendMessage(role, content, isStreaming = false, isThinking = false) {
    let messageDiv = chatBox.querySelector(`.${role}-message:last-child`);
    prevScrollHeight = chatBox.scrollHeight;

    // 如果是新消息或非流式更新
    if (!messageDiv || !isStreaming) {
        messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${role}-message`);
        chatBox.appendChild(messageDiv);
    }

    // 处理query、think、answer内容
    let userContent = '';
    let thinkContent = '';
    let mainContent = '';

    if (role === 'user') {
        userContent = content;
        let userContentDiv = messageDiv.querySelector('.user-content:last-child');
        if (!userContentDiv) {
            userContentDiv = document.createElement('div');
            userContentDiv.classList.add('user-content');
            messageDiv.appendChild(userContentDiv);
        }

        userContentDiv.innerHTML = `<p>${userContent
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .trim()}</p>`;

    } else {
        if (isThinking) {
            thinkContent = content;
            let thinkContentDiv = messageDiv.querySelector('.think-content:last-child');
            if (!thinkContentDiv) {
                thinkContentDiv = document.createElement('div');
                thinkContentDiv.classList.add('think-content');
                messageDiv.appendChild(thinkContentDiv);
            }
            thinkContentDiv.innerHTML = `${marked.parse(thinkContent.trim())}`;
        } else {
            mainContent = content;
            let answerContentDiv = messageDiv.querySelector('.answer-content:last-child');
            if (!answerContentDiv) {
                answerContentDiv = document.createElement('div');
                answerContentDiv.classList.add('answer-content');
                messageDiv.appendChild(answerContentDiv);
            }

            //处理数学公式
            // 保存匹配到的 LaTeX 公式
            const latexStore = {};
            const placeholderPrefix = 'LATEX_PLACEHOLDER_';
            let index = 0;

            // 改进后的正则：匹配 $$...$$、$...$、\(...\) 和 \[...\] 四种格式
            const regex = /\$\$([\s\S]+?)\$\$|\$([\s\S]+?)\$|\\\(([\s\S]+?)\\\)|\\\[((?:[\s\S])+?)\\\]/g;

            // 替换 LaTeX 公式为占位符，并保存原公式
            const textWithPlaceholders = mainContent.replace(regex, (match, p1, p2, p3, p4) => {
                const placeholder = `${placeholderPrefix}${index++}__`;
                // 保存完整的公式（包括外围符号）
                latexStore[placeholder] = match;
                return placeholder;
            });

            // 使用 marked 解析替换后的文本
            let parsedText = marked.parse(textWithPlaceholders);

            // 将占位符替换回对应的 LaTeX 公式
            Object.keys(latexStore).forEach(placeholder => {
                parsedText = parsedText.split(placeholder).join(latexStore[placeholder]);
            });

            // answerContentDiv.innerHTML = `${marked.parse(mainContent.trim())}`; // 会破坏LaTeX公式
            answerContentDiv.innerHTML = parsedText.trim();
            if (window.MathJax) {
                MathJax.typesetPromise([answerContentDiv]).catch(console.error);
                // MathJax.typeset();
            }

        }
    }

    // 智能滚动
    if (chatBox && chatBox.scrollHeight > prevScrollHeight) {
        // 滚动到底部
        if (!isManuallyScrolled) {
            window.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
         }
    }

}

// 写入剪贴板（md）
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板');
    }).catch(err => {
        console.error('复制失败:', err);
        showToast('复制失败');
    });
}

// 复制文本内容到剪贴板：支持HTML和纯文本
async function writeToClipboard(html, text) {
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([text], { type: 'text/plain' });

    await navigator.clipboard.write([
        new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
        })
    ]).then(() => {
        showToast('已复制到剪贴板');
    }
    ).catch(err => {
        console.error('复制失败:', err);
        showToast('复制失败');
    });
}

// 显示提示信息
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 2000);
    }, 10);
}

function inlineStyles(element) {
    const allowedProps = [
        'color', 'font-family', 'font-size', 'background-color',
        'margin', 'padding', 'text-align', 'font-weight',
        'border', 'line-height', 'list-style-type'
    ];

    const elements = [element];
    while (elements.length) {
        const el = elements.shift();
        if (el.nodeType !== 1) continue; // 非元素节点跳过

        const computed = getComputedStyle(el);
        let cssText = '';

        allowedProps.forEach(prop => {
            const value = computed.getPropertyValue(prop);
            if (value) cssText += `${prop}: ${value};`;
        });

        el.style.cssText += cssText;
        elements.push(...el.children);
    }
}

function convertImgPaths(element) {
    element.querySelectorAll('img').forEach(img => {
        try {
            img.src = new URL(img.src).href;
        } catch {
            img.removeAttribute('src');
        }
    });
}

function copyContent(div) {
    // const div = document.getElementById('content');
    if (!div) return;

    // 创建临时容器并添加到DOM
    const tempWrapper = document.createElement('div');
    tempWrapper.style.position = 'fixed';
    tempWrapper.style.left = '-9999px';
    document.body.appendChild(tempWrapper);

    // 克隆元素并处理
    const clonedDiv = div.cloneNode(true);
    tempWrapper.appendChild(clonedDiv);

    // 转换样式为内联样式
    inlineStyles(clonedDiv);

    // 处理图片路径
    convertImgPaths(clonedDiv);

    // 获取处理后的HTML
    const html = clonedDiv.outerHTML;

    // 写入剪贴板
    writeToClipboard(html, div.textContent).finally(() => tempWrapper.remove());
}

// 初始化复制按钮
function initCopyButtons() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.copy-btn')) {
            const message = e.target.closest('.message').querySelector('.answer-content, .user-content');
            if (message) {
                // copyToClipboard(message.textContent.trim());
                // copyToClipboard(message.innerHTML.trim()); // 效果不佳，会丢失样式
                copyContent(message);
            }
        }
        if (e.target.closest('.copy-md-btn')) {
            const message = e.target.closest('.message').querySelector('.answer-content, .user-content');
            if (message) {
                // 直接读取预先存储的原始md内容
                copyToClipboard(mdContent);
            }
        }
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    chatBox = document.getElementById('chat-box');
    input = document.getElementById('input');
    sendBtn = document.getElementById('send-btn');

    if (!chatBox || !input || !sendBtn) {
        console.error('无法找到必要的DOM元素');
        return;
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    initCopyButtons();
});

async function sendMessage() {
    const message = input.value.trim();

    if (!message){
        return;
    } 

    // 添加用户消息
    appendMessage('user', message);
    input.value = '';
    sendBtn.disabled = true;
    isManuallyScrolled = false;

    // 显示加载动画
    chatBox.appendChild(spinner);
    spinner.classList.remove('hidden');

    try {
        // 使用fetch API进行POST请求
        const response = await fetch('api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify({
                message: message
            })
        });

        if (!response.ok) {
            throw new Error('请求失败');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let assistantReasoningMessage = '';
        let assistantAnswerMessage = '';
        let buffer = ''; // Buffer to accumulate incoming data

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                // Process any remaining data in the buffer as the final event
                if (buffer.trim()) {
                    let accumulatedJsonInLastChunk = "";
                    const lines = buffer.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            let payload = line.substring(5); // Get everything after "data:"
                            if (payload.startsWith(' ')) {
                                payload = payload.substring(1); // Remove leading space if present
                            }
                            accumulatedJsonInLastChunk += payload;
                        }
                    }

                    if (accumulatedJsonInLastChunk && accumulatedJsonInLastChunk !== '[DONE]') {
                        try {
                            const data = JSON.parse(accumulatedJsonInLastChunk);
                            processData(data);
                        } catch (e) {
                            console.error('Error parsing remaining JSON from buffer:', e, accumulatedJsonInLastChunk);
                            // Optionally, display an error message to the user for the final chunk
                            // appendMessage('assistant', `错误：解析最后的数据块时出错`);
                        }
                    }
                }
                break; // Stream finished
            }

            buffer += decoder.decode(value, { stream: true });
            let eventEndIndex;

            // Process complete events (ending with \n\n)
            while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
                const eventStr = buffer.substring(0, eventEndIndex);
                buffer = buffer.substring(eventEndIndex + 2); // Remove processed event and \n\n

                let accumulatedJsonInEvent = "";
                const lines = eventStr.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        let payload = line.substring(5); // Get everything after "data:"
                        if (payload.startsWith(' ')) {
                            payload = payload.substring(1); // Remove leading space if present
                        }
                        accumulatedJsonInEvent += payload;
                    }
                    // Other SSE fields like 'id:', 'event:', 'retry:' could be handled here if needed
                }

                if (accumulatedJsonInEvent.trim() === '[DONE]') {
                    mdContent = assistantAnswerMessage; // Save final content
                    const lastAssistantMessageDiv = chatBox.querySelector('.assistant-message:last-child');
                    if (lastAssistantMessageDiv) {
                         addCopyButtonsToMessage(lastAssistantMessageDiv);
                    }
                    sendBtn.disabled = false;
                    if (spinner) spinner.classList.add('hidden');
                    return; // Exit the read loop, [DONE] received
                }

                if (accumulatedJsonInEvent) {
                    try {
                        const data = JSON.parse(accumulatedJsonInEvent);
                        processData(data);
                    } catch (e) {
                        console.error('Error parsing JSON from event:', e, accumulatedJsonInEvent);
                        // appendMessage('assistant', `错误：解析收到的数据时出错`);
                    }
                }
            }
        }

        function processData(data) {
            if (data.choices && data.choices[0]) {
                const choice = data.choices[0];

                if (choice.delta) {
                    if (choice.delta.reasoning_content) {
                        assistantReasoningMessage += choice.delta.reasoning_content;
                        appendMessage('assistant', assistantReasoningMessage, true, true);
                    } else if (choice.delta.content) {
                        assistantAnswerMessage += choice.delta.content;
                        appendMessage('assistant', assistantAnswerMessage, true, false);
                    }
                    if (spinner) spinner.classList.add('hidden');
                }

                if (choice.finish_reason === 'stop') {
                    mdContent = assistantAnswerMessage; // Save final content
                    // Buttons are now added when [DONE] is received or stream ends
                    // to ensure they are added only once and after all content.
                    const lastAssistantMessageDiv = chatBox.querySelector('.assistant-message:last-child');
                    if (lastAssistantMessageDiv) {
                         addCopyButtonsToMessage(lastAssistantMessageDiv);
                    }
                    sendBtn.disabled = false;
                    if (spinner) spinner.classList.add('hidden');
                }
            }
        }
        
        function addCopyButtonsToMessage(messageDiv) {
            if (!messageDiv || messageDiv.querySelector('.message-actions')) {
                return; // Already has buttons or invalid div
            }
            const btnContainer = document.createElement('div');
            btnContainer.className = 'message-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.title = '复制文本';
            copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';

            const copyMdBtn = document.createElement('button');
            copyMdBtn.className = 'copy-md-btn';
            copyMdBtn.title = '复制Markdown';
            copyMdBtn.innerHTML = '<i class="fa-brands fa-markdown"></i>';

            btnContainer.appendChild(copyBtn);
            btnContainer.appendChild(copyMdBtn);
            messageDiv.appendChild(btnContainer);
        }

    } catch (error) {
        if (spinner) {
            spinner.classList.add('hidden');
        }
        console.error('Error in sendMessage:', error); // Changed console.log to console.error
        appendMessage('assistant', `错误：${error.message}`);
    } finally {
        sendBtn.disabled = false;
    }
}
