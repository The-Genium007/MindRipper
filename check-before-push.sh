#!/bin/bash

# 🔐 Security check before pushing to GitHub
# This script verifies no sensitive files will be pushed

echo "🔍 Security Check Before Push"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track errors
HAS_ERROR=0

# Check 1: Verify .env is not tracked
echo "📋 Checking for sensitive files..."
if git ls-files | grep -q "^\.env$"; then
    echo -e "${RED}❌ DANGER: .env is tracked by Git!${NC}"
    echo "   Run: git rm --cached .env"
    HAS_ERROR=1
else
    echo -e "${GREEN}✅ .env is not tracked${NC}"
fi

# Check 2: Verify .env.example exists
if [ -f ".env.example" ]; then
    echo -e "${GREEN}✅ .env.example exists${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: .env.example not found${NC}"
fi

# Check 3: Check for API keys in tracked files
echo ""
echo "🔑 Checking for exposed API keys..."
if git ls-files | xargs grep -l "secret_" 2>/dev/null | grep -v ".env.example"; then
    echo -e "${RED}❌ Found 'secret_' in tracked files!${NC}"
    HAS_ERROR=1
else
    echo -e "${GREEN}✅ No API keys found in tracked files${NC}"
fi

# Check 4: List what will be committed
echo ""
echo "📦 Files to be committed:"
echo "========================="
git status --short

# Check 5: Size check
echo ""
echo "💾 Repository size check..."
REPO_SIZE=$(du -sh .git 2>/dev/null | cut -f1)
echo "   Current .git size: $REPO_SIZE"

# Final verdict
echo ""
echo "================================"
if [ $HAS_ERROR -eq 1 ]; then
    echo -e "${RED}❌ SECURITY ISSUES FOUND!${NC}"
    echo -e "${RED}   DO NOT PUSH until issues are resolved!${NC}"
    exit 1
else
    echo -e "${GREEN}✅ All security checks passed!${NC}"
    echo -e "${GREEN}   Safe to push to GitHub${NC}"
    echo ""
    echo "Next steps:"
    echo "  git add ."
    echo "  git commit -m \"Your message\""
    echo "  git push origin main"
    exit 0
fi
