import { getUserWallet, getWalletBalance, getTokenBalances, executeTransaction, linkUserWallet, getSupportedTokens, getTokenInfo, getTokenPrice, getOrCreateUserWallet, getTransactionDetails, getAccountInfo, getNetworkStatus, getWalletTransactions, getUserProfile } from '../blockchain/solana-service';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Process commands from different platforms
 */
export const processCommand = async (
  text: string, 
  platform: 'twitter' | 'telegram' | 'discord', 
  senderUsername: string
): Promise<string> => {
  // Extract command parts
  const words = text.trim().split(/\s+/);
  
  // Remove bot mention if present
  const cleanWords = words.filter(w => 
    !w.includes(`@${process.env.TWITTER_BOT_USERNAME}`) && 
    !w.includes(`@${process.env.TELEGRAM_BOT_USERNAME}`) &&
    !w.includes(`<@${process.env.DISCORD_BOT_ID}>`)
  );
  
  const command = cleanWords[0]?.toLowerCase();
  
  if (command === 'send' || command === 'tip') {
    // Format: send @recipient 1 SOL
    const recipientTag = cleanWords[1];
    const amount = parseFloat(cleanWords[2]);
    const token = cleanWords[3]?.toUpperCase() || 'SOL';
    
    if (!recipientTag || isNaN(amount) || amount <= 0) {
      return `Invalid format. Use: send @recipient amount token`;
    }
    
    // Extract recipient username from the tag
    const recipientUsername = recipientTag.replace('@', '');
    
    // Get wallet addresses
    const senderWallet = await getUserWallet(senderUsername, platform);
    
    if (!senderWallet) {
      return `You need to connect your wallet first. Use "connect YOUR_WALLET_ADDRESS" or visit ${process.env.APP_URL} to get started.`;
    }
    
    // Execute transaction - now also handles wallet creation if needed
    try {
      const result = await executeTransaction(senderUsername, recipientUsername, amount, token, platform);
      
      // Customize message based on whether a wallet was created
      let message = `Successfully sent ${amount} ${token} to @${recipientUsername}!`;
      
      // Add info about wallet creation if applicable
      if (result.walletCreated) {
        message += ` A new wallet was automatically created for @${recipientUsername}.`;
      }
      
      // Add transaction link
      message += ` Transaction: ${process.env.EXPLORER_URL}/${result.signature}`;
      
      return message;
    } catch (error: any) {
      console.error('Transaction error:', error);
      
      // Format user-friendly error messages
      if (error.message.includes('Insufficient funds') || error.message.includes('Insufficient SOL')) {
        return `❌ ${error.message}`;
      }
      
      if (error.message.includes('No wallet found')) {
        return `❌ ${error.message}`;
      }
      
      // General error case
      return `❌ Failed to send ${token}. ${error.message}`;
    }
  }
  
  else if (command === 'balance') {
    // Get user's wallet
    const userWallet = await getUserWallet(senderUsername, platform);
    
    if (!userWallet) {
      return `You need to connect your wallet first. Use "connect YOUR_WALLET_ADDRESS" or visit ${process.env.APP_URL} to get started.`;
    }
    
    // Query blockchain for balance
    try {
      const balance = await getWalletBalance(userWallet);
      return `Your SOL balance is ${balance} SOL`;
    } catch (error: any) {
      console.error('Balance query error:', error);
      return `Failed to get balance. Error: ${error.message}`;
    }
  }
  
  else if (command === 'tokens') {
    // Get user's wallet
    const userWallet = await getUserWallet(senderUsername, platform);
    
    if (!userWallet) {
      return `You need to connect your wallet first. Use "connect YOUR_WALLET_ADDRESS" or visit ${process.env.APP_URL} to get started.`;
    }
    
    // Query blockchain for token balances
    try {
      const tokens = await getTokenBalances(userWallet);
      if (tokens.length === 0) {
        return `You don't have any token balances yet.\nSupported tokens: ${getSupportedTokens().join(', ')}`;
      }
      return `Your token balances:\n${tokens.map((t) => `${t.symbol}: ${t.amount}`).join('\n')}`;
    } catch (error: any) {
      console.error('Token balance query error:', error);
      return `Failed to get token balances. Error: ${error.message}`;
    }
  }
  
  else if (command === 'address') {
    // Get user's wallet
    const userWallet = await getUserWallet(senderUsername, platform);
    
    if (!userWallet) {
      return `You need to connect your wallet first. Use "connect YOUR_WALLET_ADDRESS" or visit ${process.env.APP_URL} to get started.`;
    }
    
    return `Your wallet address is: ${userWallet}`;
  }
  
  else if (command === 'register') {
    try {
      // Check if user already has a wallet
      const existingWallet = await getUserWallet(senderUsername, platform);
      
      if (existingWallet) {
        return `You already have a wallet with address: ${existingWallet}. Use "balance" to check your balance.`;
      }
      
      // Create a new custodial wallet for the user
      const newWalletAddress = await getOrCreateUserWallet(senderUsername, platform);
      
      return `Welcome to SolBreakout! ✨ A new custodial wallet has been created for you: ${newWalletAddress}\n\nUse "balance" to check your balance or "help" to see all available commands.`;
    } catch (error: any) {
      console.error('Registration error:', error);
      return `Failed to register: ${error.message}. Please try again later.`;
    }
  }
  
  else if (command === 'connect') {
    // Format: connect WALLET_ADDRESS
    const walletAddress = cleanWords[1];
    
    if (!walletAddress) {
      return `Invalid format. Use: connect YOUR_WALLET_ADDRESS`;
    }
    
    // Validate wallet address (basic check for valid public key format)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return `Invalid wallet address format. Please provide a valid Solana wallet address.`;
    }
    
    try {
      // Check if user already has a wallet
      const existingWallet = await getUserWallet(senderUsername, platform);
      
      if (existingWallet) {
        return `You already have a connected wallet with address: ${existingWallet}. 
To use a different wallet, please contact support.`;
      }
      
      // Link the new wallet to the user
      const success = await linkUserWallet(senderUsername, platform, walletAddress);
      
      if (success) {
        return `Successfully connected wallet ${walletAddress} to your ${platform} account.`;
      } else {
        return `Failed to connect wallet. Please try again later or contact support.`;
      }
    } catch (error: any) {
      console.error('Connect wallet error:', error);
      return `Failed to connect wallet: ${error.message}`;
    }
  }
  
  else if (command === 'tokens-info') {
    try {
      // Get a list of all supported tokens
      const supportedTokens = getSupportedTokens();
      
      if (supportedTokens.length === 0) {
        return "No supported tokens found.";
      }
      
      // Display information about each token
      let result = "Supported tokens:\n";
      
      // Process the first few tokens to avoid excessive message length
      const displayLimit = 5;
      const displayTokens = supportedTokens.slice(0, displayLimit);
      
      for (const symbol of displayTokens) {
        try {
          const tokenInfo = await getTokenInfo(symbol);
          result += `${symbol}: Mint address ${tokenInfo.mint.slice(0, 8)}...${tokenInfo.mint.slice(-8)}, Decimals: ${tokenInfo.decimals}\n`;
        } catch (error) {
          result += `${symbol}: Information unavailable\n`;
        }
      }
      
      if (supportedTokens.length > displayLimit) {
        const remaining = supportedTokens.length - displayLimit;
        result += `\n...and ${remaining} more tokens. Use "help" for the full list.`;
      }
      
      return result;
    } catch (error: any) {
      console.error('Token info error:', error);
      return `Failed to get token information. Error: ${error.message}`;
    }
  }
  
  else if (command === 'price') {
    // Format: price TOKEN or just 'price' for SOL
    const tokenSymbol = cleanWords[1]?.toUpperCase() || 'SOL';
    
    try {
      // Check if token is supported
      const supportedTokens = getSupportedTokens();
      if (!supportedTokens.includes(tokenSymbol)) {
        return `Token ${tokenSymbol} is not supported. Available tokens: ${supportedTokens.join(', ')}`;
      }
      
      // Get token price information
      const priceInfo = await getTokenPrice(tokenSymbol);
      
      if (!priceInfo) {
        return `Price information for ${tokenSymbol} is not available.`;
      }
      
      return `Current price of ${tokenSymbol}: $${priceInfo.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} USD`;
    } catch (error: any) {
      console.error('Price query error:', error);
      return `Failed to get price for ${tokenSymbol}. Error: ${error.message}`;
    }
  }
  
  else if (command === 'history') {
    // Get user's wallet
    const userWallet = await getUserWallet(senderUsername, platform);
    
    if (!userWallet) {
      return `You need to connect your wallet first. Use "connect YOUR_WALLET_ADDRESS" or visit ${process.env.APP_URL} to get started.`;
    }
    
    try {
      // Get transaction history
      const transactions = await getWalletTransactions(userWallet, 5);
      
      if (!transactions || transactions.length === 0) {
        return `No transaction history found for your wallet.`;
      }
      
      // Format transactions for display
      let result = `Recent transactions for your wallet:\n`;
      
      transactions.forEach((tx, index) => {
        const date = tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString() : 'Pending';
        const status = tx.status === 'success' ? '✅' : '❌';
        const amount = tx.amount ? `${tx.amount} ${tx.tokenSymbol || 'SOL'}` : 'N/A';
        
        result += `${index + 1}. ${status} ${amount} [${date}]\n   ${process.env.EXPLORER_URL}/tx/${tx.signature}\n`;
      });
      
      return result;
    } catch (error: any) {
      console.error('Error fetching transaction history:', error);
      return `Failed to fetch transaction history: ${error.message}`;
    }
  }
  
  else if (command === 'profile') {
    try {
      // Get user profile
      const profile = await getUserProfile(senderUsername, platform);
      
      if (!profile) {
        return `No profile found. Use "register" to create a wallet first.`;
      }
      
      // Format profile information
      let result = `📊 Your SolBreakout Profile:\n`;
      
      // Add wallet info
      if (profile.wallets && profile.wallets.length > 0) {
        const wallet = profile.wallets[0];
        result += `💼 Wallet: ${wallet.public_key}\n`;
        result += `🏷️ Label: ${wallet.label || 'No label'}\n`;
      }
      
      // Add social accounts
      if (profile.socialAccounts && profile.socialAccounts.length > 0) {
        result += `\n🔗 Linked accounts:\n`;
        profile.socialAccounts.forEach((account: any) => {
          result += `- ${account.platform}: ${account.platform_id}\n`;
        });
      }
      
      // Add recent transactions
      if (profile.transactions && profile.transactions.length > 0) {
        result += `\n📝 Recent transactions:\n`;
        profile.transactions.slice(0, 3).forEach((tx: any, index: number) => {
          const date = tx.block_time ? new Date(tx.block_time * 1000).toLocaleString() : 'Pending';
          const status = tx.status === 'confirmed' ? '✅' : (tx.status === 'failed' ? '❌' : '⏳');
          result += `${index + 1}. ${status} ${tx.amount} ${tx.token_symbol || 'SOL'} [${date}]\n`;
        });
        
        result += `\nUse "history" to see more transactions.`;
      } else {
        result += `\nNo recent transactions found.`;
      }
      
      return result;
    } catch (error: any) {
      console.error('Error fetching user profile:', error);
      return `Failed to fetch user profile: ${error.message}`;
    }
  }
  
  else if (command === 'help') {
    const supportedTokens = getSupportedTokens().join(', ');
    return `Available commands:
- register - Create a new custodial wallet
- send @user amount [token] - Send tokens to another user
  (Supported tokens: ${supportedTokens})
- balance - Check your SOL balance
- tokens - List your token balances
- tokens-info - Show supported token details
- price [token] - Check current token price
- address - Show your wallet address
- history - View your recent transactions
- profile - View your complete profile
- connect ADDRESS - Connect your external wallet 
- transaction SIGNATURE - Get transaction details
- account ADDRESS - Get account information
- network - Check Solana network status
- help - Show this help message`;
  }
  
  else if (command === 'transaction') {
    // Format: transaction TX_SIGNATURE
    const signature = cleanWords[1];
    
    if (!signature) {
      return `Invalid format. Use: transaction TX_SIGNATURE`;
    }
    
    try {
      const txInfo = await getTransactionDetails(signature);
      
      return `Transaction ${signature}:
Status: ${txInfo.status}
Fee: ${txInfo.fee} lamports
${txInfo.blockTime ? `Block Time: ${new Date(txInfo.blockTime * 1000).toLocaleString()}` : ''}`;
    } catch (error: any) {
      console.error('Transaction query error:', error);
      return `Failed to get transaction details. Error: ${error.message}`;
    }
  }
  
  else if (command === 'account') {
    // Format: account ACCOUNT_ADDRESS
    const address = cleanWords[1];
    
    if (!address) {
      return `Invalid format. Use: account ACCOUNT_ADDRESS`;
    }
    
    try {
      const accountInfo = await getAccountInfo(address);
      
      return `Account Information for ${address}:
Balance: ${accountInfo.lamports / 1_000_000_000} SOL
Owner: ${accountInfo.owner}
Executable: ${accountInfo.executable}`;
    } catch (error: any) {
      console.error('Account query error:', error);
      return `Failed to get account information. Error: ${error.message}`;
    }
  }
  
  else if (command === 'network') {
    try {
      const status = await getNetworkStatus();
      
      return `Solana Network Status:
Health: ${status.health}
Current Epoch: ${status.currentEpoch}
Block Height: ${status.blockHeight}
Current Slot: ${status.currentSlot}`;
    } catch (error: any) {
      console.error('Network status query error:', error);
      return `Failed to get network status. Error: ${error.message}`;
    }
  }
  
  else {
    return `Unknown command. Type "help" to see available commands.`;
  }
}; 