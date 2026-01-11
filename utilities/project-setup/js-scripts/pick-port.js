#!/usr/bin/env node
/**
 * Picks a FREE RANDOM port and writes it into settings/config.yaml
 * Also updates MCP config.json dev_urls to match
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');

// Port range constants
const LOW_PORT = 1024;
const HIGH_PORT = 65535;
const MAX_ATTEMPTS = 100; // Prevent infinite loops

// Function to check if a port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    
    server.on('error', () => resolve(false));
  });
}

// Function to generate a random port in the valid range
function getRandomPort() {
  const range = HIGH_PORT - LOW_PORT + 1;
  const randomBytes = crypto.randomBytes(4);
  const randomValue = randomBytes.readUInt32BE(0);
  return LOW_PORT + (randomValue % range);
}

// Function to find a random free port
async function findRandomFreePort() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const port = getRandomPort();
    
    if (await isPortAvailable(port)) {
      return port;
    }
    
    // Log attempt for debugging (only show every 10 attempts to avoid spam)
    if (attempt > 0 && attempt % 10 === 0) {
      console.log(`🔄 Attempt ${attempt + 1}/${MAX_ATTEMPTS}: Port ${port} in use, trying another...`);
    }
  }
  
  throw new Error(`Failed to find a free port after ${MAX_ATTEMPTS} random attempts`);
}

// Function to update config.yaml with the chosen port
function updateConfigWithPort(port) {
  const configPath = path.join('settings', 'config.yaml');
  
  if (!fs.existsSync(configPath)) {
    console.error(`🚨 Config file not found: ${configPath}`);
    process.exit(1);
  }
  
  let config = fs.readFileSync(configPath, 'utf8');
  
  // Update or add port field
  if (config.includes('port:')) {
    config = config.replace(/port:\s*\d+/, `port: ${port}`);
  } else {
    // Add port after name field
    config = config.replace(/(name:\s*.+)/, `$1\nport: ${port}`);
  }
  
  fs.writeFileSync(configPath, config);
  return configPath;
}

// Function to update MCP config.json dev_urls
function updateMcpConfig(port) {
  const mcpConfigPath = path.join('mcp', 'mcp-logs', 'config.json');
  
  if (!fs.existsSync(mcpConfigPath)) {
    console.log(`ℹ️  ${mcpConfigPath} not found; skipped MCP update`);
    return;
  }
  
  try {
    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
    
    // Update dev_urls with new localhost entry
    const newUrl = `http://localhost:${port}`;
    let urls = mcpConfig.dev_urls || [];
    
    // Remove any existing localhost entries
    urls = urls.filter(url => !url.startsWith('http://localhost:'));
    
    // Add the new URL at the beginning
    urls.unshift(newUrl);
    
    mcpConfig.dev_urls = urls;
    
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    console.log(`📝 MCP dev_urls updated → ${JSON.stringify(mcpConfig.dev_urls)}`);
    
  } catch (error) {
    console.log(`⚠️  Failed to update MCP config: ${error.message}`);
  }
}

// Main execution
async function main() {
  try {
    console.log(`🎲 Finding random available port (range: ${LOW_PORT}-${HIGH_PORT})...`);
    
    const port = await findRandomFreePort();
    const configPath = updateConfigWithPort(port);
    updateMcpConfig(port);
    
    console.log(`✅ Random port ${port} selected and saved to ${configPath}`);
    console.log(`🚀 Your development server can use port ${port}`);
    
  } catch (error) {
    console.error('🚨 Failed to pick random port:', error.message);
    console.log('💡 Falling back to sequential port search...');
    
    // Fallback to sequential search if random fails
    try {
      let port = 3000;
      while (port < 4000) {
        if (await isPortAvailable(port)) {
          const configPath = updateConfigWithPort(port);
          updateMcpConfig(port);
          console.log(`✅ Fallback port ${port} selected and saved to ${configPath}`);
          return;
        }
        port++;
      }
      throw new Error('No ports available in fallback range 3000-4000');
    } catch (fallbackError) {
      console.error('🚨 Fallback also failed:', fallbackError.message);
      process.exit(1);
    }
  }
}

main();

