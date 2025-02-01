require("dotenv").config();
const { ethers } = require("ethers");

(async () => {
  // Set up provider and signer (use your test settings)
  const provider = new ethers.providers.JsonRpcProvider(
    `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );
  const signer = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

  // Example: Test getTokenPrice with a known token address (e.g., USDC)
  const testTokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC
  const response = await ethers.utils.getAddress(testTokenAddress); // simple check
  console.log("Test Token Address Validated:", response);
  
  // If you want, you can call getTokenPrice from your module:
  // (You might need to export that function or replicate similar logic here.)
})();
