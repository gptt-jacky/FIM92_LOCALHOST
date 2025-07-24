// FIM-92 位元控制伺服器 - 數字格式版本
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 設定伺服器
const PORT = 8080;
const server = http.createServer();

// WebSocket 伺服器
const wss = new WebSocket.Server({ server });

// 儲存連接的設備
let vibratorDevice = null;
let webClients = [];

// 處理 WebSocket 連接
wss.on('connection', (ws, request) => {
    console.log('新的連接:', request.socket.remoteAddress);
    
    ws.on('message', (message) => {
        try {
            const data = message.toString();
            console.log('收到資料:', data);
            
            // 判斷是否為震動器設備識別
            if (data.includes('vibrator_device')) {
                console.log('震動器設備連線');
                vibratorDevice = ws;
                
                // 廣播設備上線狀態
                broadcastToWebClients({
                    type: 'vibrator_connected',
                    timestamp: Date.now()
                });
            }
            // 判斷是否為網頁客戶端
            else if (data.includes('web_monitor')) {
                console.log('網頁客戶端連線');
                webClients.push(ws);
                
                // 發送歡迎訊息
                ws.send('web_monitor');
            }
            // 判斷是否為 SET 指令 (網站發送到ESP32)
            else if (data.startsWith('SET_')) {
                console.log('網站發送 SET 指令:', data);
                sendCommandToVibrator(data);
            }
            // 判斷是否為 BIT 指令 (網站發送到ESP32)
            else if (data.startsWith('BIT_')) {
                console.log('網站發送 BIT 指令:', data);
                sendCommandToVibrator(data);
            }
            // 判斷是否為 CLS 指令 (網站發送到ESP32)
            else if (data === 'CLS') {
                console.log('網站發送 CLS 指令');
                sendCommandToVibrator(data);
            }
            // 判斷是否為ESP32回傳的狀態數字
            else if (/^\d+$/.test(data)) {
                const value = parseInt(data);
                if (value >= 0 && value <= 65535) {
                    console.log('ESP32回傳狀態數字:', value);
                    
                    // 分析啟用的位元
                    const activeBits = [];
                    for (let i = 0; i < 16; i++) {
                        if (value & (1 << i)) {
                            activeBits.push(`BIT${i}`);
                        }
                    }
                    
                    if (activeBits.length > 0) {
                        console.log('啟用位元:', activeBits.join(', '));
                    } else {
                        console.log('所有位元都是OFF');
                    }
                    
                    // 如果是來自ESP32，廣播給所有網頁客戶端
                    if (ws === vibratorDevice) {
                        console.log('廣播ESP32狀態給網頁客戶端');
                        broadcastToWebClients(data);
                    }
                    // 如果是來自網頁，轉發給ESP32
                    else {
                        console.log('網頁發送數字指令給ESP32:', data);
                        sendCommandToVibrator(data);
                    }
                }
            }
            // 其他訊息
            else {
                console.log('其他訊息:', data);
            }
        } catch (error) {
            console.error('處理訊息錯誤:', error);
        }
    });
    
    // 處理連接關閉
    ws.on('close', () => {
        console.log('連接已關閉');
        if (ws === vibratorDevice) {
            vibratorDevice = null;
            console.log('震動器設備離線');
        }
        webClients = webClients.filter(client => client !== ws);
    });
    
    // 處理錯誤
    ws.on('error', (error) => {
        console.error('WebSocket 錯誤:', error);
    });
});

// 發送指令到震動器 (ESP32)
function sendCommandToVibrator(command) {
    if (vibratorDevice && vibratorDevice.readyState === WebSocket.OPEN) {
        vibratorDevice.send(command);
        console.log('指令已發送到ESP32:', command);
    } else {
        console.log('ESP32未連接，無法發送指令');
    }
}

// 廣播給所有網頁客戶端
function broadcastToWebClients(data) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    webClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// HTTP 伺服器處理網頁請求
server.on('request', (req, res) => {
    if (req.url === '/') {
        // 提供監控頁面
        const htmlPath = path.join(__dirname, 'FIM92_Monitor.html');
        fs.readFile(htmlPath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(data);
            }
        });
    } else if (req.url === '/test') {
        // 測試頁面
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <h1>FIM-92 位元控制測試頁面</h1>
            <p>伺服器運行中...</p>
            <p>WebSocket 端口: ${PORT}</p>
            <p>數字範例:</p>
            <ul>
                <li>1 = BIT0</li>
                <li>2 = BIT1</li>
                <li>4 = BIT2</li>
                <li>8 = BIT3</li>
                <li>16 = BIT4</li>
                <li>32 = BIT5</li>
            </ul>
        `);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// 啟動伺服器
server.listen(PORT, () => {
    console.log('=================================');
    console.log('FIM-92 位元控制伺服器已啟動!');
    console.log(`WebSocket 端口: ${PORT}`);
    console.log(`監控頁面: http://localhost:${PORT}`);
    console.log('=================================');
    console.log('數字格式說明:');
    console.log('  1 = BIT0, 2 = BIT1, 4 = BIT2, 8 = BIT3');
    console.log('  16 = BIT4, 32 = BIT5, 64 = BIT6, 128 = BIT7');
    console.log('  例如: 34 = BIT1+BIT5 (2+32)');
    console.log('=================================');
    console.log('等待設備連接...');
    
    // 顯示本機 IP
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    console.log('可用的 IP 位址:');
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`   ${name}: ${net.address}`);
            }
        }
    }
    console.log('請將 ESP32 程式的 ws_server 改成上述 IP 位址之一');
});