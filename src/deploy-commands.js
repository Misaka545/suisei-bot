// src/deploy-commands.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

if (!process.env.TOKEN || !process.env.CLIENT_ID) {
  console.error("❌ Missing TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

function loadAllCommandJSON(commandsDir) {
  const results = [];

  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(".js")) {
        const mod = require(full);
        if (mod?.data?.toJSON) {
          const json = mod.data.toJSON();
          results.push({ name: json.name, json, file: full });
        } else {
          console.warn(`⚠️ Skipping (invalid): ${full}`);
        }
      }
    }
  }

  walk(commandsDir);
  return results;
}

function dedupeByName(items) {
  const map = new Map();
  const dup = new Map(); // name -> [files...]

  for (const it of items) {
    if (!map.has(it.name)) {
      map.set(it.name, it);
      dup.set(it.name, [it.file]);
    } else {
      // trùng tên -> ghi đè bằng mục mới nhất, ghi log các file trùng
      const existing = map.get(it.name);
      map.set(it.name, it);
      dup.get(it.name).push(it.file);

      console.warn(
        `⚠️ Duplicate command name "${it.name}"\n  kept: ${it.file}\n  was:  ${existing.file}`
      );
    }
  }

  // In ra các tên nào có hơn 1 file
  for (const [name, files] of dup) {
    if (files.length > 1) {
      console.warn(`⚠️ "${name}" defined in ${files.length} files:\n - ${files.join("\n - ")}`);
    }
  }

  return [...map.values()].map((it) => it.json);
}

(async () => {
  try {
    const commandsPath = path.resolve(__dirname, "commands");
    if (!fs.existsSync(commandsPath)) {
      console.error("❌ Cannot find directory src/commands");
      process.exit(1);
    }

    const loaded = loadAllCommandJSON(commandsPath);
    if (!loaded.length) {
      console.warn("⚠️ No commands found to deploy.");
    }

    const body = dedupeByName(loaded);
    console.log(`ℹ️ ${body.length} command(s) will be deployed after deduplication.`);

    // Tuỳ chọn: xóa toàn bộ lệnh hiện tại trước khi ghi mới
    const clearAll = process.env.CLEAR_ALL === "1";
    if (process.env.GUILD_ID) {
      if (clearAll) {
        await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
          { body: [] }
        );
        console.log("🧹 Cleared existing GUILD commands.");
      }
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body }
      );
      console.log(`✅ Deployed ${body.length} command(s) to guild ${process.env.GUILD_ID}.`);
    } else {
      if (clearAll) {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
        console.log("🧹 Cleared existing GLOBAL commands.");
      }
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body });
      console.log(`✅ Deployed ${body.length} global command(s).`);
    }
  } catch (err) {
    console.error("❌ Deploy failed:", err);
    process.exit(1);
  }
})();
