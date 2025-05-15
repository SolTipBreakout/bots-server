import { setupTelegramBot } from './telegram';
import * as dotenv from 'dotenv';

dotenv.config();

// This is a development script to test the Telegram bot in isolation
const startTelegramBot = async () => {
  console.log('Starting Telegram bot in development mode...');
  
  try {
    const telegramBot = setupTelegramBot();
    await telegramBot.launch();
    console.log('Telegram bot started successfully!');
    console.log('Listening for commands...');
    
    // Handle shutdown
    const shutdown = () => {
      console.log('Shutting down Telegram bot...');
      telegramBot.stop();
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Error starting Telegram bot:', error);
    process.exit(1);
  }
};

startTelegramBot(); 