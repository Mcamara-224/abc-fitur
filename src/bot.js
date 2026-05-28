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
const { startQRServer, setQR } = require('./qrServer');

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  startQRServer(process.env.PORT || 3000);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['ChapeauNoir', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', function(update) {
    var connection = update.connection;
    var lastDisconnect = update.lastDisconnect;
    var qr = update.qr;

    if (qr) {
      setQR(qr);
      console.log('QR Code disponible sur /qr');
    }

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
      console.log('ChapeauNoir connecte ! 🎩');
    }
  });

  sock.ev.on('group-participants.update', async function(event) {
    var groupId = event.id;
    var participants = event.participants;
    var action = event.action;

    for (var i = 0; i < participants.length; i++) {
      var participant = participants[i];
      if (action === 'add') {
        await welcomeMember(sock, groupId, participant).catch(console.error);
      } else if (action === 'remove' || action === 'leave') {
        await farewellMember(sock, groupId, participant).catch(console.error);
      }
    }
  });

  sock.ev.on('messages.upsert', async function(upsert) {
    var messages = upsert.messages;
    var type = upsert.type;

    if (type !== 'notify') return;

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];

      try {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;

        var groupId = msg.key.remoteJid;
        if (!groupId) continue;
        if (!groupId.endsWith('@g.us')) continue;

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

        if (!text) continue;

        var permBanned = await memberManager.isPermanentlyBanned(senderId);
        if (permBanned) continue;

        var groupMetadata = await sock.groupMetadata(groupId).catch(function() { return null; });
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
            continue;
          }
        }

        var linkBlocked = await checkForLinks(sock, msg, groupId, senderId, isAdminUser);
        if (linkBlocked) continue;

        var isCommand = text.startsWith('!');
        var parts = text.toLowerCase().split(' ');
        var command = parts[0];
        var args = parts.slice(1);

        if (isCommand) {
          if (isAdminUser) {
            var handledAdmin = await handleAdminCommand(sock, msg, command, args, senderId, groupId);
            if (handledAdmin) continue;
          }
          var handledMember = await handleMemberCommand(sock, msg, command, args, senderId, groupId);
          if (handledMember) continue;
        }

        if (!isBotActive()) continue;

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
  });

  return sock;
}

module.exports = { startBot };
        await sock.sendPresenceUpdate('paused', groupId);

      } catch (error) {
        console.error('[Handler Error]', error.message);
      }
    }
  });

  return sock;
}

module.exports = { startBot };
