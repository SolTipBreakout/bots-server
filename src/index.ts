import { setupTelegramBot } from './bots/telegram';
import { setupTwitterBot } from './bots/twitter';
import { setupDiscordBot } from './bots/discord';
import express, { Request, Response, RequestHandler } from 'express';
import * as dotenv from 'dotenv';
import { getUserWallet, getOrCreateUserWallet, linkUserWallet } from './blockchain/solana-service.js';

dotenv.config();

// Define bot interfaces
interface TelegramBot {
  bot: any; // Telegraf instance
  launch(): Promise<void>;
  stop(signal?: string): void;
}

interface TwitterBot {
  start(): Promise<NodeJS.Timeout>;
  stop(interval: NodeJS.Timeout): void;
}

interface DiscordBot {
  client: any; // Discord.js Client
  registerCommands(): Promise<void>;
  login(): Promise<any>;
  stop(): void;
}

const startApp = async () => {
  try {
    // Setup bots
    const telegramBot = setupTelegramBot();
    const twitterBot = setupTwitterBot();
    
    // Try to setup Discord bot with full intents first
    let discordBot = setupDiscordBot(false);
    
    // Start bots in parallel without blocking
    console.log('Starting all bots...');
    
    // Start all bots (now non-blocking)
    telegramBot.launch().catch(err => {
      console.error('Error starting Telegram bot:', err);
    });
    
    const twitterInterval = await twitterBot.start();
    console.log('Twitter bot started');
    
    // Try to login with Discord bot
    try {
      await discordBot.login();
      console.log('Discord bot started with full intents');
    } catch (error) {
      if (error instanceof Error && error.message.includes('disallowed intents')) {
        console.error('Discord bot intent error - falling back to minimal intents');
        console.error('To enable full functionality, go to https://discord.com/developers/applications');
        console.error('Select your bot → Bot settings → Privileged Gateway Intents');
        console.error('Enable "MESSAGE CONTENT INTENT" and "SERVER MEMBERS INTENT"');
        
        // Fallback to minimal intents
        discordBot = setupDiscordBot(true);
        try {
          await discordBot.login();
          console.log('Discord bot started with minimal intents (limited functionality)');
        } catch (secondError) {
          console.error('Failed to start Discord bot even with minimal intents:', secondError);
        }
      } else {
        console.error('Failed to start Discord bot:', error);
      }
    }
    
    // Set up API server
    const app = express();
    app.use(express.json());
    
    // API endpoints for web frontend
    app.get('/api/health', ((req: Request, res: Response) => {
      res.json({ status: 'ok' });
    }) as RequestHandler);
    
    app.get('/api/user/:platform/:username', (async (req: Request, res: Response) => {
      try {
        // Endpoint to get user information
        const { platform, username } = req.params;
        
        // Get wallet for the user
        const walletAddress = await getUserWallet(username, platform);
        
        if (!walletAddress) {
          return res.status(404).json({ 
            platform, 
            username, 
            message: 'No wallet found for this user',
            hasWallet: false
          });
        }
        
        res.json({ 
          platform, 
          username, 
          walletAddress,
          hasWallet: true
        });
      } catch (error) {
        console.error('Error fetching user info:', error);
        res.status(500).json({ error: 'Failed to fetch user information' });
      }
    }) as RequestHandler);
    
    // Connect wallet endpoint
    app.post('/api/connect-wallet', (async (req: Request, res: Response) => {
      try {
        // Endpoint to connect wallet to user account
        const { userId, platform, walletAddress } = req.body;
        
        if (!userId || !walletAddress) {
          return res.status(400).json({ error: 'Missing userId or walletAddress' });
        }
        
        // Check if user already has a wallet
        const existingWallet = await getUserWallet(userId, platform || 'default');
        
        if (existingWallet) {
          return res.status(409).json({ 
            error: 'User already has a connected wallet',
            walletAddress: existingWallet
          });
        }
        
        // Link wallet
        const success = await linkUserWallet(userId, platform || 'default', walletAddress);
        
        if (success) {
          res.status(201).json({ 
            userId, 
            platform: platform || 'default',
            walletAddress, 
            message: 'Successfully connected wallet'
          });
        } else {
          res.status(500).json({ error: 'Failed to connect wallet' });
        }
      } catch (error) {
        console.error('Error connecting wallet:', error);
        res.status(500).json({ error: 'Failed to connect wallet' });
      }
    }) as RequestHandler);
    
    // Create new wallet endpoint
    app.post('/api/create-wallet', (async (req: Request, res: Response) => {
      try {
        // Endpoint to create a new wallet for a user
        const { userId, platform } = req.body;
        
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId' });
        }
        
        // Check if user already has a wallet
        const existingWallet = await getUserWallet(userId, platform || 'default');
        
        if (existingWallet) {
          return res.status(409).json({ 
            error: 'User already has a wallet',
            walletAddress: existingWallet
          });
        }
        
        // Create new wallet
        const walletAddress = await getOrCreateUserWallet(userId, platform || 'default');
        
        res.status(201).json({ 
          userId, 
          platform: platform || 'default',
          walletAddress, 
          message: 'Successfully created new wallet'
        });
      } catch (error) {
        console.error('Error creating wallet:', error);
        res.status(500).json({ error: 'Failed to create wallet' });
      }
    }) as RequestHandler);
    
    // Start API server
    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => {
      console.log(`API server running on port ${PORT}`);
    });
    
    // Handle shutdown
    const shutdown = async () => {
      console.log('Shutting down...');
      telegramBot.stop();
      twitterBot.stop(twitterInterval);
      discordBot.stop();
      server.close(() => {
        console.log('API server closed');
        process.exit(0);
      });
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
};

startApp().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
}); 