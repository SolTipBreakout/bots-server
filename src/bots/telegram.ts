import { Telegraf } from 'telegraf';
import { processCommand } from '../commands/processor';
import * as dotenv from 'dotenv';

dotenv.config();

// Define our own interface for launch options
interface LaunchOptions {
  dropPendingUpdates?: boolean;
  allowedUpdates?: string[];
}

interface BotReturn {
  bot: Telegraf;
  launch: () => Promise<void>;
  stop: (signal?: string) => void;
}

export const setupTelegramBot = (): BotReturn => {
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
  console.log('========== TELEGRAM BOT TOKEN ==========');
  console.log(process.env.TELEGRAM_BOT_TOKEN);
  console.log('========================================');
  // Handle direct messages
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const username = ctx.message.from.username || ctx.message.from.id.toString();
    
    try {
      const response = await processCommand(text, 'telegram', username);
      await ctx.reply(response);
    } catch (error) {
      console.error('Error processing Telegram command:', error);
      await ctx.reply('Sorry, something went wrong processing your request.');
    }
  });

  // Handle group chat mentions
  bot.mention(process.env.TELEGRAM_BOT_USERNAME!, async (ctx) => {
    // Check if message exists
    if (!ctx.message || !('text' in ctx.message)) {
      console.log('Received mention without valid message');
      return;
    }
    
    const text = ctx.message.text;
    const username = ctx.message.from?.username || ctx.message.from?.id.toString() || 'unknown';
    
    try {
      const response = await processCommand(text, 'telegram', username);
      await ctx.reply(response);
    } catch (error) {
      console.error('Error processing Telegram command:', error);
      await ctx.reply('Sorry, something went wrong processing your request.');
    }
  });

  // Start command handler
  bot.command('start', (ctx) => {
    ctx.reply(`Welcome to SolTip! 

I can help you send Solana tokens to other users. Here are some commands you can use:

/send @username 1 SOL - Send SOL to another user
/balance - Check your SOL balance
/tokens - List your token balances
/address - Show your wallet address

To get started, visit ${process.env.APP_URL} to connect your wallet.`);
  });

  // Help command handler
  bot.command('help', (ctx) => {
    ctx.reply(`SolTip Commands:

/send @username 1 SOL - Send SOL to another user
/tip @username 0.5 SOL - Same as send
/balance - Check your SOL balance
/tokens - List your token balances
/address - Show your wallet address

Need more help? Visit ${process.env.APP_URL} for more information.`);
  });

  let isRunning = false;

  return {
    bot,
    launch: async () => {
      console.log('Starting Telegram bot...');
      
      try {
        // Start the bot in the background without awaiting
        bot.launch()
          .then(() => {
            isRunning = true;
            console.log('Telegram bot is running in background');
          })
          .catch((err) => {
            console.error('Error in Telegram bot background process:', err);
          });
        
        // Return immediately, don't wait for launch to complete
        console.log('Telegram bot started');
      } catch (error) {
        console.error('Failed to start Telegram bot:', error);
        throw error;
      }
    },
    stop: (signal?: string) => {
      if (isRunning) {
        bot.stop(signal);
        isRunning = false;
        console.log('Telegram bot stopped');
      }
    }
  };
}; 