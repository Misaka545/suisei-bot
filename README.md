# Suisei AI Discord Bot 🌠

Suisei is a feature-rich, AI-powered Discord bot built with Discord.js and Google's Gemini API. She acts as a friendly, anime-styled companion who can chat naturally, assist with moderation, execute code snippets live in over a dozen languages, and even summarize missed conversations for you!

## Features

*   **Natural Conversations (Wake Word):** Simply start your message with `Suisei` or `Suisei,` or reply to her to get her attention! She remembers conversation context and has a lively, configurable persona.
*   **Contextual Awareness:** If you reply to another user's message and ask Suisei a question (e.g., "Suisei, what does this mean?"), she will read the original message to understand the context.
*   **Automated TL;DRs:** Missed a long conversation? Type `suisei summarize` or `suisei tldr` to have her read up to the last 100 messages and provide a concise summary of what you missed.
*   **Live Code Execution:** Suisei functions as an interactive development environment! Use `suisei run` or `suisei execute` followed by a markdown code block to instantly compile and run code directly in Discord. 
    *   *Powered by a local, sandboxed Piston Docker engine.*
    *   *Supported languages:* Python, Node.js (JavaScript/TypeScript), C/C++, Java, C#, Rust, Go, Ruby, PHP, Swift, Kotlin, Dart, and Bash.
*   **Moderation Tools:** Server administrators can use `suisei ban @user` and `suisei timeout @user` (1-hour default) to easily moderate chat directly through natural language.
*   **Media/Audio Utilities:** Built-in `yt-dlp` integration for handling media links.

## Getting Started

### Prerequisites

1.  **Node.js** (v18 or newer recommended).
2.  **Docker & Docker Compose** (required for the local Piston code execution engine).
3.  **Discord Bot Token** from the [Discord Developer Portal](https://discord.com/developers/applications).
    *   *Required Intents:* `Message Content Intent`, `Server Members Intent`, and `Guilde Messages`.
4.  **Google Gemini API Key** from Google AI Studio.

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
    GEMINI_MODEL=your_gemini_model_here-
    PORT=3000 # Optional, for the express web server
    ```

4.  **Start the Piston Code Engine:**
    Suisei requires a local Piston instance to safely execute user code.
    ```bash
    docker-compose -f piston-docker-compose.yml up -d
    ```
    *Note: The engine will take a moment to download and install language runtimes (Python, Node, GCC, etc.) on its first launch.*

5.  **Run the Bot:**
    ```bash
    npm start
    # Recommended: Use PM2 for process management in production
    pm2 start src/index.js --name suisei
    ```

## Usage Examples

**Chatting:**
> **User:** Suisei, what's a good recipe for pancakes?
> **Suisei:** *(Responds with a friendly recipe)*

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
