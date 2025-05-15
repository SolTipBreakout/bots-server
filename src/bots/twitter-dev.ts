import { setupTwitterBot } from './twitter';
import * as dotenv from 'dotenv';

dotenv.config();

// This is a development script to test the Twitter bot in isolation
const startTwitterBot = async () => {
  console.log('Starting Twitter bot in development mode...');
  
  try {
    const twitterBot = setupTwitterBot();
    const interval = await twitterBot.start();
    console.log('Twitter bot started successfully!');
    console.log('Checking for mentions every minute...');
    
    // Handle shutdown
    const shutdown = () => {
      console.log('Shutting down Twitter bot...');
      twitterBot.stop(interval);
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Error starting Twitter bot:', error);
    process.exit(1);
  }
};

startTwitterBot(); 