#!/usr/bin/env node
/**
 * Finds the next available port starting from 4000 for MCP router
 * Checks both local availability AND central server database
 * Updates router_port in mcp/mcp-logs/config.json
 */

const fs = require('fs');
const net = require('net');
const path = require('path');

// MCP router port constants
const START_PORT = 4000;
const MAX_PORT = 4999; // Keep MCP ports in 4000s range
const CENTRAL_SERVER_URL = 'http://localhost:4000'; // Central MCP server

// Function to check if a port is available locally
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    
    server.on('error', () => resolve(false));
  });
}

// Function to get taken ports from central server database
async function getTakenPortsFromServer() {
  try {
    const response = await fetch(`${CENTRAL_SERVER_URL}/mcp/taken-ports`);
    
    if (!response.ok) {
      console.log(`⚠️  Could not fetch taken ports from central server (${response.status})`);
      console.log('🔄 Falling back to local-only port checking...');
      return [];
    }
    
    const data = await response.json();
    return data.taken_ports || [];
    
  } catch (error) {
    console.log(`⚠️  Central server not reachable: ${error.message}`);
    console.log('🔄 Falling back to local-only port checking...');
    return [];
  }
}

// Function to find the next available port (checking both DB and local availability)
async function findNextAvailablePort() {
  console.log('🔍 Checking central server for already claimed ports...');
  const takenPorts = await getTakenPortsFromServer();
  
  if (takenPorts.length > 0) {
    console.log(`📋 Ports already claimed by other projects: ${takenPorts.join(', ')}`);
  }
  
  for (let port = START_PORT; port <= MAX_PORT; port++) {
    // Skip if port is already claimed in database
    if (takenPorts.includes(port)) {
      console.log(`⏭️  Port ${port} already claimed by another project, skipping...`);
      continue;
    }
    
    // Check if port is available locally
    if (await isPortAvailable(port)) {
      return port;
    } else {
      console.log(`⏭️  Port ${port} in use locally, trying next...`);
    }
  }
  
  throw new Error(`No available ports found in range ${START_PORT}-${MAX_PORT}`);
}

// Function to update MCP config.json router_port
function updateMcpRouterPort(port) {
  const mcpConfigPath = path.join('mcp', 'mcp-logs', 'config.json');
  
  if (!fs.existsSync(mcpConfigPath)) {
    console.error(`🚨 MCP config file not found: ${mcpConfigPath}`);
    process.exit(1);
  }
  
  try {
    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
    
    // Update router_port
    mcpConfig.router_port = port;
    
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    console.log(`📝 MCP router_port updated → ${port}`);
    return mcpConfigPath;
    
  } catch (error) {
    console.error(`🚨 Failed to update MCP config: ${error.message}`);
    process.exit(1);
  }
}

// Main execution
async function main() {
  try {
    console.log(`🔍 Finding next available MCP router port (starting from ${START_PORT})...`);
    
    const port = await findNextAvailablePort();
    const configPath = updateMcpRouterPort(port);
    
    console.log(`✅ MCP router port ${port} selected and saved to ${configPath}`);
    console.log(`🔌 MCP log router will run on port ${port}`);
    console.log(`📡 This port will be registered with the central server`);
    
  } catch (error) {
    console.error('🚨 Failed to pick MCP router port:', error.message);
    process.exit(1);
  }
}

main(); 