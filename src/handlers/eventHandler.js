const { ytdlp } = require("../utils/youtubeHelpers");
const { Events } = require("discord.js");
const { ensureChat, aiGenerate } = require("../utils/aiChatState");
const { chunkText } = require("../utils/discordHelpers");

async function registerCoreEvents(client) {
  (async () => {
    try {
      if (ytdlp.exec) await ytdlp.exec("--version");
      else await ytdlp("--version");
      console.log("yt-dlp ready");
    } catch (_) { }
  })();

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const wakeWord = "suisei";
    const lowerContent = message.content.toLowerCase();

    if (lowerContent === wakeWord || lowerContent.startsWith(`${wakeWord} `) || lowerContent.startsWith(`${wakeWord},`)) {
      // Find where the wake word ends to slice the original content (preserving casing)
      const keywordMatchLength = lowerContent.startsWith(wakeWord) ? wakeWord.length : 0;

      // Slice off "suisei" and then any leading punctuation/spaces
      let userInput = message.content.slice(keywordMatchLength);
      userInput = userInput.replace(/^[\s,]+/, "").trim();

      if (!userInput) {
        return message.channel.send("Hi! How can I help you today?");
      }

      // Check for moderation commands (ban / timeout)
      const lowerInput = userInput.toLowerCase();
      if (lowerInput.startsWith("ban ") || lowerInput.startsWith("timeout ")) {
        const isBan = lowerInput.startsWith("ban ");
        const targetUser = message.mentions.users.first();

        if (!targetUser) {
          return message.channel.send(`Please mention a user to ${isBan ? "ban" : "timeout"}.`);
        }

        const targetMember = message.guild.members.cache.get(targetUser.id) || await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
          return message.channel.send("Could not find that user in the server.");
        }

        // Check author permissions (Admin only)
        if (!message.member.permissions.has("Administrator")) {
          return message.channel.send(`You must be an Administrator to use the ${isBan ? "ban" : "timeout"} command.`);
        }

        // Check bot permissions
        const botMember = message.guild.members.cache.get(message.client.user.id) || await message.guild.members.fetch(message.client.user.id);
        if (isBan && !botMember.permissions.has("BanMembers")) {
          return message.channel.send("I do not have permission to ban members!");
        }
        if (!isBan && !botMember.permissions.has("ModerateMembers")) {
          return message.channel.send("I do not have permission to timeout members!");
        }

        try {
          if (isBan) {
            await targetMember.ban({ reason: `Banned via Suisei AI by ${message.author.tag}` });
            return message.channel.send(`Successfully banned ${targetUser.tag}.`);
          } else {
            // Timeout for 1 hour
            await targetMember.timeout(60 * 60 * 1000, `Timed out via Suisei AI by ${message.author.tag}`);
            return message.channel.send(`Successfully timed out ${targetUser.tag} for 1 hour.`);
          }
        } catch (error) {
          console.error("Moderation Error:", error);
          return message.channel.send("I couldn't perform that action! Check if my role is high enough.");
        }
      }

      // Check for 'run' or 'execute'
      if (/^(?:run|execute)(?:\s+|$)/.test(lowerInput)) {
        // Find discord code block: ```lang\ncode\n```, handling \r\n and optional languages
        const codeBlockRegex = /```([a-z0-9+#\-\.]+)?\r?\n([\s\S]*?)```/i;
        const match = lowerInput.match(codeBlockRegex);

        if (match && match.length === 3) {
          const lang = match[1];
          if (!lang) {
            return message.channel.send("Please specify a language next to the backticks! Example:\n\\`\\`\\`js\nconsole.log('hi');\n\\`\\`\\`");
          }

          // We need the original casing for the code itself
          const originalMatch = message.content.match(/```([a-z0-9+#\-\.]+)?\r?\n([\s\S]*?)```/i);
          const code = originalMatch ? originalMatch[2] : match[2];

          await message.channel.sendTyping();
          const { executeCode } = require("../utils/pistonApi");
          const result = await executeCode(lang, code);

          if (!result.success) {
            return message.channel.send(`❌ Failed to execute code: ${result.error || "Unknown error"}`);
          }

          let outputMsg = `**Execution Result (${result.lang} v${result.version})**\n`;

          if (result.compile && result.compile.code !== 0) {
            outputMsg += `**Compile Error:**\n\`\`\`\n${result.compile.output.slice(0, 1000)}\n\`\`\`\n`;
          } else if (result.run) {
            if (result.run.output) {
              outputMsg += `\`\`\`\n${result.run.output.slice(0, 1500)}${result.run.output.length > 1500 ? "...\n(Output Truncated)" : ""}\n\`\`\`\n`;
            } else {
              outputMsg += `*(Program finished successfully with no output)*`;
            }
          }

          return message.channel.send(outputMsg);
        } else {
          return message.channel.send("To run code, please provide a formatted code block! Example:\n\\`\\`\\`js\nconsole.log('hi');\n\\`\\`\\`");
        }
      }

      if (lowerInput === "summarize" || lowerInput === "tldr" || lowerInput.startsWith("summarize ") || lowerInput.startsWith("tldr ")) {
        await message.channel.sendTyping();
        try {
          const messages = await message.channel.messages.fetch({ limit: 100 });
          const msgArray = Array.from(messages.values()).reverse();

          let transcript = msgArray
            .filter(m => !m.content.toLowerCase().startsWith("suisei summarize") && !m.content.toLowerCase().startsWith("suisei tldr"))
            .map(m => `${m.author.username}: ${m.content}`)
            .join("\n");

          if (transcript.length > 25000) transcript = transcript.slice(-25000);

          const aiPrompt = `Here is a transcript of the latest messages in this channel:\n\n${transcript}\n\nBased on these messages, please provide a concise 'TL;DR' summary of the recent conversations and what people are talking about. Include interesting highlights.`;

          const session = ensureChat(message.channel.id);
          const replyText = await aiGenerate(session, aiPrompt);
          return message.channel.send(replyText);
        } catch (err) {
          console.error("Summary error:", err);
          return message.channel.send("Failed to read chat history or generate a summary.");
        }
      }

      await message.channel.sendTyping();

      try {
        let aiInput = userInput;

        // If the user replied to another message, fetch that message and include it as context
        if (message.reference && message.reference.messageId) {
          try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage) {
              const repliedContext = `[Replying to ${repliedMessage.author.username}: "${repliedMessage.content}"]\n\n`;
              aiInput = repliedContext + userInput;
            }
          } catch (fetchErr) {
            console.error("Could not fetch replied message:", fetchErr);
          }
        }

        const session = ensureChat(message.channel.id);
        const replyText = await aiGenerate(session, aiInput);
        
        const chunks = chunkText(replyText);
        for (const chunk of chunks) {
          await message.channel.send(chunk);
        }
      } catch (error) {
        console.error("AI Generation Error:", error);
        await message.channel.send("Sorry, I encountered an error while thinking!");
      }
    }
  });
}

module.exports = { registerCoreEvents };
