#!/usr/bin/env node
/**
 * Generates project-tracker.md with metadata extracted from existing project files
 * Runs after project setup to create comprehensive project tracking information
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const USERNAME = "tctx";
const CONFIG_FILE = "settings/config.yaml";
const PACKAGE_FILE = "package.json";
const README_FILE = "README.md";
const PROJECT_DESC_FILE = "instructions/project-description.md";
const OUTPUT_FILE = "project-tracker.md";

// Function to safely execute shell commands
function execSafe(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (error) {
    return null;
  }
}

// Function to safely read file content
function readFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (error) {
    console.log(`⚠️  Could not read ${filePath}: ${error.message}`);
  }
  return null;
}

// Function to check if GitHub repo is set up
function getGitHubInfo() {
  const projectName = getProjectName();
  
  // Check if .git exists and has remote origin
  if (fs.existsSync('.git')) {
    const remoteUrl = execSafe('git remote get-url origin');
    if (remoteUrl && remoteUrl.includes('github.com')) {
      // Extract repo name from remote URL
      const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
      if (match) {
        const repoName = match[2];
        return {
          hasRepo: true,
          repoName: repoName,
          url: `https://github.com/${USERNAME}/${repoName}`
        };
      }
    }
  }
  
  // Fallback to expected URL based on project name
  return {
    hasRepo: false,
    repoName: projectName,
    url: `https://github.com/${USERNAME}/${projectName}`
  };
}

// Function to extract project name from config.yaml
function getProjectName() {
  const configContent = readFileIfExists(CONFIG_FILE);
  if (configContent) {
    const match = configContent.match(/^\s*name\s*:\s*(.+)$/m);
    if (match) {
      return match[1].replace(/['"]/g, '').trim();
    }
  }
  return 'template';
}

// Function to extract port from config.yaml
function getProjectPort() {
  const configContent = readFileIfExists(CONFIG_FILE);
  if (configContent) {
    const match = configContent.match(/^\s*port\s*:\s*(\d+)/m);
    if (match) {
      const port = parseInt(match[1]);
      // If port is 0, it means "let OS pick a free port" but may have been assigned
      if (port === 0) {
        return "Auto-assigned (check config.yaml after server start)";
      }
      return port;
    }
  }
  return "TBD (run npm run project:port)";
}

// Function to extract description from project-description.md or README.md
function getProjectDescription() {
  // First try project-description.md
  const projectDescContent = readFileIfExists(PROJECT_DESC_FILE);
  if (projectDescContent) {
    // Remove the prefill template content and extract actual description
    const cleanContent = projectDescContent
      .replace(/\/\/ begin project description prefill \/\/.*?\/\/ end project description prefill \/\//gs, '')
      .replace(/<<<.*?>>>/gs, '')
      .trim();
    
    if (cleanContent && cleanContent.length > 50) {
      // Extract first meaningful paragraph
      const firstParagraph = cleanContent
        .split('\n')
        .filter(line => line.trim() && !line.startsWith('//') && !line.startsWith('<') && !line.startsWith('>'))
        .slice(0, 3)
        .join(' ')
        .substring(0, 200);
      
      if (firstParagraph.length > 20) {
        return firstParagraph + (firstParagraph.length >= 200 ? '...' : '');
      }
    }
  }
  
  // Fallback to README.md
  const readmeContent = readFileIfExists(README_FILE);
  if (readmeContent) {
    const lines = readmeContent.split('\n');
    // Look for first meaningful description line
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#') && !line.startsWith('*') && !line.startsWith('-') && line.length > 30) {
        return line.substring(0, 200) + (line.length > 200 ? '...' : '');
      }
    }
  }
  
  return 'AI-powered project built with modern web technologies';
}

// Function to extract framework information
function getProjectFrameworks() {
  const packageContent = readFileIfExists(PACKAGE_FILE);
  const frameworks = [];
  
  if (packageContent) {
    try {
      const packageJson = JSON.parse(packageContent);
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      // Detect common frameworks
      if (deps.react) frameworks.push('React');
      if (deps.vue) frameworks.push('Vue.js');
      if (deps.angular) frameworks.push('Angular');
      if (deps.express) frameworks.push('Express.js');
      if (deps.fastapi) frameworks.push('FastAPI');
      if (deps.django) frameworks.push('Django');
      if (deps.flask) frameworks.push('Flask');
      if (deps.next) frameworks.push('Next.js');
      if (deps.nuxt) frameworks.push('Nuxt.js');
      if (deps.svelte) frameworks.push('Svelte');
      if (deps.tailwindcss) frameworks.push('Tailwind CSS');
      if (deps.bootstrap) frameworks.push('Bootstrap');
      if (deps.d3) frameworks.push('D3.js');
    } catch (error) {
      console.log('⚠️  Could not parse package.json');
    }
  }
  
  // Check for Python requirements
  if (fs.existsSync('requirements.txt')) {
    const reqContent = readFileIfExists('requirements.txt');
    if (reqContent) {
      if (reqContent.includes('fastapi')) frameworks.push('FastAPI');
      if (reqContent.includes('django')) frameworks.push('Django');
      if (reqContent.includes('flask')) frameworks.push('Flask');
      if (reqContent.includes('sqlalchemy')) frameworks.push('SQLAlchemy');
      if (reqContent.includes('postgresql') || reqContent.includes('psycopg')) frameworks.push('PostgreSQL');
    }
  }
  
  return frameworks.length > 0 ? frameworks : ['Vanilla JavaScript', 'Python'];
}

// Function to generate start instructions
function generateStartInstructions(projectName, port, frameworks) {
  const instructions = [];
  
  // Check for different project types
  if (fs.existsSync('requirements.txt')) {
    instructions.push('python3 -m venv venv');
    instructions.push('source venv/bin/activate');
    instructions.push('pip install -r requirements.txt');
    
    if (fs.existsSync('setup_db.py')) {
      instructions.push('python setup_db.py');
    } else if (fs.existsSync('setup.py')) {
      instructions.push('python setup.py');
    }
    
    if (fs.existsSync('start.py')) {
      instructions.push('python start.py');
    } else if (fs.existsSync('main.py')) {
      instructions.push('python main.py');
    } else if (fs.existsSync('app.py')) {
      instructions.push('python app.py');
    }
  } else if (fs.existsSync('package.json')) {
    instructions.push('npm install');
    
    const packageContent = readFileIfExists(PACKAGE_FILE);
    if (packageContent) {
      try {
        const packageJson = JSON.parse(packageContent);
        if (packageJson.scripts?.start) {
          instructions.push('npm start');
        } else if (packageJson.scripts?.dev) {
          instructions.push('npm run dev');
        } else if (packageJson.scripts?.serve) {
          instructions.push('npm run serve');
        }
      } catch (error) {
        instructions.push('npm start');
      }
    }
  }
  
  return instructions.length > 0 ? instructions : ['npm install', 'npm start'];
}

// Function to detect database setup
function detectDatabase() {
  const packageContent = readFileIfExists(PACKAGE_FILE);
  const reqContent = readFileIfExists('requirements.txt');
  
  if (reqContent) {
    if (reqContent.includes('postgresql') || reqContent.includes('psycopg')) {
      return `PostgreSQL database '${getProjectName().replace(/-/g, '_')}' with user '${getProjectName().replace(/-/g, '_')}' on localhost:5432`;
    }
    if (reqContent.includes('mysql')) {
      return 'MySQL database';
    }
    if (reqContent.includes('sqlite')) {
      return 'SQLite database';
    }
    if (reqContent.includes('mongodb')) {
      return 'MongoDB database';
    }
  }
  
  if (packageContent) {
    try {
      const packageJson = JSON.parse(packageContent);
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (deps.postgresql || deps.pg) {
        return `PostgreSQL database '${getProjectName().replace(/-/g, '_')}' with user '${getProjectName().replace(/-/g, '_')}' on localhost:5432`;
      }
      if (deps.mysql || deps.mysql2) {
        return 'MySQL database';
      }
      if (deps.sqlite3) {
        return 'SQLite database';
      }
      if (deps.mongodb || deps.mongoose) {
        return 'MongoDB database';
      }
    } catch (error) {
      // Ignore parsing errors
    }
  }
  
  return 'Local file storage';
}

// Function to generate project tracker content
function generateProjectTracker() {
  const projectName = getProjectName();
  const port = getProjectPort();
  const description = getProjectDescription();
  const frameworks = getProjectFrameworks();
  const startInstructions = generateStartInstructions(projectName, port, frameworks);
  const database = detectDatabase();
  const gitHubInfo = getGitHubInfo();
  
  const content = `# Project Tracker Metadata

**Description:** ${description}

**GitHub:** ${gitHubInfo.hasRepo ? gitHubInfo.url : `${gitHubInfo.url} (not set up yet - run npm run github:init)`}

**Start Instructions:**
\`\`\`bash
${startInstructions.join('\n')}
\`\`\`

**Port:** ${port}

**Database:** ${database}

**ChatGPT:** https://chat.openai.com/c/[conversation-id-here]

**Project Management:** ${gitHubInfo.url}/projects${gitHubInfo.hasRepo ? '' : ' (available after GitHub setup)'}

**Last Left Off:** Project setup completed. Ready for development with full AI integration via MCP logging system. The project structure follows the docs-first methodology with complete specifications in the instructions/ folder. Next: begin implementing features according to the PRD and checklist.

**Notes:**
- Built with ${frameworks.join(', ')}
- Uses MCP (Model-Context Protocol) for real-time browser logging
- Follows docs-first development methodology
- AI-ready project structure with complete specifications
- Automated setup with GitHub integration
- ${fs.existsSync('requirements.txt') ? 'Python backend' : 'Node.js based'}${fs.existsSync('package.json') && fs.existsSync('requirements.txt') ? ' with Node.js utilities' : ''}
- Modern UI/UX with responsive design
- Single-user application focused on productivity
${gitHubInfo.hasRepo ? '- GitHub repository is set up and connected' : '- GitHub repository not yet created (run npm run github:init)'}

**Project Structure:**
- \`instructions/\` - Complete project specifications and documentation
- \`mcp/\` - Real-time browser logging integration for AI development
- \`utilities/\` - Development and setup scripts
- \`settings/\` - Project configuration files

**Development Workflow:**
1. All specifications are defined in \`instructions/\` folder before coding
2. MCP system provides real-time browser logs to AI assistant
3. Automated GitHub repo creation and management
4. Port auto-assignment for development server
5. Ready for AI-assisted development with full context
`;

  return content;
}

// Main execution
function main() {
  console.log('📝 Generating project-tracker.md...');
  
  try {
    const content = generateProjectTracker();
    fs.writeFileSync(OUTPUT_FILE, content);
    
    console.log(`✅ Created ${OUTPUT_FILE} with project metadata`);
    console.log(`📋 Project: ${getProjectName()}`);
    console.log(`🌐 GitHub: https://github.com/${USERNAME}/${getProjectName()}`);
    console.log(`🚀 Port: ${getProjectPort() || 'TBD'}`);
    console.log('');
    console.log('🎯 Project tracker is ready! You can now:');
    console.log('   1. Update the ChatGPT conversation link');
    console.log('   2. Modify the "Last Left Off" section as you progress');
    console.log('   3. Add additional notes specific to your project');
    
  } catch (error) {
    console.error('🚨 Failed to generate project tracker:', error.message);
    process.exit(1);
  }
}

main(); 