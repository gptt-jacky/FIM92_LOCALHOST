// FIM-92 測試伺服器
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
let fim92Device = null;
let vibratorDevice = null;
let webClients = [];

// 處理 WebSocket 連接
wss.on('connection', (ws, request) => {
    console.log('新的連接:', request.socket.remoteAddress);
    
    ws.on('message', (message) => {
        try {
            const data = message.toString();
            console.log('收到資料:', data);
            
            // 判斷是否為 FIM-92 資料格式 (例如: "1,0,1,0")
            if (/^\d,\d,\d,\d$/.test(data)) {
                console.log('FIM-92 資料:', data);
                fim92Device = ws;
                
                // 解析資料
                const [battery, safety, lock, trigger] = data.split(',').map(Number);
                
                // 廣播資料給所有網頁客戶端
                broadcastToWebClients({
                    type: 'fim92_status',
                    data: { battery, safety, lock, trigger },
                    timestamp: Date.now()
                });
            }
            // 判斷是否為 FIM-92 設備識別
            else if (data.includes('fim92_device')) {
                console.log('FIM-92 設備連線');
                fim92Device = ws;
                
                // 廣播設備上線狀態
                broadcastToWebClients({
                    type: 'fim92_connected',
                    timestamp: Date.now()
                });
            }
            // 判斷是否為震動器設備識別
            else if (data.includes('vibrator_device')) {
                console.log('震動器設備連線');
                vibratorDevice = ws;
                
                // 廣播設備上線狀態
                broadcastToWebClients({
                    type: 'vibrator_connected',
                    timestamp: Date.now()
                });
            }
            // 判斷是否為震動器回應
            else if (data.includes('vibrator')) {
                console.log('震動器回應:', data);
                if (!vibratorDevice) vibratorDevice = ws;
            }
            // 判斷是否為網頁客戶端
            else if (data.includes('web_client')) {
                console.log('網頁客戶端連線');
                webClients.push(ws);
                
                // 發送歡迎訊息
                ws.send(JSON.stringify({
                    type: 'welcome',
                    message: 'FIM-92 測試伺服器已連線'
                }));
            }
            // 判斷是否為來自網頁的測試指令
            else {
                try {
                    const command = JSON.parse(data);
                    if (command.type === 'vibration' || command.type === 'buzzer') {
                        console.log('收到測試指令:', data);
                        sendCommandToVibrator(command);
                    }
                } catch (parseError) {
                    // 如果不是 JSON，就是其他類型的訊息
                    console.log('其他訊息:', data);
                }
            }
        } catch (error) {
            console.error('處理訊息錯誤:', error);
        }
    });
    
    // 處理連接關閉
    ws.on('close', () => {
        console.log('連接已關閉');
        if (ws === fim92Device) {
            fim92Device = null;
            broadcastToWebClients({
                type: 'fim92_disconnected',
                timestamp: Date.now()
            });
        }
        if (ws === vibratorDevice) {
            vibratorDevice = null;
            broadcastToWebClients({
                type: 'vibrator_disconnected',
                timestamp: Date.now()
            });
        }
        webClients = webClients.filter(client => client !== ws);
    });
    
    // 處理錯誤
    ws.on('error', (error) => {
        console.error('WebSocket 錯誤:', error);
    });
});

// 發送指令到震動器 (僅在收到網頁測試指令時)
function sendCommandToVibrator(command) {
    if (vibratorDevice && vibratorDevice.readyState === WebSocket.OPEN) {
        const commandString = JSON.stringify(command);
        vibratorDevice.send(commandString);
        console.log('指令已發送到震動器:', commandString);
        
        // 通知網頁指令已發送
        broadcastToWebClients({
            type: 'command_sent',
            command: command,
            timestamp: Date.now()
        });
    } else {
        console.log('震動器未連接，無法發送指令');
        
        // 通知網頁震動器未連接
        broadcastToWebClients({
            type: 'vibrator_not_connected',
            timestamp: Date.now()
        });
    }
}

// 廣播資料給所有網頁客戶端
function broadcastToWebClients(data) {
    webClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
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
            <h1>FIM-92 測試頁面</h1>
            <p>伺服器運行中...</p>
            <p>WebSocket 端口: ${PORT}</p>
        `);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// 啟動伺服器
server.listen(PORT, () => {
    console.log('=================================');
    console.log('FIM-92 測試伺服器已啟動!');
    console.log(`WebSocket 端口: ${PORT}`);
    console.log(`監控頁面: http://localhost:${PORT}`);
    console.log('=================================');
    console.log('等待設備連接...');
    
    // 顯示本機 IP
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    console.log('\n可用的 IP 位址:');
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`   ${name}: ${net.address}`);
            }
        }
    }
    console.log('\n請將 FIM-92 程式的 ws_IP 改成上述 IP 位址之一');
});