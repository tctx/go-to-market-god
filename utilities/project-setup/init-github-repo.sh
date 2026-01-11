#!/bin/bash

# Auto GitHub Repository Creator for Project Template
# Usage: ./init-github-repo.sh [repo-name]

USERNAME="tctx"  # Your GitHub username
CONFIG_FILE="settings/config.yaml"

# SAFETY CHECK: Ensure we're in a project directory (not home or root)
check_safe_directory() {
  local current_dir=$(pwd)
  local home_dir="$HOME"
  
  echo "🔍 Safety check - Current directory: $current_dir"
  
  # Prevent running in home directory or system directories
  if [[ "$current_dir" == "$home_dir" ]] || [[ "$current_dir" == "/" ]] || [[ "$current_dir" == "/Users" ]]; then
    echo "❌ SAFETY ERROR: Cannot run GitHub init in this directory!"
    echo "📁 Current directory: $current_dir"
    echo "🚨 This would upload your entire computer to GitHub!"
    echo ""
    echo "✅ Solution: Make sure you're in your project directory first"
    exit 1
  fi
  
  # Verify we're in a project directory with expected structure
  if [[ ! -f "package.json" ]] || [[ ! -d "instructions" ]] || [[ ! -f "$CONFIG_FILE" ]]; then
    echo "❌ ERROR: This doesn't appear to be a valid project directory."
    echo "📁 Current directory: $current_dir"
    echo "🔍 Expected files: package.json, instructions/, $CONFIG_FILE"
    
    # Debug: show what's actually in the directory
    echo "📂 Contents of current directory:"
    ls -la . 2>/dev/null || echo "Cannot list directory contents"
    
    echo ""
    echo "✅ Make sure you're in your project directory before running this script."
    exit 1
  fi
  
  echo "✅ Safety check passed - in project directory: $current_dir"
}

# Function to extract project name from config.yaml
get_project_name_from_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    # Extract the name field from YAML (handles both spaces and no spaces around colon)
    grep -E "^\s*name\s*:" "$CONFIG_FILE" | sed -E 's/^\s*name\s*:\s*//' | tr -d '"' | tr -d "'" | xargs
  fi
}

# Run safety check first
check_safe_directory

# Try to get repo name from command line argument first
REPO_NAME=$1

# If no command line argument, try to get from config.yaml
if [ -z "$REPO_NAME" ]; then
  REPO_NAME=$(get_project_name_from_config)
  
  # If config has 'template' or is empty, prompt for name
  if [ -z "$REPO_NAME" ] || [ "$REPO_NAME" = "template" ]; then
    echo "🚀 GitHub Repository Setup"
    echo "👤 Username: $USERNAME"
    echo ""
    read -p "📝 Enter repository name: " REPO_NAME
    
    if [ -z "$REPO_NAME" ]; then
      echo "❌ Repository name cannot be empty."
      echo "Usage: ./init-github-repo.sh my-repo-name"
      exit 1
    fi
  else
    echo "📝 Using project name from config.yaml: $REPO_NAME"
  fi
fi

echo "🚀 Setting up PRIVATE GitHub repo: $REPO_NAME"
echo "👤 GitHub username: $USERNAME"
echo "📁 Project directory: $(pwd)"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Install it from: https://cli.github.com/"
    echo "Or run: brew install gh"
    exit 1
fi

# Check if user is logged in to GitHub CLI
if ! gh auth status &> /dev/null; then
    echo "❌ You're not logged in to GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi

# Check if directory is already a git repo
if [[ -d ".git" ]]; then
    echo "⚠️  Directory is already a Git repository. Skipping git init..."
    
    # Remove existing origin if it exists to prevent conflicts
    if git remote get-url origin &>/dev/null; then
        echo "🔄 Removing existing origin remote..."
        git remote remove origin
    fi
else
    # Step 1: Init Git with master branch
    echo "🔧 Initializing Git repo on 'master' branch..."
    git init -b master
fi

# Step 2: Make first commit with epic message
echo "📦 Adding all files and committing..."
git add .
git commit -m "🔪🔥🔥🔥 <<< F I R S T   B L O O D >>> 🔥🔥🔥

💥 Born from chaos. Forged in the void. It begins... 💥

✨ Features included:
- Docs-first development pipeline  
- MCP real-time logging system
- AI-ready project structure
- Automated setup scripts

🚀 Ready for lightning-fast development!"

# Step 3: Create PRIVATE GitHub repo and push
echo "☁️ Creating PRIVATE GitHub repo '$REPO_NAME'..."
if gh repo create "$REPO_NAME" --private --source=. --remote=origin --push; then
    echo "✅ Successfully created and pushed to GitHub repo!"
    
    # Step 4: Set default branch to master (only if push succeeded)
    echo "🔄 Setting default branch to 'master'..."
    if gh api -X PATCH "/repos/$USERNAME/$REPO_NAME" -f default_branch=master; then
        echo "✅ Default branch set to 'master'"
    else
        echo "⚠️  Could not set default branch, but repo is created successfully"
    fi
else
    echo "❌ Failed to create GitHub repo or push failed"
    echo "🔧 You may need to manually add the remote and push:"
    echo "   git remote add origin https://github.com/$USERNAME/$REPO_NAME.git"
    echo "   git push -u origin master"
fi

# Step 5: Success message with useful links
echo ""
echo "✅ PRIVATE GitHub repo '$REPO_NAME' is ready!"
echo "🌐 Repository URL: https://github.com/$USERNAME/$REPO_NAME"
echo "📝 Clone command: git clone https://github.com/$USERNAME/$REPO_NAME.git"
echo ""
echo "🎯 Next steps:"
echo "   1. Set up your central MCP server (see mcp/mcp-logs/README.md)"
echo "   2. Install the Chrome extension for log capture"
echo "   3. Continue with: npm run project:port"
echo "   4. Start building your amazing project! 🚀" 