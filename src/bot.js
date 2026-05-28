src/bot.js                mentions: [senderId],
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
