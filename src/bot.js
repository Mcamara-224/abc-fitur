const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const config = require('./config');
const { askAI } = require('./ai');
const { checkSpam } = require('./antiSpam');
const memberManager = require('./memberManager');
const { handleAdminCommand, handleMemberCommand, isBotActive } = require('./commands');
const { welcomeMember, farewellMember, checkForLinks } = require('./groupManager');

// ── Variables globales pairage ──
var pairingCode = null;
var isConnected = false;
var pairingCallback = null;

// ── Serveur web intégré ──
function startWebServer(port) {
  var server = http.createServer(function(req, res) {

    // Page principale
    if (req.url === '/' || req.url === '/code') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getPageHTML());
      return;
    }

    // API : recevoir le numéro
    if (req.url === '/pair' && req.method === 'POST') {
      var body = '';
      req.on('data', function(chunk) { body += chunk; });
      req.on('end', async function() {
        try {
          var data = JSON.parse(body);
          var phone = data.phone.replace(/[^0-9]/g, '');
          if (!phone || phone.length < 10) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Numero invalide' }));
            return;
          }
          if (pairingCallback) {
            await pairingCallback(phone);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch(e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // API : statut
    if (req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        connected: isConnected,
        code: pairingCode,
      }));
      return;
    }

    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'online', bot: 'ChapeauNoir' }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, function() {
    console.log('Serveur web demarre port ' + port);
  });
}

// ── Page HTML pairage ──
function getPageHTML() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChapeauNoir — Connexion</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      min-height:100vh;
      background:#000;
      background-image:
        radial-gradient(circle at 20% 50%,rgba(0,255,136,0.05) 0%,transparent 50%),
        radial-gradient(circle at 80% 20%,rgba(255,170,0,0.05) 0%,transparent 50%);
      font-family:Arial,sans-serif;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
    }
    .card{
      background:rgba(255,255,255,0.05);
      border:1px solid rgba(0,255,136,0.3);
      border-radius:20px;
      padding:40px 30px;
      width:100%;
      max-width:420px;
      text-align:center;
    }
    .logo{font-size:60px;margin-bottom:10px}
    h1{color:#00ff88;font-size:26px;margin-bottom:5px}
    .subtitle{color:#888;font-size:13px;margin-bottom:30px}
    .label{color:#aaa;font-size:13px;text-align:left;margin-bottom:8px;display:block}
    .input-group{
      display:flex;
      background:#111;
      border:1px solid rgba(0,255,136,0.4);
      border-radius:12px;
      overflow:hidden;
      margin-bottom:20px;
    }
    .flag{
      padding:14px 15px;
      color:#00ff88;
      font-size:16px;
      border-right:1px solid rgba(0,255,136,0.2);
      background:rgba(0,255,136,0.05);
      white-space:nowrap;
    }
    input[type=tel]{
      flex:1;
      padding:14px 15px;
      background:transparent;
      border:none;
      color:#fff;
      font-size:16px;
      outline:none;
    }
    input[type=tel]::placeholder{color:#444}
    .btn{
      width:100%;
      padding:15px;
      background:linear-gradient(135deg,#00ff88,#00cc6a);
      border:none;
      border-radius:12px;
      color:#000;
      font-size:16px;
      font-weight:bold;
      cursor:pointer;
    }
    .btn:disabled{opacity:0.5;cursor:not-allowed}
    .spinner{
      width:50px;height:50px;
      border:3px solid rgba(0,255,136,0.2);
      border-top:3px solid #00ff88;
      border-radius:50%;
      animation:spin 1s linear infinite;
      margin:20px auto;
    }
    @keyframes spin{to{transform:rotate(360deg)}}
    .code-box{
      background:#111;
      border:2px solid #ffaa00;
      border-radius:16px;
      padding:25px;
      margin:20px 0;
    }
    .code-label{color:#888;font-size:12px;margin-bottom:10px}
    .code{
      font-size:42px;
      font-weight:bold;
      color:#ffaa00;
      letter-spacing:10px;
    }
    .steps-box{
      background:rgba(0,255,136,0.05);
      border:1px solid rgba(0,255,136,0.2);
      border-radius:12px;
      padding:15px 20px;
      text-align:left;
      margin:15px 0;
    }
    .steps-box p{color:#aaa;font-size:13px;margin:5px 0;line-height:1.6}
    .steps-box b{color:#00ff88}
    .copy-btn{
      width:100%;padding:12px;
      background:rgba(255,170,0,0.1);
      border:1px solid #ffaa00;
      border-radius:10px;
      color:#ffaa00;font-size:14px;
      cursor:pointer;margin-bottom:10px;
    }
    .retry-btn{
      width:100%;padding:12px;
      background:transparent;
      border:1px solid #555;
      border-radius:10px;
      color:#888;font-size:14px;cursor:pointer;
    }
    .success-icon{font-size:70px;margin:10px 0}
    .success-text{color:#00ff88;font-size:22px;font-weight:bold;margin:10px 0}
    .success-sub{color:#888;font-size:14px}
    .error-msg{color:#ff4444;font-size:13px;margin-top:10px;display:none}
    .footer{color:#333;font-size:12px;margin-top:25px}
  </style>
</head>
<body>
<div class="card">
  <div class="logo">🎩</div>
  <h1>ChapeauNoir</h1>
  <div class="subtitle">Assistant WhatsApp — by Mcamara</div>

  <div id="step1">
    <span class="label">📱 Ton numéro WhatsApp</span>
    <div class="input-group">
      <div class="flag">🇬🇳 +224</div>
      <input type="tel" id="phoneInput" placeholder="6XX XXX XXX" maxlength="9"/>
    </div>
    <button class="btn" onclick="requestCode()" id="btnRequest">
      🔑 Obtenir le code de pairage
    </button>
    <div class="error-msg" id="errorMsg">❌ Numéro invalide</div>
  </div>

  <div id="step2" style="display:none">
    <div class="spinner"></div>
    <p style="color:#888">Génération du code...</p>
    <p style="color:#555;font-size:12px;margin-top:10px">5 à 10 secondes</p>
  </div>

  <div id="step3" style="display:none">
    <div class="code-box">
      <div class="code-label">TON CODE DE PAIRAGE</div>
      <div class="code" id="codeDisplay">----</div>
    </div>
    <div class="steps-box">
      <p><b>Comment connecter :</b></p>
      <p>1. Ouvre WhatsApp</p>
      <p>2. 3 points ⋮ → Appareils connectés</p>
      <p>3. Connecter un appareil</p>
      <p>4. Entrer le code à la place du QR</p>
      <p>5. Entre le code ci-dessus ✅</p>
    </div>
    <button class="copy-btn" onclick="copyCode()">📋 Copier le code</button>
    <button class="retry-btn" onclick="goBack()">↩ Recommencer</button>
  </div>

  <div id="step4" style="display:none">
    <div class="success-icon">✅</div>
    <div class="success-text">Bot connecté !</div>
    <p class="success-sub">ChapeauNoir est actif dans ton groupe 🎩</p>
  </div>

  <div class="footer">🔐 Connexion sécurisée — Mcamara</div>
</div>

<script>
var currentCode = null;
var checkInterval = null;

function show(id) {
  var ids = ['step1','step2','step3','step4'];
  for(var i=0;i<ids.length;i++){
    document.getElementById(ids[i]).style.display='none';
  }
  document.getElementById(id).style.display='block';
}

async function requestCode() {
  var input = document.getElementById('phoneInput').value.replace(/\\s/g,'');
  var errorMsg = document.getElementById('errorMsg');
  if (!input || input.length < 8) {
    errorMsg.style.display = 'block';
    return;
  }
  errorMsg.style.display = 'none';
  var fullPhone = '224' + input;
  document.getElementById('btnRequest').disabled = true;
  show('step2');
  try {
    var res = await fetch('/pair', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({phone: fullPhone}),
    });
    if (res.ok) {
      startChecking();
    } else {
      show('step1');
      document.getElementById('btnRequest').disabled = false;
    }
  } catch(e) {
    show('step1');
    document.getElementById('btnRequest').disabled = false;
  }
}

function startChecking() {
  if (checkInterval) clearInterval(checkInterval);
  checkInterval = setInterval(async function() {
    try {
      var res = await fetch('/status');
      var data = await res.json();
      if (data.connected) {
        clearInterval(checkInterval);
        show('step4');
        return;
      }
      if (data.code && data.code !== currentCode) {
        currentCode = data.code;
        document.getElementById('codeDisplay').innerText = data.code;
        show('step3');
      }
    } catch(e) {}
  }, 2000);
}

function copyCode() {
  if (currentCode) {
    navigator.clipboard.writeText(currentCode.replace(/-/g,'')).then(function() {
      alert('Code copié : ' + currentCode);
    });
  }
}

function goBack() {
  if (checkInterval) clearInterval(checkInterval);
  currentCode = null;
  document.getElementById('phoneInput').value = '';
  document.getElementById('btnRequest').disabled = false;
  show('step1');
}

fetch('/status').then(function(r){return r.json();}).then(function(d){
  if (d.connected) show('step4');
}).catch(function(){});
</script>
</body>
</html>`;
}

// ── Bot principal ──
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  startWebServer(process.env.PORT || 3000);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['ChapeauNoir', 'Chrome', '1.0.0'],
  });

  // Callback pairage
  pairingCallback = async function(phone) {
    if (!sock.authState.creds.registered) {
      try {
        var code = await sock.requestPairingCode(phone);
        code = code.match(/.{1,4}/g).join('-');
        pairingCode = code;
        console.log('Code pairage: ' + code);
      } catch(e) {
        console.error('Erreur pairage:', e.message);
      }
    }
  };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', function(update) {
    var connection = update.connection;
    var lastDisconnect = update.lastDisconnect;
    if (connection === 'close') {
      var code = lastDisconnect &&
        lastDisconnect.error &&
        lastDisconnect.error.output &&
        lastDisconnect.error.output.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('Reconnexion...');
        setTimeout(startBot, 3000);
      }
    }
    if (connection === 'open') {
      isConnected = true;
      pairingCode = null;
      console.log('ChapeauNoir connecte 🎩');
    }
  });

  sock.ev.on('group-participants.update', async function(event) {
    var groupId = event.id;
    var participants = event.participants;
    var action = event.action;
    for (var i = 0; i < participants.length; i++) {
      if (action === 'add') {
        await welcomeMember(sock, groupId, participants[i]).catch(console.error);
      } else if (action === 'remove' || action === 'leave') {
        await farewellMember(sock, groupId, participants[i]).catch(console.error);
      }
    }
  });

  sock.ev.on('messages.upsert', async function(upsert) {
    if (upsert.type !== 'notify') return;
    var messages = upsert.messages;
    for (var i = 0; i < messages.length; i++) {
      await handleMessage(sock, messages[i]);
    }
  });

  return sock;
}

async function handleMessage(sock, msg) {
  try {
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    var groupId = msg.key.remoteJid;
    if (!groupId) return;
    if (!groupId.endsWith('@g.us')) return;

    var senderId = msg.key.participant || msg.key.remoteJid;
    var senderName = msg.pushName || senderId.split('@')[0];

    var text = '';
    if (msg.message.conversation) {
      text = msg.message.conversation;
    } else if (msg.message.extendedTextMessage) {
      text = msg.message.extendedTextMessage.text || '';
    } else if (msg.message.imageMessage) {
      text = msg.message.imageMessage.caption || '';
    }
    text = text.trim();
    if (!text) return;

    var permBanned = await memberManager.isPermanentlyBanned(senderId);
    if (permBanned) return;

    var groupMetadata = await sock.groupMetadata(groupId).catch(function() {
      return null;
    });

    var isAdminInGroup = false;
    if (groupMetadata && groupMetadata.participants) {
      for (var j = 0; j < groupMetadata.participants.length; j++) {
        var p = groupMetadata.participants[j];
        if (jidNormalizedUser(p.id) === jidNormalizedUser(senderId)) {
          if (p.admin) isAdminInGroup = true;
          break;
        }
      }
    }

    var isAdminDB = await memberManager.isAdmin(senderId);
    var isAdminUser = isAdminInGroup || isAdminDB || senderId === config.adminNumber;

    await memberManager.registerMember(senderId, senderName, isAdminUser);

    if (!isAdminUser) {
      var spamResult = checkSpam(senderId);
      if (spamResult.isSpam) {
        if (spamResult.isBanned) {
          await sock.sendMessage(groupId, {
            text: '⛔ @' + senderId.split('@')[0] + ' Banni temporairement.\n⏱️ Temps: ' + spamResult.remaining + 's',
            mentions: [senderId],
          });
        }
        return;
      }
    }

    var linkBlocked = await checkForLinks(sock, msg, groupId, senderId, isAdminUser);
    if (linkBlocked) return;

    var isCommand = text.startsWith('!');
    var parts = text.toLowerCase().split(' ');
    var command = parts[0];
    var args = parts.slice(1);

    if (isCommand) {
      if (isAdminUser) {
        var handledAdmin = await handleAdminCommand(sock, msg, command, args, senderId, groupId);
        if (handledAdmin) return;
      }
      var handledMember = await handleMemberCommand(sock, msg, command, args, senderId, groupId);
      if (handledMember) return;
    }

    if (!isBotActive()) return;

    await sock.sendPresenceUpdate('composing', groupId);
    await new Promise(function(resolve) { setTimeout(resolve, config.aiDelay); });

    var aiResponse = await askAI(senderId, text, senderName);

    await sock.sendMessage(groupId, {
      text: '🎩 @' + senderId.split('@')[0] + '\n\n' + aiResponse + '\n\n— ChapeauNoir | Mcamara',
      mentions: [senderId],
    });

    await sock.sendPresenceUpdate('paused', groupId);

  } catch (error) {
    console.error('Handler Error:', error.message);
  }
}

module.exports = { startBot };
