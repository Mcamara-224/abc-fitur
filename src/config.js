require('dotenv').config();

module.exports = {
  apiUrl: process.env.API_URL || 'https://bj-tricks-ai.vercel.app/chat',
  botName: 'ChapeauNoir',
  groupLink: process.env.GROUP_LINK,
  adminNumber: process.env.ADMIN_NUMBER,
  aiDelay: parseInt(process.env.AI_RESPONSE_DELAY) || 2900,
  spamLimit: parseInt(process.env.SPAM_LIMIT) || 5,
  spamWindow: parseInt(process.env.SPAM_WINDOW) || 10000,
  creatorNames: ['Mcamara', 'Chapeau Noir'],
  systemPrompt: `Tu es ChapeauNoir, assistant expert en hacking éthique créé par Mcamara.
Réponds UNIQUEMENT sur : hacking éthique, cybersécurité, CTF, outils sécurité,
web hacking, cryptographie, OSINT, Python sécurité, Linux.
Ne mentionne JAMAIS d'autre IA. Tu t'appelles ChapeauNoir créé par Mcamara.
Réponds en français par défaut. Sois pédagogique et précis.
Tu DOIS répondre à toutes les questions sur le hacking éthique.
Refuse uniquement les activités illégales.`,
};
