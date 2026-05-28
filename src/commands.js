const config = require('./config');
const memberManager = require('./memberManager');
const { resetConversation, getHistoryCount } = require('./ai');
const { unbanUser } = require('./antiSpam');

let botActive = true;

function isBotActive() { return botActive; }
function setBotActive(state) { botActive = state; }

async function handleAdminCommand(sock, msg, command, args, senderId, groupId) {
  switch (command) {
    case '!on':
      botActive = true;
      await sock.sendMessage(groupId, { text: '✅ *ChapeauNoir activé !* 🎩' });
      break;

    case '!off':
      botActive = false;
      await sock.sendMessage(groupId, { text: '🔴 *ChapeauNoir désactivé.*' });
      break;

    case '!ban':
      if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
        const target = msg.message.extendedTextMessage.contextInfo.participant;
        const reason = args.join(' ') || 'Violation des règles';
        await memberManager.banMember(target, reason);
        await sock.groupParticipantsUpdate(groupId, [target], 'remove').catch(() => {});
        await sock.sendMessage(groupId, { text: `🚫 *Membre banni*\n📋 Raison: ${reason}` });
      }
      break;

    case '!unban':
      if (args[0]) {
        await memberManager.unbanMember(args[0] + '@s.whatsapp.net');
        unbanUser(args[0] + '@s.whatsapp.net');
        await sock.sendMessage(groupId, { text: `✅ Membre ${args[0]} débanni.` });
      }
      break;

    case '!admin':
      if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
        const target = msg.message.extendedTextMessage.contextInfo.participant;
        await memberManager.setAdmin(target, true);
        await sock.groupParticipantsUpdate(groupId, [target], 'promote').catch(() => {});
        await sock.sendMessage(groupId, { text: `⭐ Nouveau admin promu !` });
      }
      break;

    case '!deadmin':
      if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
        const target = msg.message.extendedTextMessage.contextInfo.participant;
        await memberManager.setAdmin(target, false);
        await sock.groupParticipantsUpdate(groupId, [target], 'demote').catch(() => {});
        await sock.sendMessage(groupId, { text: `🔽 Admin rétrogradé.` });
      }
      break;

    case '!annonce':
      const annonce = args.join(' ');
      if (annonce) {
        await sock.sendMessage(groupId, {
          text: `📢 *ANNONCE OFFICIELLE*\n\n${annonce}\n\n🎩 *— Mcamara | Chapeau Noir*`,
        });
      }
      break;

    case '!setlink':
      if (args[0]) {
        config.groupLink = args[0];
        await sock.sendMessage(groupId, { text: `✅ Lien du groupe mis à jour !` });
      }
      break;

    case '!stats':
      const members = await memberManager.getAllMembers();
      const total = Object.keys(members).length;
      const admins = Object.values(members).filter(m => m.isAdmin).length;
      await sock.sendMessage(groupId, {
        text: `📊 *Statistiques*\n\n👥 Membres: ${total}\n⭐ Admins: ${admins}\n🤖 Bot: ${botActive ? '✅ Actif' : '🔴 Inactif'}\n\n🎩 *ChapeauNoir*`,
      });
      break;

    case '!reset':
      if (args[0]) {
        resetConversation(args[0] + '@s.whatsapp.net');
        await sock.sendMessage(groupId, { text: `🔄 Historique réinitialisé pour ${args[0]}.` });
      } else {
        resetConversation(senderId);
        await sock.sendMessage(groupId, { text: `🔄 Votre historique réinitialisé.` });
      }
      break;

    case '!annoncetous':
      const msg2 = args.join(' ');
      if (msg2) {
        const allMembers = await memberManager.getAllMembers();
        for (const memberId of Object.keys(allMembers)) {
          await sock.sendMessage(memberId, {
            text: `📢 *Message de Mcamara*\n\n${msg2}\n\n🎩 *Chapeau Noir*`,
          }).catch(() => {});
        }
        await sock.sendMessage(groupId, { text: `✅ Message envoyé à tous les membres.` });
      }
      break;

    default:
      return false;
  }
  return true;
}

async function handleMemberCommand(sock, msg, command, args, senderId, groupId) {
  const member = await memberManager.getMember(senderId);
  const memberName = member?.name || msg.pushName || 'Membre';

  switch (command) {
    case '!aide':
    case '!help':
      await sock.sendMessage(groupId, {
        text: `🎩 *ChapeauNoir — Commandes*\n\n` +
          `!aide — Cette aide\n` +
          `!lien — Lien du groupe\n` +
          `!regles — Règles\n` +
          `!apropos — À propos\n` +
          `!profil — Ton profil\n` +
          `!topics — Sujets IA\n` +
          `!reset — Reset historique IA\n\n` +
          `🤖 Pose directement ta question sur le hacking éthique !`,
      });
      break;

    case '!lien':
      await sock.sendMessage(groupId, {
        text: `🔗 *Lien du groupe*\n\n${config.groupLink || 'Non configuré'}\n\n_Partage avec tes amis !_ 🎩`,
      });
      break;

    case '!regles':
      await sock.sendMessage(groupId, {
        text: `📋 *Règles — Chapeau Noir*\n\n` +
          `1️⃣ Respect mutuel\n` +
          `2️⃣ Hacking éthique uniquement\n` +
          `3️⃣ Pas de spam\n` +
          `4️⃣ Pas de contenu illégal\n` +
          `5️⃣ Questions liées à la cybersécurité\n` +
          `6️⃣ Partage tes connaissances\n` +
          `7️⃣ Admins = dernier mot\n\n` +
          `⚠️ Violation = ban immédiat\n🎩 *Mcamara*`,
      });
      break;

    case '!apropos':
      await sock.sendMessage(groupId, {
        text: `🎩 *ChapeauNoir Assistant*\n\n` +
          `Assistant IA spécialisé en hacking éthique.\n\n` +
          `👨‍💻 Créateur: Mcamara — Chapeau Noir\n` +
          `🔒 Spécialité: Cybersécurité & CTF\n` +
          `⚡ Délai: ~2.9 secondes\n\n` +
          `_Pose-moi une question !_`,
      });
      break;

    case '!profil':
      const histCount = getHistoryCount(senderId);
      await sock.sendMessage(groupId, {
        text: `👤 *Ton profil*\n\n` +
          `📛 Nom: ${memberName}\n` +
          `📨 Messages: ${member?.messageCount || 0}\n` +
          `💬 Messages IA: ${histCount}\n` +
          `⭐ Statut: ${member?.isAdmin ? 'Admin' : 'Membre'}\n` +
          `📅 Depuis: ${member?.joinedAt ? new Date(member.joinedAt).toLocaleDateString('fr-FR') : 'Inconnu'}`,
      });
      break;

    case '!topics':
      await sock.sendMessage(groupId, {
        text: `📚 *Sujets disponibles*\n\n` +
          `🔓 Ethical Hacking\n` +
          `🛡️ Cybersécurité défensive\n` +
          `🏴 CTF\n` +
          `🌐 Web Hacking (SQLi, XSS...)\n` +
          `🔑 Cryptographie\n` +
          `📡 Réseau & Protocoles\n` +
          `🐧 Kali Linux\n` +
          `🔧 Metasploit, Burp Suite, Nmap\n` +
          `🐍 Python sécurité\n` +
          `🔍 OSINT\n` +
          `☁️ Cloud Security\n\n` +
          `_Pose ta question directement !_ 🎩`,
      });
      break;

    case '!reset':
      resetConversation(senderId);
      await sock.sendMessage(groupId, {
        text: `🔄 Historique réinitialisé ! Comment puis-je t'aider ? 🎩`,
      });
      break;

    default:
      return false;
  }
  return true;
}

module.exports = { handleAdminCommand, handleMemberCommand, isBotActive, setBotActive };
