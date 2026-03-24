const axios = require("axios");

// Maps common discord codeblock highlights to Piston aliases
const languageMap = {
    js: "javascript",
    javascript: "javascript",
    ts: "typescript",
    typescript: "typescript",
    py: "python",
    python: "python",
    python3: "python",
    cpp: "c++",
    "c++": "c++",
    c: "c",
    csharp: "csharp",
    cs: "csharp",
    "c#": "csharp",
    java: "java",
    rs: "rust",
    rust: "rust",
    go: "go",
    golang: "go",
    rb: "ruby",
    ruby: "ruby",
    php: "php",
    sh: "bash",
    bash: "bash",
    swift: "swift",
    kt: "kotlin",
    kotlin: "kotlin",
    dart: "dart"
};

/**
 * Execute a snippet of code using the Piston API
 * @param {string} lang The language alias (e.g. 'js', 'python')
 * @param {string} code The source code to execute
 */
async function executeCode(lang, code) {
    const mappedLang = languageMap[lang.toLowerCase()] || lang.toLowerCase();

    try {
        const response = await axios.post("http://127.0.0.1:2000/api/v2/execute", {
            language: mappedLang,
            version: "*", // Use latest available
            files: [
                {
                    name: "main",
                    content: code
                }
            ]
        });

        return {
            success: true,
            lang: mappedLang,
            version: response.data.version,
            compile: response.data.compile,
            run: response.data.run
        };
    } catch (error) {
        if (error.response && error.response.data && error.response.data.message) {
            return { success: false, error: error.response.data.message };
        }
        return { success: false, error: error.message };
    }
}

module.exports = { executeCode };
