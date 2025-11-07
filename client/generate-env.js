#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Read environment variables
const stripeKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || 'pk_live_51SDsFvB44BNKmyHeohM2bBbH8oN1xbdRtkkCMbP3mcDzOkRu0Mj4yvysAEVK9v0PM6nhmX1yX31TCp5Nhg2UqrVZ00JV1OIe7B';
const apiBaseUrl = process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || 'https://kine-zoe-api.vercel.app';

// Generate the environment config file
const envConfig = `// This file is auto-generated. Do not edit manually.
// Generated at: ${new Date().toISOString()}

export const environment = {
  production: true,
  stripePublishableKey: '${stripeKey}',
  apiBaseUrl: '${apiBaseUrl}'
};
`;

// Write to the shared services directory
const outputPath = path.join(__dirname, 'src', 'app', 'shared', 'services', 'environment.config.ts');
fs.writeFileSync(outputPath, envConfig, 'utf8');

console.log('✅ Environment configuration generated successfully');
console.log(`   Stripe Key: ${stripeKey.substring(0, 20)}...`);
console.log(`   API Base URL: ${apiBaseUrl}`);
