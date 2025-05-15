
# SolTip: Cross-Platform Solana Tipping Bot

## Architecture Overview

SolTip is a cross-platform Solana tipping application that enables users to send SOL and tokens to others via Twitter, Telegram, and Discord. The system leverages:

- **SolanaAgentKit + MCP**: For Solana blockchain interactions
- **Privy**: For authentication across platforms
- **Platform-specific APIs**: For bot interactions

## System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Twitter Bot    │    │  Telegram Bot   │    │   Discord Bot   │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────┬───────┴──────────────┬──────┘
                        │                      │
               ┌────────▼────────┐    ┌────────▼────────┐
               │   API Gateway   │    │  Authentication │
               │  (Express/NestJS) │    │  (Privy)       │
               └────────┬────────┘    └────────┬────────┘
                        │                      │
                ┌───────▼──────────────────────▼───────┐
                │           SolanaAgentKit             │
                │             MCP Server               │
                └───────────────────┬──────────────────┘
                                    │
                           ┌────────▼────────┐
                           │     Database    │
                           │  (User-Wallet)  │
                           └─────────────────┘
```

## Tech Stack

- **Backend**: TypeScript with NestJS or Express
- **Authentication**: Privy (supporting Discord, Twitter, Telegram login)
- **Blockchain**: SolanaAgentKit with MCP adapters
- **Database**: PostgreSQL with Prisma/TypeORM
- **Bots**:
  - Twitter: Twitter API v2 with Client Twitter
  - Telegram: Telegram Bot API
  - Discord: Discord.js

## Implementation Guide

### 1. SolanaAgentKit MCP Setup

Create a MCP server with SolanaAgentKit:

```typescript
// src/blockchain/solana-agent.ts
import { SolanaAgentKit, KeypairWallet } from "solana-agent-kit";
import { startMcpServer } from '@solana-agent-kit/util-mcp';
import TokenPlugin from '@solana-agent-kit/plugin-token';
import * as dotenv from "dotenv";

dotenv.config();

export const setupSolanaAgent = async () => {
  // Initialize wallet with private key from environment
  const wallet = new KeypairWallet(process.env.SOLANA_PRIVATE_KEY);

  // Create agent with plugin
  const agent = new SolanaAgentKit(
    wallet,
    process.env.RPC_URL,
    {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    }
  ).use(TokenPlugin);

  // Define available actions
  const finalActions = {
    BALANCE_ACTION: agent.actions.find((action) => action.name === "BALANCE_ACTION"),
    TOKEN_BALANCE_ACTION: agent.actions.find((action) => action.name === "TOKEN_BALANCE_ACTION"),
    GET_WALLET_ADDRESS_ACTION: agent.actions.find((action) => action.name === "GET_WALLET_ADDRESS_ACTION"),
    TRANSFER_ACTION: agent.actions.find((action) => action.name === "TRANSFER_ACTION"),
  };

  // Start the MCP server
  return startMcpServer(finalActions, agent, { name: "soltip-agent", version: "0.1.0" });
}
```

### 2. User Authentication with Privy

Set up Privy for multi-platform authentication:

```typescript
// src/auth/privy.ts
import { PrivyClient } from '@privy-io/server-sdk';

// Initialize Privy client
export const privyClient = new PrivyClient({
  appId: process.env.PRIVY_APP_ID,
  appSecret: process.env.PRIVY_APP_SECRET,
});

// Associate user with wallet
export const associateUserWithWallet = async (userId: string, walletAddress: string) => {
  // Store in database
  return await db.userWallets.create({
    data: {
      userId,
      walletAddress,
    }
  });
};

// Get user's wallet address
export const getUserWallet = async (userId: string) => {
  const userWallet = await db.userWallets.findFirst({
    where: { userId }
  });
  return userWallet?.walletAddress;
};
```

### 3. Platform-Specific Bot Implementations

#### Twitter Bot Setup

```typescript
// src/bots/twitter.ts
import { TwitterApi } from 'twitter-api-v2';
import { processCommand } from '../commands/processor';

export const setupTwitterBot = () => {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  // Listen for mentions
  const startStream = async () => {
    const stream = await client.v2.searchStream({
      expansions: ['author_id', 'referenced_tweets.id'],
      'tweet.fields': ['text', 'author_id', 'created_at'],
      'user.fields': ['username'],
    });
    
    stream.on('data', async (tweet) => {
      if (tweet.data.text.includes(`@${process.env.TWITTER_BOT_USERNAME}`)) {
        await handleMention(tweet);
      }
    });
  };

  const handleMention = async (tweet) => {
    // Extract command from tweet text
    const text = tweet.data.text;
    const username = tweet.includes.users.find(u => u.id === tweet.data.author_id).username;
    
    try {
      const response = await processCommand(text, 'twitter', username);
      
      // Reply to the tweet with result
      await client.v2.reply(response, tweet.data.id);
    } catch (error) {
      console.error('Error processing Twitter command:', error);
    }
  };

  return { startStream };
};
```

#### Telegram Bot Setup

```typescript
// src/bots/telegram.ts
import { Telegraf } from 'telegraf';
import { processCommand } from '../commands/processor';

export const setupTelegramBot = () => {
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

  // Handle direct messages
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const username = ctx.message.from.username;
    
    try {
      const response = await processCommand(text, 'telegram', username);
      await ctx.reply(response);
    } catch (error) {
      console.error('Error processing Telegram command:', error);
      await ctx.reply('Sorry, something went wrong processing your request.');
    }
  });

  // Handle group chat mentions
  bot.mention(process.env.TELEGRAM_BOT_USERNAME, async (ctx) => {
    const text = ctx.message.text;
    const username = ctx.message.from.username;
    
    try {
      const response = await processCommand(text, 'telegram', username);
      await ctx.reply(response);
    } catch (error) {
      console.error('Error processing Telegram command:', error);
      await ctx.reply('Sorry, something went wrong processing your request.');
    }
  });

  return bot;
};
```

#### Discord Bot Setup

```typescript
// src/bots/discord.ts
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { processCommand } from '../commands/processor';

export const setupDiscordBot = () => {
  const client = new Client({ 
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ]
  });

  client.on(Events.MessageCreate, async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;
    
    // Check if bot is mentioned
    if (message.mentions.has(client.user.id)) {
      const text = message.content;
      const username = message.author.username;
      
      try {
        const response = await processCommand(text, 'discord', username);
        await message.reply(response);
      } catch (error) {
        console.error('Error processing Discord command:', error);
        await message.reply('Sorry, something went wrong processing your request.');
      }
    }
  });

  // Also implement slash commands
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isCommand()) return;
    
    if (interaction.commandName === 'send') {
      const recipient = interaction.options.getUser('user');
      const amount = interaction.options.getNumber('amount');
      const token = interaction.options.getString('token') || 'SOL';
      
      const command = `send ${recipient.username} ${amount} ${token}`;
      
      try {
        const response = await processCommand(command, 'discord', interaction.user.username);
        await interaction.reply(response);
      } catch (error) {
        console.error('Error processing Discord command:', error);
        await interaction.reply('Sorry, something went wrong processing your request.');
      }
    }
  });

  return client;
};
```

### 4. Command Processing

Create a command processor that handles the different commands:

```typescript
// src/commands/processor.ts
import { getUserWallet } from '../auth/privy';
import { executeTransaction } from '../blockchain/transactions';

export const processCommand = async (text: string, platform: 'twitter' | 'telegram' | 'discord', senderUsername: string) => {
  // Extract command parts
  const words = text.trim().split(/\s+/);
  
  // Remove bot mention if present
  const cleanWords = words.filter(w => 
    !w.includes(`@${process.env.TWITTER_BOT_USERNAME}`) && 
    !w.includes(`@${process.env.TELEGRAM_BOT_USERNAME}`) &&
    !w.includes(`<@${process.env.DISCORD_BOT_ID}>`)
  );
  
  const command = cleanWords[0]?.toLowerCase();
  
  if (command === 'send' || command === 'tip') {
    // Format: send @recipient 1 SOL
    const recipientTag = cleanWords[1];
    const amount = parseFloat(cleanWords[2]);
    const token = cleanWords[3]?.toUpperCase() || 'SOL';
    
    if (!recipientTag || isNaN(amount) || amount <= 0) {
      return `Invalid format. Use: send @recipient amount token`;
    }
    
    // Extract recipient username from the tag
    const recipientUsername = recipientTag.replace('@', '');
    
    // Get wallet addresses
    const senderWallet = await getUserWallet(senderUsername);
    const recipientWallet = await getUserWallet(recipientUsername);
    
    if (!senderWallet) {
      return `You need to connect your wallet first. Visit ${process.env.APP_URL} to get started.`;
    }
    
    if (!recipientWallet) {
      return `The recipient hasn't connected a wallet yet. They need to visit ${process.env.APP_URL} to set up.`;
    }
    
    // Execute transaction
    try {
      const txHash = await executeTransaction(senderWallet, recipientWallet, amount, token);
      return `Successfully sent ${amount} ${token} to @${recipientUsername}! Transaction: ${process.env.EXPLORER_URL}/${txHash}`;
    } catch (error) {
      console.error('Transaction error:', error);
      return `Failed to send ${token}. Error: ${error.message}`;
    }
  }
  
  else if (command === 'balance') {
    // Get user's wallet
    const userWallet = await getUserWallet(senderUsername);
    
    if (!userWallet) {
      return `You need to connect your wallet first. Visit ${process.env.APP_URL} to get started.`;
    }
    
    // Query blockchain for balance
    try {
      const balance = await getWalletBalance(userWallet);
      return `Your SOL balance is ${balance} SOL`;
    } catch (error) {
      console.error('Balance query error:', error);
      return `Failed to get balance. Error: ${error.message}`;
    }
  }
  
  else if (command === 'tokens') {
    // Get user's wallet
    const userWallet = await getUserWallet(senderUsername);
    
    if (!userWallet) {
      return `You need to connect your wallet first. Visit ${process.env.APP_URL} to get started.`;
    }
    
    // Query blockchain for token balances
    try {
      const tokens = await getTokenBalances(userWallet);
      return `Your token balances:\n${tokens.map(t => `${t.symbol}: ${t.amount}`).join('\n')}`;
    } catch (error) {
      console.error('Token balance query error:', error);
      return `Failed to get token balances. Error: ${error.message}`;
    }
  }
  
  else if (command === 'address') {
    // Get user's wallet
    const userWallet = await getUserWallet(senderUsername);
    
    if (!userWallet) {
      return `You need to connect your wallet first. Visit ${process.env.APP_URL} to get started.`;
    }
    
    return `Your wallet address is: ${userWallet}`;
  }
  
  else {
    return `Unknown command. Available commands: send, balance, tokens, address`;
  }
};
```

### 5. Database Schema

Using Prisma for database modeling:

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String   @id @default(uuid())
  username      String   @unique
  platform      String   // twitter, telegram, discord
  platformId    String   // platform-specific user ID
  walletAddress String?  // user's connected wallet address
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Composite unique constraint for platform and platformId
  @@unique([platform, platformId])
}

model Transaction {
  id              String   @id @default(uuid())
  senderUsername  String
  recipientUsername String
  amount          Float
  token           String
  txHash          String
  status          String   // pending, completed, failed
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### 6. Main Application Entry Point

```typescript
// src/index.ts
import { setupSolanaAgent } from './blockchain/solana-agent';
import { setupTwitterBot } from './bots/twitter';
import { setupTelegramBot } from './bots/telegram';
import { setupDiscordBot } from './bots/discord';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const startApp = async () => {
  // Start Solana Agent MCP server
  await setupSolanaAgent();
  console.log('Solana Agent MCP server started');
  
  // Start Twitter bot
  const twitterBot = setupTwitterBot();
  await twitterBot.startStream();
  console.log('Twitter bot started');
  
  // Start Telegram bot
  const telegramBot = setupTelegramBot();
  telegramBot.launch();
  console.log('Telegram bot started');
  
  // Start Discord bot
  const discordBot = setupDiscordBot();
  discordBot.login(process.env.DISCORD_BOT_TOKEN);
  console.log('Discord bot started');
  
  // Set up API server
  const app = express();
  app.use(express.json());
  
  // API endpoints for web frontend
  app.get('/api/user/:platform/:username', async (req, res) => {
    // Endpoint to get user information
  });
  
  app.post('/api/connect-wallet', async (req, res) => {
    // Endpoint to connect wallet to user account
  });
  
  // Start API server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
};

startApp().catch(console.error);
```

## Environment Configuration (.env)

```
# Server
PORT=3000
APP_URL=https://yourdomain.com
EXPLORER_URL=https://explorer.solana.com/tx

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/soltip

# Solana
SOLANA_PRIVATE_KEY=your_key_here
RPC_URL=https://api.mainnet-beta.solana.com

# Privy
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret

# Twitter
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_ACCESS_TOKEN=your_twitter_access_token
TWITTER_ACCESS_SECRET=your_twitter_access_secret
TWITTER_BOT_USERNAME=YourBotUsername

# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_BOT_USERNAME=YourBotUsername

# Discord
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_BOT_ID=your_discord_bot_id

# AI (for SolanaAgentKit)
OPENAI_API_KEY=your_openai_api_key
```

## Deployment Considerations

1. **Hosting**: Deploy on AWS, GCP, or a similar cloud platform
2. **Security**: Store private keys securely using environment variables and secrets management
3. **Monitoring**: Implement logging and monitoring to track bot activity and errors
4. **Scaling**: Consider using a queue system for processing commands during high load
5. **Rate Limiting**: Implement rate limiting to prevent abuse of the service

## Next Steps

1. **Web Interface**: Create a web frontend using Next.js for users to connect wallets
2. **Admin Dashboard**: Develop an admin panel to monitor system activity
3. **Analytics**: Implement usage tracking and analytics
4. **Custom Commands**: Add more advanced commands for specific tokens or NFTs
5. **Error Handling**: Improve error messages and recovery mechanisms
