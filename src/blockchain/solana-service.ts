/**
 * Solana Service - Middleware connecting bots to the MCP endpoint
 * 
 * This service acts as a middleware layer between the bot commands 
 * and the mcpendpoint API. It handles authentication, error handling, 
 * and translates bot commands into API calls.
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

dotenv.config();

// API configuration
const API_CONFIG = {
  baseUrl: process.env.MCPENDPOINT_URL || 'http://localhost:3000',
  apiKey: process.env.MCPENDPOINT_API_KEY || 'dev-key-1',
  apiKeyHeader: 'x-api-key',
  timeout: 10000, // 10 seconds
};

console.log(`Solana Service: Connecting to MCP endpoint at ${API_CONFIG.baseUrl}`);

/**
 * Validate and normalize platform values to what the MCP endpoint expects
 * 
 * @param platform Platform value to validate
 * @returns Normalized platform value
 */
const validatePlatform = (platform: string): string => {
  const validPlatforms = ['twitter', 'telegram', 'discord'];
  const normalizedPlatform = platform.toLowerCase();
  
  if (validPlatforms.includes(normalizedPlatform)) {
    return normalizedPlatform;
  }
  
  // Default to 'discord' if platform is not recognized
  console.warn(`Platform '${platform}' is not recognized. Defaulting to 'discord'.`);
  return 'discord';
};

// Create connection to Solana network
const connection = new Connection(
  process.env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta'),
  'confirmed'
);

console.log(`Solana Service: Connected to Solana at ${process.env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta')}`);

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_CONFIG.baseUrl,
  timeout: API_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json',
    [API_CONFIG.apiKeyHeader]: API_CONFIG.apiKey
  }
});

// Add logging for API requests
apiClient.interceptors.request.use(request => {
  console.log(`Solana Service: API Request to ${request.url}`);
  return request;
}, error => {
  console.error('Solana Service: API Request Error:', error);
  return Promise.reject(error);
});

// Add logging for API responses
apiClient.interceptors.response.use(response => {
  console.log(`Solana Service: API Response from ${response.config.url}, status: ${response.status}`);
  return response;
}, error => {
  console.error(`Solana Service: API Response Error:`, error.message);
  return Promise.reject(error);
});

/**
 * Token information type
 */
interface TokenInfo {
  mint: string;
  decimals: number;
}

/**
 * Token registry mapping symbols to token info
 * This could be expanded to a proper token registry service
 */
const TOKEN_REGISTRY: Record<string, TokenInfo> = {
  'SOL': {
    mint: 'So11111111111111111111111111111111111111112', // Native SOL wrapped token address
    decimals: 9
  },
  'USDC': {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6
  },
  'USDT': {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6
  },
  'BTC': {
    mint: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', // Sollet BTC
    decimals: 6
  },
  'ETH': {
    mint: '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk', // Sollet ETH
    decimals: 6
  },
  'SRM': {
    mint: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt',
    decimals: 6
  },
  'BONK': {
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    decimals: 5
  }
};

/**
 * Get a list of all supported tokens
 * 
 * @returns Array of supported token symbols
 */
export const getSupportedTokens = (): string[] => {
  return Object.keys(TOKEN_REGISTRY);
};

/**
 * Get token information by symbol
 * 
 * @param tokenSymbol Token symbol (e.g., USDC, USDT)
 * @returns TokenInfo with mint address and decimals
 * @throws Error if token is not found in registry
 */
export const getTokenInfo = async (tokenSymbol: string): Promise<TokenInfo> => {
  try {
    const upperSymbol = tokenSymbol.toUpperCase();
    
    // Check token registry first
    if (TOKEN_REGISTRY[upperSymbol]) {
      return TOKEN_REGISTRY[upperSymbol];
    }
    
    // If token is not in our static registry, we could implement dynamic lookup
    // from an API or on-chain token registry in the future
    
    throw new Error(`Token '${tokenSymbol}' not found in registry`);
  } catch (error) {
    console.error(`Failed to get token info for ${tokenSymbol}:`, error);
    
    // Return a more user-friendly error message
    const supportedTokens = getSupportedTokens().join(', ');
    throw new Error(
      `Token '${tokenSymbol}' is not supported. Available tokens: ${supportedTokens}`
    );
  }
};

/**
 * Get user's wallet address by querying the wallet service API
 * 
 * @param userId User's username or ID
 * @param platform Platform the user is on (discord, twitter, telegram)
 * @returns Wallet address or null if not found
 */
export const getUserWallet = async (userId: string, platform: string = 'discord'): Promise<string | null> => {
  try {
    // Normalize platform
    const normalizedPlatform = validatePlatform(platform);
    
    // Call the API to get the wallet by social account
    const response = await apiClient.get('/api/user/wallet/social', {
      params: {
        platform: normalizedPlatform,
        platformId: userId
      }
    });
    
    // If successful, return the wallet address
    if (response.data && response.data.status === 'success' && response.data.wallet) {
      return response.data.wallet.publicKey;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting user wallet:', error);
    return null;
  }
};

/**
 * Create or retrieve wallet for user by calling the wallet service API
 * 
 * @param userId User's username or ID
 * @param platform Platform the user is on (discord, twitter, telegram)
 * @returns Wallet address
 */
export const getOrCreateUserWallet = async (userId: string, platform: string = 'discord'): Promise<string> => {
  try {
    // Normalize platform
    const normalizedPlatform = validatePlatform(platform);
    
    // Call the get-or-create endpoint
    const response = await apiClient.post('/api/user/wallet/get-or-create', {
      platform: normalizedPlatform,
      platformId: userId,
      label: `${normalizedPlatform}-${userId}`
    });
    
    if (response.data && response.data.status === 'success' && response.data.wallet) {
      return response.data.wallet.publicKey;
    }
    
    throw new Error('Failed to create wallet: Invalid response from API');
  } catch (error) {
    console.error('Error creating user wallet:', error);
    throw error;
  }
};

/**
 * Get SOL balance for a wallet address
 * 
 * @param walletAddress Solana wallet address
 * @returns Wallet balance in SOL
 */
export const getWalletBalance = async (walletAddress: string): Promise<number> => {
  try {
    // Call the MCP tool endpoint to get balance
    const response = await apiClient.post('/api/mcp/tools/getBalance', {
      walletAddress
    });

    // Parse the response text to extract the balance
    const responseText = response.data.data.result.content[0].text;
    const match = responseText.match(/([0-9.]+) SOL/);
    
    if (match && match[1]) {
      return parseFloat(match[1]);
    }
    
    throw new Error('Could not parse balance from response');
  } catch (error: any) {
    console.error('Error getting wallet balance:', error.message);
    throw new Error(`Failed to get balance: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Get token balances for a wallet address
 * 
 * @param walletAddress Solana wallet address
 * @returns Array of token balances with symbol and amount
 */
export const getTokenBalances = async (walletAddress: string): Promise<Array<{symbol: string, amount: number}>> => {
  try {
    // Call the MCP tool endpoint to get token balances
    const response = await apiClient.post('/api/mcp/tools/getTokenBalances', {
      walletAddress
    });

    // The response will have a markdown table of tokens
    // For simplicity, we'll extract the basic data and return it
    const tokens: Array<{symbol: string, amount: number}> = [];
    
    // Parse the table (simple parsing, could be improved)
    const content = response.data.data.result.content;
    if (content.length >= 2) {
      const tableText = content[1].text;
      const lines = tableText.split('\n');
      
      // Skip the header and separator rows (first two lines)
      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const parts = line.split('|').map((p: string) => p.trim()).filter((p: string) => p);
          if (parts.length >= 2) {
            tokens.push({
              symbol: parts[0],
              amount: parseFloat(parts[1])
            });
          }
        }
      }
    }
    
    return tokens;
  } catch (error: any) {
    console.error('Error getting token balances:', error.message);
    throw new Error(`Failed to get token balances: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Execute a transaction to send tokens to a tagged user
 * 
 * @param senderUsername Username of the sender
 * @param recipientUsername Username of the recipient (the tagged user)
 * @param amount Amount to send
 * @param token Token symbol (default: SOL)
 * @param platform Platform the transaction is coming from (default: 'discord')
 * @returns Object with transaction signature and a flag indicating if a new wallet was created
 */
export const executeTransaction = async (
  senderUsername: string,
  recipientUsername: string,
  amount: number,
  token: string = 'SOL',
  platform: string = 'discord'
): Promise<{ signature: string; walletCreated: boolean }> => {
  try {
    // Validate input parameters
    if (!senderUsername) {
      throw new Error('Sender username is required');
    }
    if (!recipientUsername) {
      throw new Error('Recipient username is required');
    }
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('Amount must be a positive number');
    }
    
    // Normalize platform to a value the MCP endpoint expects
    const normalizedPlatform = validatePlatform(platform);

    // First, check if sender has a wallet
    const senderWallet = await getUserWallet(senderUsername, normalizedPlatform);
    if (!senderWallet) {
      throw new Error(`No wallet found for sender ${senderUsername}. Please register or connect a wallet first.`);
    }

    // For SOL transfers, check if sender has enough balance
    if (token.toUpperCase() === 'SOL') {
      try {
        // Check if sender has enough SOL
        const senderBalance = await getWalletBalance(senderWallet);
        
        // Add a buffer for transaction fees (0.000005 SOL)
        const requiredAmount = amount + 0.000005;
        
        if (senderBalance < requiredAmount) {
          throw new Error(`Insufficient funds. You have ${senderBalance.toFixed(6)} SOL but need at least ${requiredAmount.toFixed(6)} SOL (including fees).`);
        }
        
        // Prepare parameters for SOL transfer
        const params = {
          senderPlatform: normalizedPlatform,
          senderPlatformId: senderUsername,
          recipientPlatform: normalizedPlatform,
          recipientPlatformId: recipientUsername,
          amount
        };
        
        // Log parameters for debugging
        console.log('Executing SOL transaction with params:', params);
        
        // Use sendSolToUser for SOL transfers
        const response = await apiClient.post('/api/mcp/tools/sendSolToUser', params);
        
        // Check for successful response
        if (!response.data || !response.data.data || !response.data.data.result || !response.data.data.result.content) {
          console.error('Invalid response format from sendSolToUser:', response.data);
          throw new Error('Invalid response format from server');
        }
        
        // Parse the response to determine if a wallet was created
        const responseText = response.data.data.result.content[0].text;
        const walletCreated = responseText.includes('A new wallet was created');
        
        // Extract the transaction signature
        const match = responseText.match(/signature: ([a-zA-Z0-9]+)/);
        
        let signature = "SUCCESS";
        if (match && match[1]) {
          signature = match[1];
        }
        
        console.log(`SOL transfer completed: ${signature}, wallet created: ${walletCreated}`);
        
        return { 
          signature, 
          walletCreated 
        };
      } catch (error: any) {
        // Handle specific Solana errors
        if (error.message && error.message.includes('Attempt to debit an account but found no record of a prior credit')) {
          throw new Error('Insufficient funds in sender wallet');
        }
        throw error; // Re-throw other errors
      }
    } else {
      // For token transfers
      try {
        const tokenInfo = await getTokenInfo(token);
        
        // For token transfers, ideally check token balance too
        // This would require implementing getTokenBalance for a specific token
        // For now, we'll proceed with the transfer and let the API return an error if needed
        
        // Prepare parameters for token transfer
        const params = {
          senderPlatform: normalizedPlatform,
          senderPlatformId: senderUsername,
          recipientPlatform: normalizedPlatform,
          recipientPlatformId: recipientUsername,
          tokenMint: tokenInfo.mint,
          amount,
          decimals: tokenInfo.decimals
        };
        
        // Log parameters for debugging
        console.log('Executing token transaction with params:', params);
        
        // Use sendTokenToUser for other token transfers
        const response = await apiClient.post('/api/mcp/tools/sendTokenToUser', params);
        
        // Check for successful response
        if (!response.data || !response.data.data || !response.data.data.result || !response.data.data.result.content) {
          console.error('Invalid response format from sendTokenToUser:', response.data);
          throw new Error('Invalid response format from server');
        }
        
        // Parse the response to determine if a wallet was created
        const responseText = response.data.data.result.content[0].text;
        const walletCreated = responseText.includes('A new wallet was created');
        
        // Extract the transaction signature
        const match = responseText.match(/signature: ([a-zA-Z0-9]+)/);
        
        let signature = "SUCCESS";
        if (match && match[1]) {
          signature = match[1];
        }
        
        console.log(`Token transfer completed: ${signature}, wallet created: ${walletCreated}`);
        
        return { 
          signature, 
          walletCreated 
        };
      } catch (error) {
        console.error('Error with token information:', error);
        throw new Error(`Unknown token: ${token}. Please use a supported token symbol.`);
      }
    }
  } catch (error: any) {
    console.error('Error executing transaction:', error.message);
    
    // Include more detailed error info for easier debugging
    if (error.response) {
      console.error('Server response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      
      // Extract the specific error message from the server response if available
      if (error.response.data && error.response.data.message) {
        const serverMessage = error.response.data.message;
        
        // Check for common Solana errors and provide user-friendly messages
        if (serverMessage.includes('Attempt to debit an account but found no record of a prior credit')) {
          throw new Error('Insufficient SOL in wallet to complete the transaction');
        }
        
        if (serverMessage.includes('Transaction simulation failed')) {
          if (serverMessage.includes('would exceed maximum allowed stake delegation')) {
            throw new Error('Transaction would exceed maximum allowed stake delegation');
          }
          // Extract just the main error from the verbose Solana message
          const errorMatch = serverMessage.match(/Transaction simulation failed: (.+?)\./);
          if (errorMatch && errorMatch[1]) {
            throw new Error(`Transaction failed: ${errorMatch[1]}`);
          }
        }
        
        // If specific error pattern not matched, use the server's message
        throw new Error(`Transaction failed: ${serverMessage}`);
      }
      
      // Check if there's a specific error in the response data
      if (error.response.data && error.response.data.error) {
        throw new Error(`Transaction failed: ${error.response.data.error}`);
      }
    }
    
    // For non-HTTP errors or if no specific error message was found
    if (error.message) {
      // Check for common local errors
      if (error.message.includes('Insufficient funds')) {
        throw new Error(error.message); // Pass through our custom insufficient funds message
      }
      
      if (error.message.includes('No wallet found')) {
        throw new Error(error.message); // Pass through our wallet not found message
      }
      
      throw new Error(`Transaction failed: ${error.message}`);
    }
    
    // Generic fallback
    throw new Error('Transaction failed due to an unknown error');
  }
};

/**
 * Link a user's social account to an existing wallet
 * 
 * @param userId User's username or ID
 * @param platform Platform the user is on (discord, twitter, telegram)
 * @param walletPublicKey Public key of the wallet to link
 * @returns Boolean indicating success
 */
export const linkUserWallet = async (
  userId: string,
  platform: string,
  walletPublicKey: string
): Promise<boolean> => {
  try {
    // Normalize platform
    const normalizedPlatform = validatePlatform(platform);
    
    // Call the link endpoint
    const response = await apiClient.post('/api/user/wallet/link', {
      platform: normalizedPlatform,
      platformId: userId,
      walletPublicKey
    });
    
    return response.data && response.data.status === 'success';
  } catch (error) {
    console.error('Error linking wallet:', error);
    return false;
  }
};

/**
 * Validate connection to the MCP endpoint
 * 
 * @returns Boolean indicating if the connection was successful
 */
export const validateConnection = async (): Promise<boolean> => {
  try {
    const response = await apiClient.get('/api/health');
    return response.status === 200 && response.data.status === 'ok';
  } catch (error) {
    console.error('Error connecting to MCP endpoint:', error);
    return false;
  }
};

/**
 * Get current price information for a token
 * 
 * Note: This is a placeholder function. In a real implementation, 
 * you would connect to a price feed service like CoinGecko, Pyth, or Chainlink
 * 
 * @param tokenSymbol Token symbol (e.g., SOL, USDC)
 * @returns Price information or null if not available
 */
export const getTokenPrice = async (tokenSymbol: string): Promise<{ usd: number } | null> => {
  try {
    const upperSymbol = tokenSymbol.toUpperCase();
    
    // This would be a real API call in production
    // For now, we'll return mock data for demonstration purposes
    const mockPrices: Record<string, number> = {
      'SOL': 125.42,
      'USDC': 1.00,
      'USDT': 1.00,
      'BTC': 59852.65,
      'ETH': 3175.81,
      'SRM': 0.32,
      'BONK': 0.00001234
    };
    
    if (mockPrices[upperSymbol]) {
      return { usd: mockPrices[upperSymbol] };
    }
    
    // In a real implementation, you would make an API call to get the price
    // Example with CoinGecko (commented out):
    // const response = await axios.get(
    //   `https://api.coingecko.com/api/v3/simple/price?ids=${tokenSymbol.toLowerCase()}&vs_currencies=usd`
    // );
    // return response.data[tokenSymbol.toLowerCase()] || null;
    
    return null;
  } catch (error) {
    console.error(`Failed to get price for ${tokenSymbol}:`, error);
    return null;
  }
};

/**
 * Transaction information interface
 */
export interface TransactionInfo {
  signature: string;
  status: 'success' | 'error';
  blockTime?: number;
  fee: number;
  accounts?: string[];
  logs?: string[];
}

/**
 * Account information interface
 */
export interface AccountInfo {
  address: string;
  lamports: number;
  owner: string;
  executable: boolean;
  rentEpoch: number;
  dataSize?: number;
}

/**
 * Network status information
 */
export interface NetworkStatus {
  health: string;
  currentEpoch: string;
  blockHeight: string;
  currentSlot: string;
}

/**
 * Get detailed information about a transaction by signature
 * 
 * @param signature Solana transaction signature
 * @returns Transaction details
 */
export const getTransactionDetails = async (signature: string): Promise<TransactionInfo> => {
  try {
    if (!signature) {
      throw new Error('Transaction signature is required');
    }

    // Call the MCP tool endpoint to get transaction details
    const response = await apiClient.post('/api/mcp/tools/getTransaction', {
      signature
    });
    
    // Check for successful response
    if (!response.data || !response.data.data || !response.data.data.result || !response.data.data.result.content) {
      console.error('Invalid response format from getTransaction:', response.data);
      throw new Error('Invalid response format from server');
    }
    
    const responseText = response.data.data.result.content[0].text;
    
    // Parse the response to extract transaction details
    // This is a simplified parsing approach - ideally you'd want to parse JSON if available
    const txInfo: TransactionInfo = {
      signature,
      status: responseText.includes('Status: success') ? 'success' : 'error',
      fee: parseFloat(responseText.match(/Fee: (\d+) lamports/)?.[1] || '0'),
      blockTime: undefined, // Set if available
      accounts: [],
      logs: []
    };
    
    // Try to extract block time if present
    const blockTimeMatch = responseText.match(/Block time: (\d+)/);
    if (blockTimeMatch && blockTimeMatch[1]) {
      txInfo.blockTime = parseInt(blockTimeMatch[1]);
    }
    
    return txInfo;
  } catch (error: any) {
    console.error('Error getting transaction details:', error.message);
    // Include more detailed error info for easier debugging
    if (error.response) {
      console.error('Server response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    throw new Error(`Failed to get transaction details: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Get account information by address
 * 
 * @param address Solana account address
 * @returns Account information
 */
export const getAccountInfo = async (address: string): Promise<AccountInfo> => {
  try {
    if (!address) {
      throw new Error('Account address is required');
    }

    // Call the MCP tool endpoint to get account info
    const response = await apiClient.post('/api/mcp/tools/getAccountInfo', {
      address
    });
    
    // Check for successful response
    if (!response.data || !response.data.data || !response.data.data.result || !response.data.data.result.content) {
      console.error('Invalid response format from getAccountInfo:', response.data);
      throw new Error('Invalid response format from server');
    }
    
    const responseText = response.data.data.result.content[0].text;
    
    // Try to parse the JSON if it exists in the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const accountData = JSON.parse(jsonMatch[0]);
        return {
          address,
          lamports: parseFloat(accountData.balance.split(' ')[0]) * 1e9, // Convert SOL to lamports
          owner: accountData.owner,
          executable: accountData.executable,
          rentEpoch: parseInt(accountData.rentEpoch),
          dataSize: accountData.dataSize
        };
      } catch (parseError) {
        console.error('Failed to parse account info JSON:', parseError);
      }
    }
    
    // Fallback to regex parsing if JSON parsing fails
    const lamportsMatch = responseText.match(/Balance: ([0-9.]+) SOL/);
    const ownerMatch = responseText.match(/Owner: ([A-Za-z0-9]+)/);
    const executableMatch = responseText.match(/Executable: (true|false)/);
    
    return {
      address,
      lamports: lamportsMatch ? parseFloat(lamportsMatch[1]) * 1e9 : 0, // Convert SOL to lamports
      owner: ownerMatch ? ownerMatch[1] : 'Unknown',
      executable: executableMatch ? executableMatch[1] === 'true' : false,
      rentEpoch: 0 // Default if not found
    };
  } catch (error: any) {
    console.error('Error getting account info:', error.message);
    // Include more detailed error info for easier debugging
    if (error.response) {
      console.error('Server response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    throw new Error(`Failed to get account info: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Check Solana network status
 * 
 * @returns Network status information
 */
export const getNetworkStatus = async (): Promise<NetworkStatus> => {
  try {
    // Call the MCP tool endpoint to get network status
    const response = await apiClient.post('/api/mcp/tools/networkStatus', {});
    
    // Check for successful response
    if (!response.data || !response.data.data || !response.data.data.result || !response.data.data.result.content) {
      console.error('Invalid response format from networkStatus:', response.data);
      throw new Error('Invalid response format from server');
    }
    
    const responseText = response.data.data.result.content[0].text;
    
    try {
      // Try to parse the JSON response
      const statusData = JSON.parse(responseText);
      return {
        health: statusData.health || 'unknown',
        currentEpoch: statusData.currentEpoch || '0',
        blockHeight: statusData.blockHeight || '0',
        currentSlot: statusData.currentSlot || '0'
      };
    } catch (parseError) {
      console.error('Failed to parse network status JSON:', parseError);
      
      // Fallback to regex parsing
      return {
        health: responseText.includes('health": "okay') ? 'okay' : 'unknown',
        currentEpoch: (responseText.match(/"currentEpoch": "([^"]+)"/) || [])[1] || '0',
        blockHeight: (responseText.match(/"blockHeight": "([^"]+)"/) || [])[1] || '0',
        currentSlot: (responseText.match(/"currentSlot": "([^"]+)"/) || [])[1] || '0'
      };
    }
  } catch (error: any) {
    console.error('Error getting network status:', error.message);
    // Include more detailed error info for easier debugging
    if (error.response) {
      console.error('Server response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    throw new Error(`Failed to get network status: ${error.response?.data?.message || error.message}`);
  }
}; 