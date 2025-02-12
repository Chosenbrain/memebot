import 'dotenv/config';

import { expect } from 'chai';
import sinon from 'sinon';
import nock from 'nock';
import { ethers } from 'ethers';
import axios from 'axios';

// Import all functions from your listener module.
import * as listener from '../listener.js';

const {
  getTokenPrice,
  checkLiquidity,
  isHoneypot,
  checkContractVerification,
  isOwnershipRenounced,
  checkSupplyDistribution,
  getGoogleSentiment,
  validateToken,
  executeTrade,
  signer
} = listener;

// Use your WETH address from environment or a default.
const WETH = process.env.WETH || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

describe('Listener Module Tests', function() {

  describe('Wallet Initialization', function() {
    it('should create a wallet with a valid address', function() {
      // Using a dummy private key (this is not a real one).
      const testPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const testWallet = new ethers.Wallet(testPrivateKey);
      expect(testWallet.address).to.be.a('string');
    });
  });

  describe('getTokenPrice', function() {
    afterEach(() => {
      sinon.restore();
    });

    it('should return the correct price from the API response', async function() {
      const tokenAddress = '0xABCDEF1234567890';
      const fakeResponse = {
        [tokenAddress.toLowerCase()]: { usd: 5.67 }
      };
      const axiosStub = sinon.stub(axios, 'get').resolves({ data: fakeResponse });
      const price = await getTokenPrice(tokenAddress);
      expect(price).to.equal(5.67);
      axiosStub.restore();
    });

    it('should return 0 if API response does not include price data', async function() {
      const tokenAddress = '0xABCDEF1234567890';
      const fakeResponse = {};
      const axiosStub = sinon.stub(axios, 'get').resolves({ data: fakeResponse });
      const price = await getTokenPrice(tokenAddress);
      expect(price).to.equal(0);
      axiosStub.restore();
    });
  });

  describe('checkLiquidity', function() {
    let contractStub;
    afterEach(() => {
      if (contractStub) contractStub.restore();
    });

    it('should return true when liquidity is above the minimum', async function() {
      // Create a fake pair contract with reserves above the minimum.
      const fakePair = {
        getReserves: sinon.stub().resolves([ethers.utils.parseEther("1"), ethers.utils.parseEther("0.5")]),
        token0: sinon.stub().resolves(WETH),
        token1: sinon.stub().resolves("0xSomeOtherToken")
      };
      contractStub = sinon.stub(ethers, "Contract").returns(fakePair);
      const result = await checkLiquidity("0xFakePairAddress");
      expect(result).to.be.true;
    });

    it('should return false when liquidity is below the minimum', async function() {
      const fakePair = {
        getReserves: sinon.stub().resolves([ethers.utils.parseEther("0.05"), ethers.utils.parseEther("0.5")]),
        token0: sinon.stub().resolves(WETH),
        token1: sinon.stub().resolves("0xSomeOtherToken")
      };
      contractStub = sinon.stub(ethers, "Contract").returns(fakePair);
      const result = await checkLiquidity("0xFakePairAddress");
      expect(result).to.be.false;
    });
  });

  describe('isHoneypot', function() {
    let contractStub;
    afterEach(() => {
      sinon.restore();
    });

    it('should return false when trade simulation succeeds', async function() {
      const fakeRouter = {
        callStatic: {
          exactInputSingle: sinon.stub()
        }
      };
      // Simulate a successful buy (first call) and sell (second call).
      fakeRouter.callStatic.exactInputSingle.onFirstCall().resolves(ethers.utils.parseEther("1"));
      fakeRouter.callStatic.exactInputSingle.onSecondCall().resolves(ethers.utils.parseEther("0.9"));

      contractStub = sinon.stub(ethers, "Contract").returns(fakeRouter);
      sinon.stub(signer, "getAddress").resolves("0xFakeWalletAddress");

      const result = await isHoneypot("0xFakeTokenAddress");
      expect(result).to.be.false;
      contractStub.restore();
      signer.getAddress.restore();
    });

    it('should return true if sell simulation fails with a real error', async function() {
      const fakeRouter = {
        callStatic: {
          exactInputSingle: sinon.stub()
        }
      };
      fakeRouter.callStatic.exactInputSingle.onFirstCall().resolves(ethers.utils.parseEther("1"));
      fakeRouter.callStatic.exactInputSingle.onSecondCall().rejects(new Error("Some revert error"));

      contractStub = sinon.stub(ethers, "Contract").returns(fakeRouter);
      sinon.stub(signer, "getAddress").resolves("0xFakeWalletAddress");

      const result = await isHoneypot("0xFakeTokenAddress");
      expect(result).to.be.true;
      contractStub.restore();
      signer.getAddress.restore();
    });

    it('should return false if error includes "missing revert data"', async function() {
      const fakeRouter = {
        callStatic: {
          exactInputSingle: sinon.stub()
        }
      };
      fakeRouter.callStatic.exactInputSingle.onFirstCall().resolves(ethers.utils.parseEther("1"));
      fakeRouter.callStatic.exactInputSingle.onSecondCall().rejects(new Error("Missing revert data"));

      contractStub = sinon.stub(ethers, "Contract").returns(fakeRouter);
      sinon.stub(signer, "getAddress").resolves("0xFakeWalletAddress");

      const result = await isHoneypot("0xFakeTokenAddress");
      expect(result).to.be.false;
      contractStub.restore();
      signer.getAddress.restore();
    });
  });

  describe('checkContractVerification', function() {
    afterEach(() => {
      sinon.restore();
    });

    it('should return true if the contract is verified', async function() {
      const fakeResponse = {
        data: {
          status: "1",
          result: [{ SourceCode: "some code" }]
        }
      };
      const axiosStub = sinon.stub(axios, "get").resolves(fakeResponse);
      const result = await checkContractVerification("0xFakeTokenAddress");
      expect(result).to.be.true;
      axiosStub.restore();
    });

    it('should return false if the contract is not verified', async function() {
      const fakeResponse = {
        data: {
          status: "0",
          result: [{}]
        }
      };
      const axiosStub = sinon.stub(axios, "get").resolves(fakeResponse);
      const result = await checkContractVerification("0xFakeTokenAddress");
      expect(result).to.be.false;
      axiosStub.restore();
    });
  });

  describe('isOwnershipRenounced', function() {
    let contractStub;
    afterEach(() => {
      if (contractStub) contractStub.restore();
    });

    it('should return true if the owner is the zero address', async function() {
      const fakeToken = { owner: sinon.stub().resolves(ethers.constants.AddressZero) };
      contractStub = sinon.stub(ethers, "Contract").returns(fakeToken);
      const result = await isOwnershipRenounced("0xFakeTokenAddress");
      expect(result).to.be.true;
    });

    it('should return false if the owner is not the zero address', async function() {
      const fakeToken = { owner: sinon.stub().resolves("0xNotZeroAddress") };
      contractStub = sinon.stub(ethers, "Contract").returns(fakeToken);
      const result = await isOwnershipRenounced("0xFakeTokenAddress");
      expect(result).to.be.false;
    });
  });

  describe('checkSupplyDistribution', function() {
    let contractStub;
    afterEach(() => {
      if (contractStub) contractStub.restore();
    });

    it("should return true when wallet's balance is <= 10% of total supply", async function() {
      const fakeToken = {
        totalSupply: sinon.stub().resolves(ethers.utils.parseEther("100")),
        balanceOf: sinon.stub().resolves(ethers.utils.parseEther("5"))
      };
      contractStub = sinon.stub(ethers, "Contract").returns(fakeToken);
      const result = await checkSupplyDistribution("0xFakeTokenAddress");
      expect(result).to.be.true;
    });

    it("should return false when wallet's balance is > 10% of total supply", async function() {
      const fakeToken = {
        totalSupply: sinon.stub().resolves(ethers.utils.parseEther("100")),
        balanceOf: sinon.stub().resolves(ethers.utils.parseEther("20"))
      };
      contractStub = sinon.stub(ethers, "Contract").returns(fakeToken);
      const result = await checkSupplyDistribution("0xFakeTokenAddress");
      expect(result).to.be.false;
    });
  });

  describe('getGoogleSentiment', function() {
    afterEach(() => {
      sinon.restore();
    });

    it('should return true when positive sentiment is detected', async function() {
      const tokenSymbol = "MOON";
      const fakeResponse = {
        data: {
          items: [
            { title: "Moon Rocket", snippet: "Gain is high" },
            { title: "Bullish", snippet: "Price up" }
          ]
        }
      };
      const axiosStub = sinon.stub(axios, "get").resolves(fakeResponse);
      const result = await getGoogleSentiment(tokenSymbol);
      expect(result).to.be.true;
      axiosStub.restore();
    });

    it('should return false when not enough positive sentiment is found', async function() {
      const tokenSymbol = "TOKEN";
      const fakeResponse = {
        data: {
          items: [
            { title: "Token Info", snippet: "neutral information" },
            { title: "Another result", snippet: "nothing special" }
          ]
        }
      };
      const axiosStub = sinon.stub(axios, "get").resolves(fakeResponse);
      const result = await getGoogleSentiment(tokenSymbol);
      expect(result).to.be.false;
      axiosStub.restore();
    });
  });

  describe('validateToken', function() {
    afterEach(() => {
      sinon.restore();
    });

    it('should return true if all validations pass', async function() {
      // Stub all validation helper functions to return success.
      sinon.stub(listener, "checkLiquidity").resolves(true);
      sinon.stub(listener, "isHoneypot").resolves(false);
      sinon.stub(listener, "checkContractVerification").resolves(true);
      sinon.stub(listener, "isOwnershipRenounced").resolves(true);
      sinon.stub(listener, "checkSupplyDistribution").resolves(true);
      sinon.stub(listener, "getGoogleSentiment").resolves(true);

      const result = await validateToken("0xFakeTokenAddress", "0xFakePairAddress");
      expect(result).to.be.true;
    });

    it('should return false if any validation fails', async function() {
      // For example, if liquidity check fails.
      sinon.stub(listener, "checkLiquidity").resolves(false);
      sinon.stub(listener, "isHoneypot").resolves(false);
      sinon.stub(listener, "checkContractVerification").resolves(true);
      sinon.stub(listener, "isOwnershipRenounced").resolves(true);
      sinon.stub(listener, "checkSupplyDistribution").resolves(true);
      sinon.stub(listener, "getGoogleSentiment").resolves(true);

      const result = await validateToken("0xFakeTokenAddress", "0xFakePairAddress");
      expect(result).to.be.false;
    });
  });

  describe('executeTrade', function() {
    let contractStub;
    afterEach(() => {
      sinon.restore();
    });

    it('should execute a trade and log notifications', async function() {
      const fakeTxReceipt = { transactionHash: "0xDummyTxHash" };
      // Simulate a router contract with a fake exactInputSingle that resolves with an object having a wait method.
      const fakeRouter = {
        exactInputSingle: sinon.stub().resolves({ wait: sinon.stub().resolves(fakeTxReceipt) })
      };
      contractStub = sinon.stub(ethers, "Contract").returns(fakeRouter);
      // Stub getTokenPrice so that trade logging uses a known value.
      sinon.stub(listener, "getTokenPrice").resolves(10);
      // Stub logTrade, sendEmail, and sendTelegram to simply return.
      sinon.stub(listener, "logTrade").callsFake(() => {});
      sinon.stub(listener, "sendEmail").resolves();
      sinon.stub(listener, "sendTelegram").resolves();
      sinon.stub(signer, "getAddress").resolves("0xFakeWalletAddress");

      const result = await executeTrade("0xFakeTokenAddress");
      expect(result.success).to.be.true;
      expect(result.txHash).to.equal("0xDummyTxHash");

      contractStub.restore();
      signer.getAddress.restore();
    });

    it('should return failure if trade execution fails', async function() {
      const fakeRouter = {
        exactInputSingle: sinon.stub().rejects(new Error("Trade failed"))
      };
      const contractStub = sinon.stub(ethers, "Contract").returns(fakeRouter);
      sinon.stub(signer, "getAddress").resolves("0xFakeWalletAddress");

      const result = await executeTrade("0xFakeTokenAddress");
      expect(result.success).to.be.false;
      contractStub.restore();
      signer.getAddress.restore();
    });
  });

});
