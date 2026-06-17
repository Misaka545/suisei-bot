# Suisei AI Discord Bot 🌠

Suisei is a feature-rich, AI-powered Discord bot built with Discord.js and Google's Gemini API. She acts as a friendly, anime-styled companion who can chat naturally, assist with moderation, execute code snippets live in over a dozen languages, and even summarize missed conversations for you!

## Features

*   **Natural Conversations (Wake Word):** Simply start your message with `Suisei` or `Suisei,` or reply to her to get her attention! She remembers conversation context and has a lively, configurable persona.
*   **Voice Chatbot (VOICEVOX TTS):** When you're in a voice channel and chat with Suisei, she'll automatically speak her responses using VOICEVOX — a high-quality Japanese text-to-speech engine. Choose from 20+ different voices with `/voice`.
*   **Contextual Awareness:** If you reply to another user's message and ask Suisei a question (e.g., "Suisei, what does this mean?"), she will read the original message to understand the context.
*   **Automated TL;DRs:** Missed a long conversation? Type `suisei summarize` or `suisei tldr` to have her read up to the last 100 messages and provide a concise summary of what you missed.
*   **Live Code Execution:** Suisei functions as an interactive development environment! Use `suisei run` or `suisei execute` followed by a markdown code block to instantly compile and run code directly in Discord. 
    *   *Powered by a local, sandboxed Piston Docker engine.*
    *   *Supported languages:* Python, Node.js (JavaScript/TypeScript), C/C++, Java, C#, Rust, Go, Ruby, PHP, Swift, Kotlin, Dart, and Bash.
*   **Moderation Tools:** Server administrators can use `suisei ban @user` and `suisei timeout @user` (1-hour default) to easily moderate chat directly through natural language.
*   **Media/Audio Utilities:** Built-in `yt-dlp` integration for handling media links.
*   **Voice Settings:** Customize Suisei's voice per-server with `/voice set`, preview voices with `/voice preview`, or list all available voices with `/voice list`.

## Getting Started

### Prerequisites

1.  **Node.js** (v18 or newer recommended).
2.  **Docker & Docker Compose** (required for the local Piston code execution engine and VOICEVOX TTS engine).
3.  **Discord Bot Token** from the [Discord Developer Portal](https://discord.com/developers/applications).
    *   *Required Intents:* `Message Content Intent`, `Server Members Intent`, and `Guild Messages`.
4.  **Google Gemini API Key** from Google AI Studio (Recommended model: `gemini-3.5-flash`).
5.  **FFmpeg** installed and available in your system PATH (required for audio processing).

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Misaka545/suisei-bot.git
    cd suisei-bot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or yarn install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root directory and add the following:
    ```env
    TOKEN=your_discord_bot_token_here
    GOOGLE_API_KEY=your_gemini_api_key_here
    GEMINI_MODEL=your_gemini_model_here
    PORT=3000 # Optional, for the express web server

    # VOICEVOX TTS Configuration
    VOICEVOX_URL=http://127.0.0.1:50021
    VOICEVOX_SPEAKER_ID=3  # Default speaker (Zundamon)
    ```

4.  **Start the Piston Code Engine:**
    Suisei requires a local Piston instance to safely execute user code.
    ```bash
    docker-compose -f piston-docker-compose.yml up -d
    ```
    *Note: The engine will take a moment to download and install language runtimes (Python, Node, GCC, etc.) on its first launch.*

5.  **Start the VOICEVOX TTS Engine:**
    Suisei uses VOICEVOX for voice chat in voice channels.
    ```bash
    docker compose -f voicevox-docker-compose.yml up -d
    ```
    *Note: The first launch will download the VOICEVOX engine image (~1-2GB). Once running, verify it at `http://127.0.0.1:50021/docs`.*

6.  **Run the Bot:**
    
    *   **For Windows:** Simply double-click the `suisei-bot.bat` file. This will automatically start the bot in the background using PM2 and save its state.
    *   **For Linux/Mac:**
        ```bash
        npm start
        # Or manage via PM2 (recommended):
        pm2 start src/index.js --name "suisei-bot"
        pm2 save
        ```

## Usage Examples

**Chatting:**
> **User:** Suisei, what's a good recipe for pancakes?
> **Suisei:** *(Responds with a friendly recipe — and speaks it in voice if you're in a voice channel!)*

**Voice Settings:**
> **User:** `/voice list` → Shows all available VOICEVOX speakers
> **User:** `/voice set speaker_id:3` → Changes the server's voice to Zundamon
> **User:** `/voice preview speaker_id:8` → Plays a preview in your voice channel

**Running Code:**
> **User:**
> suisei run
> \`\`\`js
> console.log("Hello World!");
> \`\`\`
> **Suisei:** *(Executes and replies with the terminal output)*

**Catching Up:**
> **User:** suisei tldr
> **Suisei:** *(Analyzes the previous channel messages and provides a bulleted summary)*

**Moderation (Admins only):**
> **Admin:** suisei timeout @Spammer
> **Suisei:** Successfully timed out @Spammer for 1 hour.
