const axios = require('axios');
const path = require('path');
const fs = require('fs');

const config = require(path.join(__dirname, 'config.json'));

// Get the absolute path to the project root
const projectRoot = path.resolve(__dirname, '..', '..'); // Moves up from `/mcp/front-end-access/`

// Determine the correct log router location dynamically
let logRouterPath;
logRouterPath = path.resolve(
    projectRoot,
    config.log_router_location === "/logs"
      ? "mcp/front-end-access/log-router.js"
      : config.log_router_location
  );  

// Log what is being sent (debugging)
console.log("🔍 Sending MCP Registration with:");
console.log("auth_token:", config.auth_token);
console.log("log_router_location:", logRouterPath);
console.log("dev_urls:", config.dev_urls);
console.log("log_limit_mb:", config.log_limit_mb);
console.log("router_port:", config.router_port || 4001);

async function registerApp() {
  try {
    const response = await axios.post('http://localhost:4000/mcp/register', {
      auth_token: config.auth_token,
      log_router_location: logRouterPath, // ✅ Sends dynamically determined absolute path
      dev_urls: config.dev_urls,
      log_limit_mb: config.log_limit_mb,
      router_port: config.router_port || 4001
    });

    console.log('✅ MCP Registration Success:', response.data);
  } catch (error) {
    console.error('🚨 MCP Registration Failed:', error.response?.data || error.message);
  }
}

registerApp();
