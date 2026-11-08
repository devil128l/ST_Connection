/**
 * Pterodactyl Panel Auto-Installer & Launch Bootstrapper
 * Automatically checks dependencies, builds the frontend if needed,
 * and launches the ST CONNECTION server on the port allocated by Pterodactyl.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Detect Pterodactyl Allocated Port
const port = process.env.SERVER_PORT || process.env.P_SERVER_PORT || process.env.PORT || '3000';
process.env.PORT = port;

console.log('====================================================');
console.log('🚀 ST CONNECTION – Pterodactyl Auto-Bootstrapper');
console.log(`📡 Allocated Port: ${port}`);
console.log(`🟢 Node.js Version: ${process.version}`);
console.log('====================================================');

// 2. Check if node_modules exists; if not, automatically run npm install
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.log('[Pterodactyl Installer] "node_modules" not found. Running automatic npm install...');
  const installer = spawn('npm', ['install', '--no-audit', '--no-fund', '--omit=dev'], {
    stdio: 'inherit',
    shell: true,
  });

  installer.on('close', (code) => {
    if (code === 0) {
      console.log('[Pterodactyl Installer] Dependencies successfully installed!');
      startServerProcess();
    } else {
      console.error('[Pterodactyl Installer] npm install exited with code', code);
      startServerProcess(); // Try launching anyway
    }
  });
} else {
  startServerProcess();
}

function startServerProcess() {
  console.log('[Pterodactyl] Launching server.ts...');
  // Launch server.ts using tsx or node --experimental-strip-types
  const child = spawn('npx', ['tsx', 'server.ts'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: port,
      SERVER_PORT: port,
    },
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}
