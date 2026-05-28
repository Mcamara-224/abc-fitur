const axios = require('axios');
const FormData = require('form-data');
const config = require('./config');

const conversationHistory = new Map();

async function askAI(userId, message, memberName = 'Membre') {
  try {
    if (!conversationHistory.has(userId)) {
      conversationHistory.set(userId, []);
    }

    const history = conversationHistory.get(userId);

    const fullMessage = `${config.systemPrompt}

Membre: ${memberName}
Historique: ${history.slice(-4).map(h => `${h.role}: ${h.content}`).join(' | ')}
Question: ${message}`;

    history.push({ role: 'user', content: message });

    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    const fd = new FormData();
    fd.append('text', fullMessage);

    const response = await axios.post(config.apiUrl, fd, {
      headers: { ...fd.getHeaders() },
      timeout: 15000,
    });

    const aiReply =
      response.data?.result ||
      response.data?.reply ||
      response.data?.message ||
      '⚠️ Réponse indisponible.';

    history.push({ role: 'assistant', content: aiReply });

    return aiReply;

  } catch (error) {
    console.error('[AI Error]', error.message);
    if (error.code === 'ECONNABORTED') return '⏱️ Timeout — réessaie.';
    if (error.response?.status === 429) return '⚠️ Trop de requêtes.';
    return '⚠️ Problème technique — réessaie bientôt. 🎩';
  }
}

function resetConversation(userId) {
  conversationHistory.delete(userId);
}

function getHistoryCount(userId) {
  return conversationHistory.get(userId)?.length || 0;
}

module.exports = { askAI, resetConversation, getHistoryCount };
