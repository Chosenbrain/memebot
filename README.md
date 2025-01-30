MemeCoin Bot 🤖🚀
Overview

MemeCoin Bot is an automated trading bot designed to monitor and invest in newly launched meme coins on Uniswap. The bot incorporates sophisticated scam detection mechanisms, trade metrics, and performance reporting to ensure safe and effective trading. Users can monitor activities via a real-time dashboard and interact with the bot through Telegram commands.
Features
🛠 Functionality

    Automated Trading:
        Detects newly launched meme coins.
        Automatically invests a fixed amount (e.g., $1 in ETH).
        Executes trades using Uniswap.

    Scam Detection:
        Validates liquidity.
        Checks honeypots and suspicious metadata.
        Analyzes token supply and ownership.

    Real-Time Monitoring:
        A web-based dashboard displays recent trades, trade metrics, and logs.
        Uses WebSockets for real-time updates.

    Telegram Integration:
        Start/stop the bot.
        Monitor status and view trade summaries.
        Adjust trade amounts on-the-fly.

    Trade Metrics and Reporting:
        Tracks profits/losses for each trade.
        Weekly automated performance summaries sent via email and Telegram.

Requirements
📦 Dependencies

Install dependencies using:

npm install

Environment Variables

Create a .env file with the following variables:

INFURA_API_KEY=your-infura-api-key
ETHERSCAN_API_KEY=your-etherscan-api-key
WALLET_PRIVATE_KEY=your-wallet-private-key
GMAIL_USER=your-gmail-address
GMAIL_PASSWORD=your-gmail-password
NOTIFICATION_EMAIL=recipient-email
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id
TRADE_AMOUNT=0.001

Usage
🖥 Running the Bot Locally

    Clone the repository:

git clone https://github.com/Chosenbrain/memebot.git
cd memebot

Install dependencies:

npm install

Start the listener:

node listener.js

Start the dashboard:

    node server.js

🌐 Accessing the Dashboard

Visit:

http://localhost:3000

💬 Using Telegram Commands

Commands available:

    /startbot: Start the bot and begin monitoring new tokens.
    /stopbot: Stop the bot.
    /status: Get the current status of the bot.
    /trades: View recent trades.
    /settradeamount <amount>: Set the trade amount in ETH.

Deployment
Deploy Frontend on Netlify

    Move the public folder to your preferred directory.
    Log in to Netlify.
    Drag and drop the public folder into the deployment section.

Deploy Backend on AWS

Refer to AWS Elastic Beanstalk or AWS EC2 documentation to deploy listener.js and server.js.
Important Notes

    Ensure you deposit funds into the wallet address used by the bot.
    Withdraw profits directly from your wallet using your private key.

License

This project is licensed under the MIT License. See the LICENSE file for details.
Contributing

Contributions are welcome! Feel free to submit issues and pull requests to improve the bot.