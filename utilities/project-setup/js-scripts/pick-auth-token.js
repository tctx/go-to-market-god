#!/usr/bin/env node
/**
 * Generates a secure auth token from central server
 * Updates auth_token in mcp/mcp-logs/config.json
 */

const fs = require('fs');
const path = require('path');

// Central server constants
const CENTRAL_SERVER_URL = 'http://localhost:4000'; // Central MCP server

// Function to generate auth token from central server
async function generateAuthToken() {
  try {
    console.log('🔐 Requesting new auth token from central server...');
    
    const response = await fetch(`${CENTRAL_SERVER_URL}/generate-token`);
    
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.token) {
      throw new Error('No token received from server');
    }
    
    console.log(`✅ Auth token generated: ${data.token.substring(0, 16)}...`);
    return data.token;
    
  } catch (error) {
    console.error(`🚨 Failed to generate auth token: ${error.message}`);
    console.error('💡 Make sure the central MCP server is running on port 4000');
    process.exit(1);
  }
}

// Function to update MCP config.json auth_token
function updateMcpAuthToken(token) {
  const mcpConfigPath = path.join('mcp', 'mcp-logs', 'config.json');
  
  if (!fs.existsSync(mcpConfigPath)) {
    console.error(`🚨 MCP config file not found: ${mcpConfigPath}`);
    process.exit(1);
  }
  
  try {
    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
    
    // Update auth_token
    mcpConfig.auth_token = token;
    
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    console.log(`📝 MCP auth_token updated in config`);
    return mcpConfigPath;
    
  } catch (error) {
    console.error(`🚨 Failed to update MCP config: ${error.message}`);
    process.exit(1);
  }
}

// Main execution
async function main() {
  try {
    console.log('🔑 Setting up project authentication...');
    
    const token = await generateAuthToken();
    const configPath = updateMcpAuthToken(token);
    
    console.log(`✅ Auth token saved to ${configPath}`);
    console.log(`🔐 Project authentication configured`);
    console.log(`📡 Ready for MCP registration with central server`);
    
  } catch (error) {
    console.error('🚨 Failed to setup auth token:', error.message);
    process.exit(1);
  }
}

main(); 