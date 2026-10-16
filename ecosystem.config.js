module.exports = {
  apps: [
    {
      name: 'suisei-bot',
      script: 'src/index.js',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'suisei-rpc',
      script: 'src/rpc/botPresence.js',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
