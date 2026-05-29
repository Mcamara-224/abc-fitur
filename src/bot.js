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

// ── Numéro WhatsApp fixe ──
var PHONE_NUMBER = '224661817807';

// ── État connexion ──
var pairingCode = null;
var isConnected = false;

// ── Serveur web simple ──
function startWebServer(port) {
  var server = http.createServer(function(req, res) {

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'online', connected: isConnected }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="5">
  <title>ChapeauNoir</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      background:#000;
      font-family:Arial,sans-serif;
      display:flex;
      align-items:center;
      justify-content:center;
      min-height:100vh;
      padding:20px;
    }
    .card{
      background:rgba(255,255,255,0.05);
      border:1px solid rgba(0,255,136,0.3);
      border-radius:20px;
      padding:40px 30px;
      width:100%;
      max-width:400px;
      text-align:center;
    }
    .logo{font-size:60px;margin-bottom:15px}
    h1{color:#00ff88;font-size:24px;margin-bottom:8px}
    .sub{color:#888;font-size:13px;margin-bottom:30px}
    .status-box{
      background:#111;
      border-radius:12px;
      padding:20px;
      margin:20px 0;
    }
    .connected{
      color:#00ff88;
      font-size:20px;
      font-weight:bold;
    }
    .waiting{
      color:#ffaa00;
      font-size:16px;
    }
    .code-box{
      background:#111;
      border:2px solid #ffaa00;
      border-radius:16px;
      padding:25px;
      margin:20px 0;
    }
    .code-label{
      color:#888;
      font-size:12px;
      margin-bottom:12px;
    }
    .code{
      font-size:40px;
      font-weight:bold;
      color:#ffaa00;
      letter-spacing:8px;
    }
    .steps{
      background:rgba(0,255,136,0.05);
      border:1px solid rgba(0,255,136,0.2);
      border-radius:12px;
      padding:15px 20px;
      text-align:left;
      margin:15px 0;
    }
    .steps p{
      color:#aaa;
      font-size:13px;
      margin:5px 0;
      line-height:1.6;
    }
    .steps b{color:#00ff88}
    .footer{color:#333;font-size:12px;margin-top:20px}
    .refresh{color:#555;font-size:11px;margin-top:10px}
  </style>
</head>
<body>
<div class="card">
  <div class="logo">🎩</div>
  <h1>ChapeauNoir</h1>
  <div class="sub">Assistant WhatsApp — by Mcamara</div>

  ${isConnected ? `
    <div class="status-box">
      <div class="connected">✅ Bot Connecté !</div>
      <p style="color:#888;margin-top:10px;font-size:14px">
        ChapeauNoir est actif dans ton groupe 🎩
      </p>
    </div>
  ` : pairingCode ? `
    <div class="code-box">
      <div class="code-label">TON CODE DE PAIRAGE</div>
      <div class="code">${pairingCode}</div>
    </div>
    <div class="steps">
      <p><b>Comment connecter :</b></p>
      <p>1. Ouvre WhatsApp</p>
      <p>2. 3 points ⋮ → Appareils connectés</p>
      <p>3. Connecter un appareil</p>
      <p>4. Entrer le code à la place du QR</p>
      <p>5. Entre le code ci-dessus ✅</p>
    </div>
  ` : `
    <div class="status-box">
      <div class="waiting">⏳ Génération du code...</div>
      <p style="color:#555;font-size:13px;margin-top:10px">
        Patiente quelques secondes
      </p>
    </div>
  `}

  <div class="refresh">🔄 Page auto-rafraîchie toutes les 5s</div>
  <div class="footer">🔐 Connexion sécurisée — Mcamara</div>
</div>
</body>
</html>`);
  });

  server.listen(port, function() {
    console.log('Serveur web port ' + port);
  });
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

  sock.ev.on('creds.update', saveCreds);

  // ── Générer le code pairage automatiquement ──
  if (!sock.authState.creds.registered) {
    setTimeout(async function() {
      try {
        console.log('Generation code pairage pour: ' + PHONE_NUMBER);
        var code = await sock.requestPairingCode(PHONE_NUMBER);
        code = code.match(/.{1,4}/g).join('-');
        pairingCode = code;
        console.log('');
        console.log('=============================');
        console.log('CODE PAIRAGE : ' + code);
        console.log('=============================');
        console.log('');
      } catch(e) {
        console.error('Erreur code pairage:', e.message);
        setTimeout(async function() {
          try {
            var code = await sock.requestPairingCode(PHONE_NUMBER);
            code = code.match(/.{1,4}/g).join('-');
            pairingCode = code;
            console.log('CODE (retry): ' + code);
          } catch(e2) {
            console.error('Retry echoue:', e2.message);
          }
        }, 5000);
      }
    }, 3000);
  }

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
      } else {
        console.log('Deconnecte definitivement.');
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
    var isAdminUser = isAdminInGroup || isAdminDB ||
      senderId === (PHONE_NUMBER + '@s.whatsapp.net');

    await memberManager.registerMember(senderId, senderName, isAdminUser);

    if (!isAdminUser) {
      var spamResult = checkSpam(senderId);
      if (spamResult.isSpam) {
        if (spamResult.isBanned) {
          await sock.sendMessage(groupId, {
            text: '⛔ @' + senderId.split('@')[0] + ' Banni temporairement.\n⏱️ ' + spamResult.remaining + 's',
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
