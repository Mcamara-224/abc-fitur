const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
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

const store = makeInMemoryStore({
  logger: pino().child({ level: 'silent', stream: 'store' }),
});

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  // Démarrer serveur QR
  startQRServer(process.env.PORT || 3000);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['ChapeauNoir', 'Chrome', '1.0.0'],
  });

  store.bind(sock.ev);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      setQR(qr);
      console.log('\n📱 QR Code disponible sur /qr\n');
    }
    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('[Bot] Reconnexion...');
        setTimeout(startBot, 3000);
      }
    }
    if (connection === 'open') {
      console.log('\n✅ ChapeauNoir connecté ! 🎩\n');
    }
  });

  sock.ev.on('group-participants.update', async ({ id: groupId, participants, action }) => {
    for (const participant of participants) {
      if (action === 'add') {
        await welcomeMember(sock, groupId, participant).catch(console.error);
      } else if (action === 'remove' || action === 'leave') {
        await farewellMember(sock, groupId, participant).catch(console.error);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;

        const groupId = msg.key.remoteJid;
        if (!groupId?.endsWith('@g.us')) continue;

        const senderId = msg.key.participant || msg.key.remoteJid;
        const senderName = msg.pushName || senderId.split('@')[0];

        const text = (
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption || ''
        ).trim();

        if (!text) continue;

        // Vérif ban permanent
        if (await memberManager.isPermanentlyBanned(senderId)) continue;

        // Vérif admin
        const groupMetadata = await sock.groupMetadata(groupId).catch(() => null);
        const isAdminInGroup = groupMetadata?.participants?.find(
          p => jidNormalizedUser(p.id) === jidNormalizedUser(senderId)
        )?.admin;

        const isAdminDB = await memberManager.isAdmin(senderId);
        const isAdminUser = !!isAdminInGroup || isAdminDB || senderId === config.adminNumber;

        await memberManager.registerMember(senderId, senderName, isAdminUser);

        // Anti-spam
        if (!isAdminUser) {
          const spamResult = checkSpam(senderId);
          if (spamResult.isSpam) {
            if (spamResult.isBanned) {
              await sock.sendMessage(groupId, {
                text: `⛔ @${senderId.split('@')[0]} Banni temporairement pour spam.\n⏱️ Temps restant: *${spamResult.remaining}s*`,
                mentions: [senderId],
              });
            }
            continue;
          }
        }

        // Anti-liens
        const linkBlocked = await checkForLinks(sock, msg, groupId, senderId, isAdminUser);
        if (linkBlocked) continue;

        // Commandes
        const isCommand = text.startsWith('!');
        const [command, ...args] = text.toLowerCase().split(' ');

        if (isCommand) {
          if (isAdminUser) {
            const handled = await handleAdminCommand(sock, msg, command, args, senderId, groupId);
            if (handled) continue;
          }
          const handled = await handleMemberCommand(sock, msg, command, args, senderId, groupId);
          if (handled) continue;
        }

        // Réponse IA
        if (!isBotActive()) continue;

        await sock.sendPresenceUpdate('composing', groupId);
        await new Promise(resolve => setTimeout(resolve, config.aiDelay));

        const aiResponse = await askAI(senderId, text, senderName);

        await sock.sendMessage(groupId, {
          text: `🎩 *@${senderId.split('@')[0]}*\n\n${aiResponse}\n\n_— ChapeauNoir | Mcamara_`,
          mentions: [senderId],
        });

        await sock.sendPresenceUpdate('paused', groupId);

      } catch (error) {
        console.error('[Handler Error]', error.message);
      }
    }
  });

  return sock;
}

module.exports = { startBot };
