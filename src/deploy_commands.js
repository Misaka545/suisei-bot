require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

async function collectCommands() {
  const commands = [];

  // NOTE: Với cách define hiện tại, mỗi file "va_*.js" / "music/*.js" đều có .data riêng
  // Nếu bạn muốn gộp vào cùng name (vd: "va") thì chỉ chạy deploy một file tiêu biểu,
  // Còn runtime interactionHandler sẽ gọi đúng module theo subcommand.
  const cmdRoot = path.join(__dirname, "commands");
  const groups = fs.readdirSync(cmdRoot);
  for (const group of groups) {
    const groupDir = path.join(cmdRoot, group);
    const files = fs.readdirSync(groupDir).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      const full = path.join(groupDir, file);
      const c = require(full);
      if (c?.data) commands.push(c.data.toJSON());
    }
  }
  return commands;
}

(async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  const commands = await collectCommands();

  try {
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log("✅ Slash commands registered (guild).");
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log("✅ Slash commands registered (global).");
    }
  } catch (error) {
    console.error("Command registration failed:", error);
  }
})();
