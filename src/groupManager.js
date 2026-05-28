const memberManager = require('./memberManager');
const config = require('./config');

async function welcomeMember(sock, groupId, participant) {
  const name = participant.split('@')[0];
  const msg = `🎩 *Bienvenue ${name} !*\n\n` +
    `Ravi de t'accueillir dans le groupe *Chapeau Noir* !\n\n` +
    `*Tu peux :*\n` +
    `🤖 Parler avec ChapeauNoir sur le hacking éthique\n` +
    `📚 Apprendre la cybersécurité\n` +
    `💬 Partager tes connaissances\n\n` +
    `*Commandes :*\n` +
    `• !aide — Voir les commandes\n` +
    `• !regles — Règles du groupe\n` +
    `• !topics — Sujets disponibles\n\n` +
    `🔗 Partage le groupe : ${config.groupLink || 'Bientôt disponible'}\n\n` +
    `_Pose ta première question sur le hacking éthique !_ 🔐`;

  await sock.sendMessage(groupId, { text: msg });
  await memberManager.registerMember(participant, name, false);
}

async function farewellMember(sock, groupId, participant) {
  const name = participant.split('@')[0];
  await sock.sendMessage(groupId, {
    text: `👋 *${name}* a quitté le groupe.\n_À bientôt !_ 🎩`,
  });
}

async function checkForLinks(sock, msg, groupId, senderId, isAdminUser) {
  if (isAdminUser) return false;
  const text = msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text || '';
  const linkRegex = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+)/gi;
  if (linkRegex.test(text)) {
    await sock.sendMessage(groupId, {
      text: `🚫 @${senderId.split('@')[0]} Les liens ne sont pas autorisés.\n_Seuls les admins peuvent partager des liens._`,
      mentions: [senderId],
    });
    await sock.sendMessage(groupId, { delete: msg.key }).catch(() => {});
    return true;
  }
  return false;
}

module.exports = { welcomeMember, farewellMember, checkForLinks };
