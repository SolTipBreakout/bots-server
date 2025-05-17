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
  
  // Normalize text by removing leading slash if present
  const normalizeCommand = (text: string): string => {
    // Remove leading slash if present
    return text.startsWith('/') ? text.substring(1) : text;
  };
  
  // Handle private key messages that need auto-deletion
  const handlePrivateKeyResponse = async (ctx: any, response: string) => {
    if (response.includes('Your private key is:')) {
      // Send the message and store the message ID
      const sentMsg = await ctx.reply(response);
      
      // Schedule message deletion after 60 seconds
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, sentMsg.message_id);
          await ctx.reply("🔒 The private key message has been automatically deleted for security reasons.");
        } catch (error) {
          console.error('Error deleting private key message:', error);
        }
      }, 60000);
      return true;
    }
    return false;
  };
  
  // Handle direct messages
  bot.on('text', async (ctx) => {
    const text = normalizeCommand(ctx.message.text);
    const username = ctx.message.from.username || ctx.message.from.id.toString();
    
    // Only process private key exports in private chats
    if (text.startsWith('export-privatekey') && ctx.chat.type !== 'private') {
      await ctx.reply("⚠️ For security reasons, private key export is only available in private conversations with the bot.");
      return;
    }
    
    try {
      // Process all commands through the central processor
      const response = await processCommand(text, 'telegram', username);
      
      // Check if this is a private key response that needs auto-deletion
      const handled = await handlePrivateKeyResponse(ctx, response);
      if (!handled) {
        await ctx.reply(response);
      }
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
    
    const text = normalizeCommand(ctx.message.text);
    const username = ctx.message.from?.username || ctx.message.from?.id.toString() || 'unknown';
    
    try {
      // For group chats, never process private key exports (additional security)
      if (text.includes('export-privatekey')) {
        await ctx.reply("⚠️ For security reasons, private key export is only available in private conversations with the bot.");
        return;
      }
      
      const response = await processCommand(text, 'telegram', username);
      await ctx.reply(response);
    } catch (error) {
      console.error('Error processing Telegram command:', error);
      await ctx.reply('Sorry, something went wrong processing your request.');
    }
  });

  // Add direct command handlers for all commands
  const commandHandlers = [
    'register', 'balance', 'tokens', 'address', 'send', 'transaction', 
    'profile', 'history', 'network', 'price', 'tokens-info', 'account', 'connect',
    'export-privatekey', 'help', 'start'
  ];
  
  // Register all command handlers
  commandHandlers.forEach(cmd => {
    bot.command(cmd, async (ctx) => {
      try {
        // For private key operations, verify we're in a private chat
        if (cmd === 'export-privatekey' && ctx.chat.type !== 'private') {
          await ctx.reply("⚠️ For security reasons, private key export is only available in private conversations with the bot.");
          return;
        }
        
        // Reconstruct full command text with arguments if any
        let fullCommand = cmd;
        
        // Add any arguments to the command
        if (ctx.message.text.includes(' ')) {
          const args = ctx.message.text.split(' ').slice(1).join(' ');
          fullCommand = `${cmd} ${args}`;
        }
        
        const username = ctx.message.from.username || ctx.message.from.id.toString();
        const response = await processCommand(fullCommand, 'telegram', username);
        
        // Handle auto-delete for private key messages
        const handled = await handlePrivateKeyResponse(ctx, response);
        if (!handled) {
          await ctx.reply(response);
        }
      } catch (error) {
        console.error(`Error processing /${cmd} command:`, error);
        await ctx.reply('Sorry, something went wrong processing your request.');
      }
    });
  });
  
  // Explicit handler for export-privatekey-confirm command
  bot.command('export-privatekey-confirm', async (ctx) => {
    // Only allow in private chats
    if (ctx.chat.type !== 'private') {
      await ctx.reply("⚠️ For security reasons, private key export is only available in private conversations with the bot.");
      return;
    }
    
    const username = ctx.message.from.username || ctx.message.from.id.toString();
    
    try {
      const response = await processCommand('export-privatekey confirm', 'telegram', username);
      
      // Handle auto-delete for private key messages
      const handled = await handlePrivateKeyResponse(ctx, response);
      if (!handled) {
        await ctx.reply(response);
      }
    } catch (error) {
      console.error('Error processing export-privatekey-confirm command:', error);
      await ctx.reply('Sorry, something went wrong processing your request.');
    }
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