# SolTip: Cross-Platform Solana Tipping Bot

SolTip is a cross-platform Solana tipping application that enables users to send SOL and tokens to others via Twitter, Telegram, and Discord.

## ⚠️ Security Disclaimer

**WARNING: This code has NOT been professionally audited and is not recommended for production use without a thorough security review.**

- This codebase handles private keys and cryptocurrency transactions
- The implementation has not undergone professional security auditing
- There may be vulnerabilities or security issues that could lead to loss of funds
- Use at your own risk and only with test accounts and small amounts
- We strongly recommend a comprehensive security audit before any production deployment

## Features

- Send SOL and other Solana tokens to users across different platforms
- Check your Solana wallet balance
- View your token balances
- Get your Solana wallet address
- Seamless authentication with Privy

## Architecture

SolTip leverages:
- **SolanaAgentKit + MCP** for Solana blockchain interactions
- **Privy** for authentication across platforms
- **Platform-specific API**s for bot interactions

## Prerequisites

- Node.js (v16 or higher)
- Solana wallet with private key
- Solana RPC URL
- Privy account for authentication
- Platform API credentials (Twitter, Telegram, Discord)

## Setup

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/soltip.git
   cd soltip
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create a `.env` file in the root directory with your credentials (see `.env.example` for required variables)

4. Build the project:
   ```bash
   pnpm build
   ```

5. Start the application:
   ```bash
   pnpm start
   ```

For development, you can use:
```bash
pnpm run dev
```

### Docker Deployment

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/soltip.git
   cd soltip
   ```

2. Create a `.env` file in the root directory with your credentials (see `.env.example` for required variables)

3. Build and start the Docker containers:
   ```bash
   docker-compose up -d
   ```

4. To view logs:
   ```bash
   docker-compose logs -f
   ```

5. To stop the containers:
   ```bash
   docker-compose down
   ```

## Bot Usage

### Telegram

Start a conversation with the bot or add it to a group. Available commands:

- `/send @username 1 SOL` - Send SOL to another user
- `/tip @username 0.5 SOL` - Same as send
- `/balance` - Check your SOL balance
- `/tokens` - List your token balances
- `/address` - Show your wallet address
- `/start` - Get started with the bot
- `/help` - Show available commands

### Twitter (Coming Soon)

Mention the bot in a tweet with:

- `@SolTipBot send @username 1 SOL`
- `@SolTipBot balance`
- `@SolTipBot tokens`
- `@SolTipBot address`

### Discord (Coming Soon)

Use slash commands in any channel where the bot is present:

- `/send @username 1 SOL`
- `/balance`
- `/tokens`
- `/address`

## Development

### Project Structure

```
├── src/
│   ├── auth/         # Authentication with Privy
│   ├── blockchain/   # Solana interactions
│   ├── bots/         # Platform-specific bot implementations
│   ├── commands/     # Command processing
│   ├── db/           # Database interactions
│   ├── utils/        # Utility functions
│   └── index.ts      # Main entry point
├── .env.example      # Example environment variables
├── tsconfig.json     # TypeScript configuration
├── package.json      # Project dependencies and scripts
└── README.md         # Project documentation
```

## License

MIT