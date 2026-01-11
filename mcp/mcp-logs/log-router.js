const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();

app.use(express.json());

// Load config.json to find log storage location
const config = require(path.join(__dirname, 'config.json'));

// Define log paths dynamically
const logsDirectory = path.join(__dirname, 'logs');
const fullLogPath = path.join(logsDirectory, 'mcp-logs.txt');
const tempLogPath = path.join(logsDirectory, 'mcp-temp-logs.txt');

// Ensure logs directory exists
if (!fs.existsSync(logsDirectory)) {
  fs.mkdirSync(logsDirectory, { recursive: true });
}

// Function to handle log writing
const handleLog = (logEntry, isReset) => {
  fs.appendFileSync(fullLogPath, logEntry, 'utf8');

  if (isReset) {
    fs.writeFileSync(tempLogPath, ''); // ✅ Reset temp log
    fs.appendFileSync(tempLogPath, logEntry, 'utf8');
  } else {
    fs.appendFileSync(tempLogPath, logEntry, 'utf8');
  }
};

// ✅ API to receive logs from MCP server
app.post('/route-log', (req, res) => {
  const { type, message, context } = req.body;

  const logEntry = `[${new Date().toISOString()}] [${type.toUpperCase()}] ${message} ${JSON.stringify(context)}\n`;

  if (type === 'reset_logs') {
    handleLog(logEntry, true); // ✅ Reset temp logs when `RESET_LOGS` is detected
  } else {
    handleLog(logEntry, false);
  }

  res.status(200).json({ status: 'log routed' });
});

// ✅ Use port from config, default to 4001 if not specified
const port = config.router_port || 4001;

// ✅ Start the log-router process inside the user's app without needing manual intervention
app.listen(port, () => {
  console.log(`✅ Log Router running at http://localhost:${port}`);
});
