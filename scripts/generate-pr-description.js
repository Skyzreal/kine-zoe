#!/usr/bin/env node

/**
 * AI-Powered PR Description Generator
 *
 * This script analyzes git commits and uses OpenAI's API to generate
 * professional, well-formatted pull request descriptions.
 *
 * Usage:
 *   node scripts/generate-pr-description.js [base-branch]
 *   node scripts/generate-pr-description.js main
 *
 * Environment Variables Required:
 *   OPENAI_API_KEY - Your OpenAI API key
 */

const { execSync } = require('child_process');
const https = require('https');

// Configuration
const BASE_BRANCH = process.argv[2] || 'main';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = 'gpt-4o-mini'; // Fast and cost-effective

// Validate API key
if (!OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY environment variable not set');
  console.error('');
  console.error('Set it with:');
  console.error('  export OPENAI_API_KEY="sk-..."  (Linux/Mac)');
  console.error('  set OPENAI_API_KEY=sk-...      (Windows CMD)');
  console.error('  $env:OPENAI_API_KEY="sk-..."   (Windows PowerShell)');
  process.exit(1);
}

/**
 * Executes a git command and returns the output
 */
function git(command) {
  try {
    return execSync(`git ${command}`, { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.error(`❌ Git command failed: git ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Gets the current branch name
 */
function getCurrentBranch() {
  return git('branch --show-current');
}

/**
 * Gets commits between base branch and current branch
 */
function getCommits(baseBranch, currentBranch) {
  const range = `${baseBranch}...${currentBranch}`;

  // Get commit hashes, messages, and authors
  const log = git(`log ${range} --pretty=format:"%H|%s|%an|%ae|%ai"`);

  if (!log) {
    console.error(`❌ No commits found between ${baseBranch} and ${currentBranch}`);
    process.exit(1);
  }

  const commits = log.split('\n').map(line => {
    const [hash, subject, author, email, date] = line.split('|');
    return { hash, subject, author, email, date };
  });

  return commits;
}

/**
 * Gets the diff for all commits
 */
function getDiff(baseBranch, currentBranch) {
  const range = `${baseBranch}...${currentBranch}`;

  // Get stats (files changed, insertions, deletions)
  const stats = git(`diff ${range} --stat`);

  // Get simplified diff (file names and change summary)
  const filesChanged = git(`diff ${range} --name-status`);

  return {
    stats,
    filesChanged
  };
}

/**
 * Calls OpenAI API to generate PR description
 */
function generatePRDescription(commits, diff, currentBranch) {
  return new Promise((resolve, reject) => {
    const prompt = buildPrompt(commits, diff, currentBranch);

    const requestBody = JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a technical writer specialized in creating clear, professional pull request descriptions. You analyze git commits and code changes to produce well-structured PR descriptions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`OpenAI API error: ${res.statusCode} - ${data}`));
          return;
        }

        try {
          const response = JSON.parse(data);
          const description = response.choices[0].message.content.trim();
          resolve(description);
        } catch (error) {
          reject(new Error(`Failed to parse OpenAI response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Builds the prompt for OpenAI
 */
function buildPrompt(commits, diff, currentBranch) {
  const commitList = commits.map(c => `- ${c.subject} (${c.hash.substring(0, 7)})`).join('\n');

  return `Generate a professional pull request description for a branch named "${currentBranch}".

## Commits in this PR:
${commitList}

## Files Changed:
${diff.filesChanged}

## Change Statistics:
${diff.stats}

## Instructions:
Create a PR description with the following structure:

1. **Title**: A concise title (50-70 characters) summarizing the main purpose
2. **Summary**: 2-3 sentences explaining what this PR does and why
3. **Changes**: Bulleted list of key changes organized by category (Backend, Frontend, Configuration, etc.)
4. **Technical Details**: Brief explanation of implementation approach if relevant
5. **Testing**: How these changes can be tested
6. **Notes**: Any important notes, breaking changes, or follow-up work needed

Format the output in **GitHub-flavored Markdown** with proper headings, bullet points, and code formatting where appropriate.

Make it professional, clear, and concise. Focus on the "why" and "what" rather than just listing commits.`;
}

/**
 * Main execution
 */
async function main() {
  console.log('🤖 AI-Powered PR Description Generator\n');

  // Get current branch
  const currentBranch = getCurrentBranch();
  console.log(`📍 Current branch: ${currentBranch}`);
  console.log(`📍 Base branch: ${BASE_BRANCH}`);
  console.log('');

  // Get commits
  console.log('📝 Analyzing commits...');
  const commits = getCommits(BASE_BRANCH, currentBranch);
  console.log(`   Found ${commits.length} commit(s)`);
  console.log('');

  // Get diff
  console.log('🔍 Analyzing changes...');
  const diff = getDiff(BASE_BRANCH, currentBranch);
  console.log('');

  // Generate PR description
  console.log('🧠 Generating PR description with AI...');
  console.log('   (This may take 5-10 seconds)');
  console.log('');

  try {
    const description = await generatePRDescription(commits, diff, currentBranch);

    console.log('✅ PR Description Generated!\n');
    console.log('═'.repeat(80));
    console.log(description);
    console.log('═'.repeat(80));
    console.log('');

    // Save to file
    const fs = require('fs');
    const outputFile = '.github/PR_DESCRIPTION.md';

    // Ensure .github directory exists
    if (!fs.existsSync('.github')) {
      fs.mkdirSync('.github');
    }

    fs.writeFileSync(outputFile, description);
    console.log(`💾 Saved to: ${outputFile}`);
    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Review the generated description');
    console.log('   2. Copy it to your PR or use: gh pr create --body-file .github/PR_DESCRIPTION.md');
    console.log('');

  } catch (error) {
    console.error('❌ Failed to generate PR description:');
    console.error(error.message);
    process.exit(1);
  }
}

// Run the script
main();
