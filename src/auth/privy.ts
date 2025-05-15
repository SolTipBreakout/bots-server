import { PrivyClient } from '@privy-io/server-auth';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// API configuration
const API_CONFIG = {
  baseUrl: process.env.MCPENDPOINT_URL || 'http://localhost:3000',
  apiKey: process.env.MCPENDPOINT_API_KEY || 'dev-key-1',
  apiKeyHeader: 'x-api-key',
  timeout: 10000, // 10 seconds
};

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_CONFIG.baseUrl,
  timeout: API_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json',
    [API_CONFIG.apiKeyHeader]: API_CONFIG.apiKey
  }
});

// Initialize Privy client
export const privyClient = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

// Interface for user wallet association
interface UserWallet {
  userId: string;
  walletAddress: string;
}

// This is a placeholder for database operations
// In a real implementation, you would use a proper database client
const db = {
  userWallets: {
    create: async (data: { data: UserWallet }) => {
      console.log('Creating user wallet association:', data);
      return data.data;
    },
    findFirst: async (query: { where: { userId: string } }): Promise<UserWallet | null> => {
      console.log('Finding user wallet:', query);
      return null; // Placeholder - would return the user's wallet from database
    }
  }
};

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

// Get user's wallet address by querying the wallet service API
export const getUserWallet = async (userId: string, platform: string = 'default'): Promise<string | null> => {
  try {
    // Call the API to get the wallet by social account
    const response = await apiClient.get('/api/wallet/social', {
      params: {
        platform,
        platformId: userId
      }
    });
    
    // If successful, return the wallet address
    if (response.data && response.data.wallet && response.data.wallet.publicKey) {
      return response.data.wallet.publicKey;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting user wallet:', error);
    return null;
  }
};

// Create or retrieve wallet for user by calling the wallet service API
export const getOrCreateUserWallet = async (userId: string, platform: string = 'default'): Promise<string> => {
  try {
    // First try to get an existing wallet
    const existingWallet = await getUserWallet(userId, platform);
    if (existingWallet) {
      return existingWallet;
    }

    // If not found, create a new wallet
    const response = await apiClient.post('/api/wallet/create', {
      platform,
      platformId: userId,
      label: `${platform}-${userId}`
    });
    
    if (response.data && response.data.wallet && response.data.wallet.publicKey) {
      return response.data.wallet.publicKey;
    }
    
    throw new Error('Failed to create wallet: Invalid response from API');
  } catch (error) {
    console.error('Error creating user wallet:', error);
    throw error;
  }
}; 