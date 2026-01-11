#!/usr/bin/env node
/**
 * Verifies Python is available and sets up python command if needed
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkCommand(command) {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

function getPythonVersion(command) {
  try {
    const output = execSync(`${command} --version`, { encoding: 'utf8' });
    return output.trim();
  } catch (error) {
    return 'Unknown version';
  }
}

function createPythonSymlink() {
  const projectBinDir = path.join(process.cwd(), 'node_modules', '.bin');
  const pythonSymlink = path.join(projectBinDir, 'python');
  
  try {
    // Create symlink in project's node_modules/.bin (which is in PATH during npm scripts)
    if (!fs.existsSync(pythonSymlink)) {
      fs.symlinkSync('/usr/bin/python3', pythonSymlink);
      console.log('✅ Created local python symlink → python3');
      return true;
    }
    return true;
  } catch (error) {
    console.log('⚠️  Could not create python symlink:', error.message);
    return false;
  }
}

function main() {
  console.log('🐍 Verifying Python availability...');
  
  const hasPython = checkCommand('python');
  const hasPython3 = checkCommand('python3');
  
  if (hasPython) {
    const version = getPythonVersion('python');
    console.log(`✅ Python available: ${version}`);
    console.log('🚀 Ready for Python scripts!');
    return;
  }
  
  if (hasPython3) {
    const version = getPythonVersion('python3');
    console.log(`✅ Python3 available: ${version}`);
    
    // Try to create a local symlink for convenience
    if (createPythonSymlink()) {
      console.log('🔗 Created local "python" command for this project');
    } else {
      console.log('💡 Use "python3" command for Python scripts in this project');
    }
    console.log('🚀 Ready for Python scripts!');
    return;
  }
  
  // Neither python nor python3 found
  console.error('❌ Python not found!');
  console.error('');
  console.error('📦 To install Python:');
  console.error('   macOS:    brew install python');
  console.error('   Linux:    sudo apt-get install python3');
  console.error('   Windows:  Download from https://python.org');
  console.error('');
  console.error('⚠️  Some project features may require Python');
  console.error('💡 You can continue without Python for now');
  
  // Don't exit with error - let setup continue
  // process.exit(1);
}

main(); 