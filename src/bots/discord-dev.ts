import { setupDiscordBot } from './discord';
import * as dotenv from 'dotenv';

dotenv.config();

// This is a development script to test the Discord bot in isolation
const startDiscordBot = async () => {
  console.log('Starting Discord bot in development mode...');
  
  try {
    // First try with full intents
    console.log('Attempting to start with full intents...');
    const discordBot = setupDiscordBot(false);
    
    try {
      await discordBot.login();
      console.log('Discord bot started successfully with full intents!');
      console.log('Listening for commands...');
      
      // Handle shutdown
      const shutdown = () => {
        console.log('Shutting down Discord bot...');
        discordBot.stop();
        process.exit(0);
      };
      
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('disallowed intents')) {
        console.error('\n========== DISCORD BOT INTENT ERROR ==========');
        console.error('Your bot needs privileged intents to be enabled in the Discord Developer Portal:');
        console.error('1. Go to https://discord.com/developers/applications');
        console.error('2. Select your bot application');
        console.error('3. Go to "Bot" in the left sidebar');
        console.error('4. Scroll down to "Privileged Gateway Intents"');
        console.error('5. Enable both "MESSAGE CONTENT INTENT" and "SERVER MEMBERS INTENT"');
        console.error('6. Save changes and restart your bot');
        console.error('==============================================\n');
        
        // Fallback to minimal intents
        console.log('Attempting to start with minimal intents (limited functionality)...');
        const minimalBot = setupDiscordBot(true);
        
        await minimalBot.login();
        console.log('Discord bot started successfully with minimal intents!');
        console.log('NOTE: Message content listening is disabled in this mode.');
        console.log('Listening for slash commands...');
        
        // Handle shutdown for minimal bot
        const shutdownMinimal = () => {
          console.log('Shutting down Discord bot...');
          minimalBot.stop();
          process.exit(0);
        };
        
        process.on('SIGINT', shutdownMinimal);
        process.on('SIGTERM', shutdownMinimal);
      } else {
        console.error('Error starting Discord bot:', error);
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('Fatal error starting Discord bot:', error);
    process.exit(1);
  }
};

startDiscordBot(); 