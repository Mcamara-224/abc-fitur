const fs = require('fs-extra');
const path = require('path');

const membersFile = path.join(__dirname, '../data/members.json');
const bannedFile = path.join(__dirname, '../data/banned.json');

async function loadData(file) {
  try { return await fs.readJson(file); }
  catch { return {}; }
}

async function saveData(file, data) {
  await fs.outputJson(file, data, { spaces: 2 });
}

async function registerMember(userId, name, isAdmin = false) {
  const members = await loadData(membersFile);
  if (!members[userId]) {
    members[userId] = {
      id: userId, name, isAdmin,
      joinedAt: new Date().toISOString(),
      messageCount: 0,
      lastSeen: new Date().toISOString(),
    };
  } else {
    members[userId].name = name;
    members[userId].lastSeen = new Date().toISOString();
    members[userId].messageCount = (members[userId].messageCount || 0) + 1;
    if (isAdmin) members[userId].isAdmin = true;
  }
  await saveData(membersFile, members);
  return members[userId];
}

async function getMember(userId) {
  const members = await loadData(membersFile);
  return members[userId] || null;
}

async function getAllMembers() {
  return await loadData(membersFile);
}

async function banMember(userId, reason = 'Non spécifié') {
  const banned = await loadData(bannedFile);
  const members = await loadData(membersFile);
  banned[userId] = {
    id: userId,
    name: members[userId]?.name || 'Inconnu',
    reason,
    bannedAt: new Date().toISOString(),
  };
  await saveData(bannedFile, banned);
}

async function unbanMember(userId) {
  const banned = await loadData(bannedFile);
  delete banned[userId];
  await saveData(bannedFile, banned);
}

async function isPermanentlyBanned(userId) {
  const banned = await loadData(bannedFile);
  return !!banned[userId];
}

async function setAdmin(userId, status = true) {
  const members = await loadData(membersFile);
  if (members[userId]) {
    members[userId].isAdmin = status;
    await saveData(membersFile, members);
  }
}

async function isAdmin(userId) {
  const members = await loadData(membersFile);
  return members[userId]?.isAdmin === true;
}

module.exports = {
  registerMember, getMember, getAllMembers,
  banMember, unbanMember, isPermanentlyBanned,
  setAdmin, isAdmin,
};
