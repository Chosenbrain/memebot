const { ethers } = require("ethers");
require("dotenv").config();

const provider = new ethers.providers.JsonRpcProvider(
  `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

wallet.getBalance().then(balance => {
  console.log("Wallet balance:", ethers.utils.formatEther(balance), "ETH");
});
