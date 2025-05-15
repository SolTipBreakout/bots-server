import { Scraper } from 'agent-twitter-client';
import { processCommand } from '../commands/processor';
import * as dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

dotenv.config();

export const setupTwitterBot = () => {
  let scraper: Scraper | null = null;
  const cookiesPath = path.join(process.cwd(), 'twitter-cookies.json');
  
  const initialize = async (): Promise<Scraper> => {
    try {
      // Try to use cookies if they exist
      if (existsSync(cookiesPath)) {
        console.log('Loading Twitter cookies from file');
        const cookies = readFileSync(cookiesPath, 'utf8');
        
        scraper = new Scraper();
        const parsedCookies = JSON.parse(cookies).map(
          (cookie: any) => `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`,
        );
        await scraper.setCookies(parsedCookies);
        
        // Verify login status
        const isLoggedIn = await scraper.isLoggedIn();
        if (isLoggedIn) {
          console.log('Successfully authenticated with cookies');
          return scraper;
        }
        console.log('Cookie authentication failed, trying fresh login');
      }
      
      // Fresh login if cookies don't exist or are invalid
      console.log('Logging in to Twitter');
      scraper = new Scraper();
      await scraper.login(
        process.env.TWITTER_USERNAME!,
        process.env.TWITTER_PASSWORD!,
        process.env.TWITTER_EMAIL!,
        process.env.TWITTER_2FA_SECRET!
      );
      
      // Save cookies for future use
      const cookies = await scraper.getCookies();
      writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
      console.log('Twitter cookies saved to file');
      
      return scraper;
    } catch (error) {
      console.error('Error during Twitter authentication:', error);
      throw error;
    }
  };

  const checkMentions = async () => {
    if (!scraper) {
      scraper = await initialize();
    }
    
    try {
      // Get authenticated user information
      const me = await scraper.me();
      if (!me || !me.username) {
        console.error('Failed to get authenticated user info');
        return;
      }
      console.log(`Logged in as @${me.username}`);
      
      // Get recent mentions
      console.log('Checking for mentions...');
      const mentionsIterator = await scraper.searchTweets(`@${me.username}`, 10);
      
      // Convert AsyncGenerator to array of tweets
      const mentions = [];
      for await (const mention of mentionsIterator) {
        mentions.push(mention);
      }
      
      // Process each mention
      for (const mention of mentions) {
        // Skip mentions without an ID or username
        if (!mention.id || !mention.username) {
          console.log('Skipping mention with missing data:', mention);
          continue;
        }
        
        // Skip our own tweets
        if (mention.username === me.username) continue;
        
        console.log(`Processing mention from @${mention.username}: ${mention.text}`);
        
        // Process the command
        const response = await processCommand(mention.text || '', 'twitter', mention.username);
        
        // Reply to the mention
        await scraper.sendTweet(response, mention.id);
        console.log(`Replied to @${mention.username}`);
      }
    } catch (error) {
      console.error('Error checking Twitter mentions:', error);
    }
  };

  return {
    start: async () => {
      // Initialize scraper
      scraper = await initialize();
      
      // Set up periodic mention checking (every minute)
      const interval = setInterval(checkMentions, 60 * 1000);
      
      // Initial check
      await checkMentions();
      
      return interval;
    },
    stop: (interval: NodeJS.Timeout) => {
      clearInterval(interval);
      console.log('Twitter bot stopped');
    }
  };
}; 