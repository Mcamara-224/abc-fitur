const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const { askAI } = require('./ai');
const { checkSpam } = require('./antiSpam');
const memberManager = require('./memberManager');
const { handleAdminCommand, handleMemberCommand, isBotActive } = require('./commands');
const { welcomeMember, farewellMember, checkForLinks } = require('./groupManager');
const { startPairingServer, setPairingCode, setConnected } = require('./qrServer');

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  startPairingServer(process.env.PORT || 3000);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['ChapeauNoir', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  // Générer le code pairage
  if (!sock.authState.creds.registered) {
    var phoneNumber = config.adminNumber.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    setTimeout(async function() {
      try {
        var code = await sock.requestPairingCode(phoneNumber);
        code = code.match(/.{1,4}/g).join('-');
        console.log('\n\n🎩 CODE PAIRAGE : ' + code + '\n\n');
        setPairingCode(code);
      } catch (e) {
        console.error('Erreur code pairage:', e.message);
      }
    }, 3000);
  }

  sock.ev.on('connection.update', function(update) {
    var qr = update.qr;
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
      setConnected();
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
            text: 'Banni temporairement pour spam. Temps restant: ' + spamResult.remaining + 's',
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
        var handledAdmin = await handleAdminCommand(
          sock, msg, command, args, senderId, groupId
        );
        if (handledAdmin) return;
      }
      var handledMember = await handleMemberCommand(
        sock, msg, command, args, senderId, groupId
      );
      if (handledMember) return;
    }

    if (!isBotActive()) return;

    await sock.sendPresenceUpdate('composing', groupId);
    await new Promise(function(resolve) {
      setTimeout(resolve, config.aiDelay);
    });

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
