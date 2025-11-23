const https = require("https");
const { Readable } = require("stream");
const { spawn } = require("child_process");
const { createAudioResource, StreamType, joinVoiceChannel, entersState, createAudioPlayer, NoSubscriberBehavior, VoiceConnectionStatus, AudioPlayerStatus } = require("@discordjs/voice");
const { ChannelType } = require("discord.js");
const { getFfmpegPath } = require("../utils/audioProcessing");

let _player = null;
function getPlayer() {
    if (_player) return _player;
    _player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    _player.on("error", (err) => console.error("[AudioPlayer error]", err?.message || err));
    return _player;
}

function toDiscordResource(readable) {
    return createAudioResource(readable, {
        inputType: StreamType.Raw,
        inlineVolume: true,
    });
}

function buildPcm(readable, inputFormat = 'mp3') {
    const ffmpeg = getFfmpegPath();
    const args = ["-i", "pipe:0", "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1"];
    const ff = spawn(ffmpeg, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    readable.pipe(ff.stdin);
    return ff.stdout;
}

async function elevenLabsResource(text) {
    const apiKey = process.env.ELEVEN_API_KEY;
    const voiceId = process.env.ELEVEN_VOICE_ID;
    if (!apiKey || !voiceId) throw new Error("Missing ELEVEN_API_KEY or ELEVEN_VOICE_ID in .env");

    console.log(`[TTS] Using ElevenLabs for: "${text.slice(0, 50)}..."`);

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: "POST",
        headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        }),
    });

    if (!res.ok) {
        const errorBody = await res.text().catch(() => "Could not read error body");
        throw new Error(`ElevenLabs API Error ${res.status}: ${errorBody}`);
    }

    // res.body is a web stream, convert it to a Node.js Readable stream
    const readable = Readable.fromWeb(res.body);
    const pcm = buildPcm(readable, 'mp3');
    return toDiscordResource(pcm);
}

// Main function that will be called by your bot commands
async function ttsResourceFromText(text, langCode = "auto") {
    try {
        return await elevenLabsResource(text);
    } catch (e) {
        console.error("❌ TTS Service failed:", e.message);
        throw e; // Propagate the error to be handled by the command
    }
}

// The rest of the connection logic remains the same
async function ensureConnection(voiceChannel) {
    if (!voiceChannel) throw new Error("User not in a voice channel.");
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    const me = voiceChannel.guild.members.me;
    try {
        if (me?.voice?.deaf) await me.voice.setDeaf(false);
        if (me?.voice?.mute) await me.voice.setMute(false);
        if (voiceChannel.type === ChannelType.GuildStageVoice && me?.voice?.suppress) {
            await me.voice.setSuppressed(false);
        }
    } catch (e) {
        console.warn("[TTS] Could not undeafen/unmute:", e.message);
    }
    connection.subscribe(getPlayer());
    return connection;
}

async function speakResourceToChannel(voiceChannel, resource) {
    await ensureConnection(voiceChannel);
    const player = getPlayer();
    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, 5_000);
}

async function speakTextToChannel(voiceChannel, text, lang = "auto") {
    const resource = await ttsResourceFromText(text, lang);
    await speakResourceToChannel(voiceChannel, resource);
}

module.exports = { ttsResourceFromText, speakTextToChannel, speakResourceToChannel };