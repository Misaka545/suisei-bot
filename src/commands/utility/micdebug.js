const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { EndBehaviorType } = require("@discordjs/voice");
const { EPHEMERAL_FLAG } = require("../../utils/discordHelpers");
const { pcmToWav48kMono, makeOpusDecoderMono48k } = require("../../utils/audioProcessing");
const { connectIfNeeded } = require("../../utils/musicState");
const { geminiTranscribe } = require("../../services/geminiService");

module.exports = {
  data: new SlashCommandBuilder().setName("micdebug").setDescription("Debug mic: count opus/pcm/wav and try STT"),
  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) return interaction.reply({ content: "❌ Join a voice channel first.", flags: EPHEMERAL_FLAG });
    if (voiceChannel.type === ChannelType.GuildStageVoice && member.voice.suppress)
      return interaction.reply({ content: "🎙️ Bạn đang là Audience trong Stage. Hãy Request to Speak trước.", flags: EPHEMERAL_FLAG });

    await interaction.reply({ content: "🎙️ Debug: nói trong ~3s…", flags: EPHEMERAL_FLAG });

    const st = await connectIfNeeded(interaction, voiceChannel, { selfDeaf: false });
    const receiver = st.connection.receiver;

    const opus = receiver.subscribe(interaction.user.id, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 1200 },
    });

    let opusFrames = 0, opusBytes = 0;
    let pcmBytes = 0, framesSeen = 0;
    const pcmChunks = [];
    const WARMUP_FRAMES = 3; let warmupLeft = WARMUP_FRAMES;

    opus.on("data", (c) => { opusFrames++; opusBytes += c.length; });

    const decoder = makeOpusDecoderMono48k();
    const pcm = opus.pipe(decoder);
    pcm.on("data", (c) => {
      framesSeen++;
      if (warmupLeft > 0) { warmupLeft--; return; }
      pcmBytes += c.length; pcmChunks.push(c);
    });

    const HARD_TIMEOUT_MS = 6000;
    const hard = setTimeout(() => { try { opus.destroy(); } catch{} try { pcm.destroy(); } catch{} }, HARD_TIMEOUT_MS);

    await new Promise((res) => {
      const done = () => res();
      pcm.on("end", done); pcm.on("close", done); pcm.on("error", done);
      opus.on("end", done); opus.on("close", done); opus.on("error", done);
    }).finally(() => clearTimeout(hard));

    const wav = pcmChunks.length ? pcmToWav48kMono(Buffer.concat(pcmChunks)) : Buffer.alloc(0);
    const wavBytes = wav.length;

    const lines = [];
    lines.push(`Opus frames: **${opusFrames}**`);
    lines.push(`Opus bytes: **${opusBytes}**`);
    lines.push(`PCM bytes: **${pcmBytes}**`);
    lines.push(`WAV bytes: **${wavBytes}**`);

    if (opusFrames === 0) lines.push("\n🔴 Không nhận được gói Opus ⇒ Audience/Server Deafen/permission.");
    else if (opusFrames > 0 && pcmBytes === 0) lines.push("\n🟠 Có Opus nhưng PCM=0 ⇒ thiếu `@discordjs/opus` hoặc lỗi decoder.");
    else if (pcmBytes > 0 && wavBytes === 0) lines.push("\n🟠 PCM OK nhưng WAV=0 ⇒ PCM quá ngắn sau warmup.");
    else lines.push("\n🟢 Đường mic OK.");

    let stt = "";
    try { stt = await geminiTranscribe(wav); } catch (e) { stt = `(STT error: ${e.message || e})`; }
    lines.push(`\nSTT: ${stt || "(empty)"}`);

    return interaction.followUp({ content: lines.join("\n"), flags: EPHEMERAL_FLAG });
  },
};
