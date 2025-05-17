import { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { processCommand } from '../commands/processor';
import * as dotenv from 'dotenv';

dotenv.config();

export const setupDiscordBot = (useMinimalIntents = false) => {
  // Create a new client instance
  let client;
  
  if (useMinimalIntents) {
    // Minimal configuration that doesn't require privileged intents
    // Note: This will limit functionality - bot won't see message content
    console.log('Setting up Discord bot with minimal intents (limited functionality)');
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    });
  } else {
    // Full configuration with privileged intents
    // Requires enabling in Discord Developer Portal
    console.log('Setting up Discord bot with full intents (including privileged intents)');
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        // NOTE: The following intents are privileged and need to be enabled in Discord Developer Portal
        // under Bot settings → Privileged Gateway Intents
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers,
      ],
    });
  }

  // Register slash commands
  const registerCommands = async () => {
    const commands = [
      new SlashCommandBuilder()
        .setName('send')
        .setDescription('💸 Send SOL to another user')
        .addUserOption(option => 
          option.setName('user')
            .setDescription('The user to send SOL to')
            .setRequired(true))
        .addNumberOption(option => 
          option.setName('amount')
            .setDescription('Amount of SOL to send')
            .setRequired(true))
        .addStringOption(option => 
          option.setName('token')
            .setDescription('Token to send (defaults to SOL)')
            .setRequired(false)),
      new SlashCommandBuilder()
        .setName('balance')
        .setDescription('💰 Check your SOL balance'),
      new SlashCommandBuilder()
        .setName('tokens')
        .setDescription('🪙 List your token balances'),
      new SlashCommandBuilder()
        .setName('address')
        .setDescription('🔑 Show your wallet address'),
    ];

    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!);

    try {
      console.log('Started refreshing application (/) commands.');

      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_BOT_ID!),
        { body: commands },
      );

      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error('Error registering slash commands:', error);
    }
  };

  // Handle slash commands
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const username = interaction.user.username;

    try {
      // First, defer the reply to give us time to process
      await interaction.deferReply();

      // Process different commands
      if (commandName === 'send') {
        const recipient = interaction.options.getUser('user');
        const amount = interaction.options.getNumber('amount');
        const token = interaction.options.getString('token') || 'SOL';
        
        if (!recipient || !amount) {
          await interaction.editReply('Missing recipient or amount.');
          return;
        }

        const command = `send @${recipient.username} ${amount} ${token}`;
        const response = await processCommand(command, 'discord', username);
        await interaction.editReply(response);
      } 
      else if (commandName === 'balance') {
        const response = await processCommand('balance', 'discord', username);
        await interaction.editReply(response);
      } 
      else if (commandName === 'tokens') {
        const response = await processCommand('tokens', 'discord', username);
        await interaction.editReply(response);
      } 
      else if (commandName === 'address') {
        const response = await processCommand('address', 'discord', username);
        await interaction.editReply(response);
      }
    } catch (error) {
      console.error(`Error handling command ${commandName}:`, error);
      await interaction.editReply('An error occurred while processing your command.');
    }
  });

  // Handle direct mentions (non-slash commands)
  // Note: This requires MessageContent intent to work properly
  if (!useMinimalIntents) {
    client.on(Events.MessageCreate, async message => {
      // Ignore messages from bots
      if (message.author.bot) return;
      
      // Check if bot is mentioned
      if (message.mentions.has(client.user?.id || '')) {
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
  }

  // Return the client and functions
  return {
    client,
    registerCommands,
    login: async () => {
      try {
        // Register commands first
        await registerCommands();
        
        // Then login
        await client.login(process.env.DISCORD_BOT_TOKEN);
        console.log('Discord bot logged in');
        
        return client;
      } catch (error) {
        // Check for specific intent error
        if (error instanceof Error && error.message.includes('disallowed intents')) {
          console.error('Discord bot login failed: Privileged intents are not enabled');
          console.error('To fix this error, go to https://discord.com/developers/applications');
          console.error('Select your bot → Bot settings → Privileged Gateway Intents');
          console.error('Enable "MESSAGE CONTENT INTENT" and "SERVER MEMBERS INTENT"');
          console.error('');
          console.error('Alternatively, you can run with minimal intents by passing useMinimalIntents=true');
          console.error('when calling setupDiscordBot()');
        } else {
          console.error('Failed to start Discord bot:', error);
        }
        throw error;
      }
    },
    stop: () => {
      client.destroy();
    }
  };
}; 