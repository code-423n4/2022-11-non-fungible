import hre from 'hardhat';
import { expect } from 'chai';
import { ethers, Wallet, Contract, BigNumber } from 'ethers';
import { waitForTx } from '../web3-utils';

import { eth, Order } from './exchange';
import { Side, ZERO_ADDRESS } from './exchange/utils';

import type { CheckBalances, GenerateOrder } from './exchange';

async function setBalance(address: string, value: string) {
  await hre.network.provider.send('hardhat_setBalance', [address, value]);
}

export function runExecuteTests(setupTest: any) {
  return async () => {
    const INVERSE_BASIS_POINT = 10_000;
    const price: BigNumber = eth('1');
    const feeRate = 300;

    let exchange: Contract;
    let executionDelegate: Contract;
    let matchingPolicies: Record<string, Contract>;

    let admin: Wallet;
    let alice: Wallet;
    let bob: Wallet;
    let thirdParty: Wallet;

    let weth: Contract;
    let pool: Contract;
    let mockERC721: Contract;
    let mockERC1155: Contract;

    let generateOrder: GenerateOrder;
    let checkBalances: CheckBalances;

    let sell: Order;
    let sellInput: any;
    let buy: Order;
    let buyInput: any;
    let otherOrders: Order[];
    let fee: BigNumber;
    let priceMinusFee: BigNumber;
    let tokenId: number;

    let aliceBalance: BigNumber;
    let aliceBalanceWeth: BigNumber;
    let aliceBalancePool: BigNumber;
    let bobBalance: BigNumber;
    let bobBalanceWeth: BigNumber;
    let bobBalancePool: BigNumber;
    let feeRecipientBalance: BigNumber;
    let feeRecipientBalanceWeth: BigNumber;
    let feeRecipientBalancePool: BigNumber;
    let expectedAliceBalance: BigNumber;
    let expectedAliceBalanceWeth: BigNumber;
    let expectedAliceBalancePool: BigNumber;
    let expectedBobBalance: BigNumber;
    let expectedBobBalanceWeth: BigNumber;
    let expectedBobBalancePool: BigNumber;
    let expectedFeeRecipientBalance: BigNumber;
    let expectedFeeRecipientBalanceWeth: BigNumber;
    let expectedFeeRecipientBalancePool: BigNumber;

    let tx: any;

    const updateBalances = async () => {
      aliceBalance = await alice.getBalance();
      aliceBalanceWeth = await weth.balanceOf(alice.address);
      aliceBalancePool = await pool.balanceOf(alice.address);
      bobBalance = await bob.getBalance();
      bobBalanceWeth = await weth.balanceOf(bob.address);
      bobBalancePool = await pool.balanceOf(bob.address);
      feeRecipientBalance = await admin.provider.getBalance(thirdParty.address);
      feeRecipientBalanceWeth = await weth.balanceOf(thirdParty.address);
      feeRecipientBalancePool = await pool.balanceOf(thirdParty.address);
      expectedAliceBalance = aliceBalance;
      expectedAliceBalanceWeth = aliceBalanceWeth;
      expectedAliceBalancePool = aliceBalancePool;
      expectedBobBalance = bobBalance;
      expectedBobBalanceWeth = bobBalanceWeth;
      expectedBobBalancePool = bobBalancePool;
      expectedFeeRecipientBalance = feeRecipientBalance;
      expectedFeeRecipientBalanceWeth = feeRecipientBalanceWeth;
      expectedFeeRecipientBalancePool = feeRecipientBalancePool;
    };

    before(async () => {
      ({
        admin,
        alice,
        bob,
        thirdParty,
        weth,
        pool,
        matchingPolicies,
        mockERC721,
        mockERC1155,
        tokenId,
        exchange,
        executionDelegate,
        generateOrder,
        checkBalances,
      } = await setupTest());
    });

    describe('single execute', () => {
      beforeEach(async () => {
        await updateBalances();
        tokenId += 1;
        await mockERC721.mint(alice.address, tokenId);

        fee = price.mul(feeRate).div(INVERSE_BASIS_POINT);
        priceMinusFee = price.sub(fee);

        sell = generateOrder(alice, {
          side: Side.Sell,
          tokenId,
        });
        buy = generateOrder(bob, { side: Side.Buy, tokenId });

        otherOrders = Array.from(new Array(16).keys()).map((_) => {
          return generateOrder(alice, { salt: _ });
        });

        sellInput = await sell.pack();
        buyInput = await buy.pack();
        tx = null;
      });

      afterEach(async () => {
        if (tx) {
          const gasFee = tx.gasUsed.mul(tx.effectiveGasPrice);
          if (tx.from.toLowerCase() === alice.address.toLowerCase()) {
            expectedAliceBalance = expectedAliceBalance.sub(gasFee);
          }
          if (tx.from.toLowerCase() === bob.address.toLowerCase()) {
            expectedBobBalance = expectedBobBalance.sub(gasFee);
          }
          await checkBalances(
            expectedAliceBalance,
            expectedAliceBalanceWeth,
            expectedAliceBalancePool,
            expectedBobBalance,
            expectedBobBalanceWeth,
            expectedBobBalancePool,
            expectedFeeRecipientBalance,
            expectedFeeRecipientBalanceWeth,
            expectedFeeRecipientBalancePool,
          );
        }
      });

      /*
      it('can transfer ERC1155', async () => {
        await mockERC1155.mint(alice.address, tokenId, 1);
        sell = generateOrder(alice, {
          side: Side.Sell,
          tokenId,
          amount: 1,
          collection: mockERC1155.address,
          matchingPolicy: matchingPolicies.StandardPolicyERC1155.address,
        });
        buy = generateOrder(bob, {
          side: Side.Buy,
          tokenId,
          amount: 1,
          collection: mockERC1155.address,
          matchingPolicy: matchingPolicies.StandardPolicyERC1155.address,
        });
        sellInput = await sell.pack();
        buyInput = await buy.pack();

        await waitForTx(exchange.execute(sellInput, buyInput));

        expect(await mockERC1155.balanceOf(bob.address, tokenId)).to.be.equal(1);
        expectedAliceBalanceWeth = aliceBalanceWeth.add(priceMinusFee),
        expectedBobBalanceWeth = bobBalanceWeth.sub(price),
        expectedFeeRecipientBalanceWeth = feeRecipientBalanceWeth.add(fee),
      });
      */
      describe('approval', () => {
        it('should revert if Exchange is not approved by ExecutionDelegate', async () => {
          await executionDelegate.connect(admin).denyContract(exchange.address);
          await expect(
            exchange.execute(sellInput, buyInput),
          ).to.be.revertedWith('Contract is not approved to make transfers');
        });
        it('should succeed if approval is given', async () => {
          await executionDelegate
            .connect(admin)
            .approveContract(exchange.address);
          tx = await waitForTx(exchange.execute(sellInput, buyInput));

          expect(await mockERC721.ownerOf(tokenId)).to.be.equal(bob.address);
          expectedAliceBalancePool = aliceBalancePool.add(priceMinusFee);
          expectedBobBalancePool = bobBalancePool.sub(price);
          expectedFeeRecipientBalancePool = feeRecipientBalancePool.add(fee);
        });
        it('should revert if user revokes approval from ExecutionDelegate', async () => {
          await executionDelegate.connect(alice).revokeApproval();
          await expect(
            exchange.execute(sellInput, buyInput),
          ).to.be.revertedWith('User has revoked approval');
        });
        it('should succeed if user grants approval to ExecutionDelegate', async () => {
          await executionDelegate.connect(alice).grantApproval();
          await updateBalances();
          tx = await waitForTx(exchange.execute(sellInput, buyInput));

          expect(await mockERC721.ownerOf(tokenId)).to.be.equal(bob.address);
          expectedAliceBalancePool = aliceBalancePool.add(priceMinusFee);
          expectedBobBalancePool = bobBalancePool.sub(price);
          expectedFeeRecipientBalancePool = feeRecipientBalancePool.add(fee);
        });
      });

      it('should revert with ERC20 not WETH', async () => {
        sell.parameters.paymentToken = mockERC721.address;
        buy.parameters.paymentToken = mockERC721.address;
        sellInput = await sell.pack();
        buyInput = await buy.pack();

        await expect(exchange.execute(sellInput, buyInput)).to.be.revertedWith(
          'Invalid payment token',
        );
      });
      it('should revert if _execute is called externally', async () => {
        await expect(exchange._execute(sellInput, buyInput)).to.be.revertedWith(
          'This function should not be called directly',
        );
      });

      describe('buyer is taker', () => {
        beforeEach(async () => {
          exchange = exchange.connect(bob);
          sell = generateOrder(alice, {
            side: Side.Sell,
            tokenId,
            paymentToken: ZERO_ADDRESS,
          });
          buy = generateOrder(bob, { side: Side.Buy, tokenId, paymentToken: ZERO_ADDRESS });
          sellInput = await sell.pack();
          buyInput = await buy.packNoSigs();
        });
        it('paymentToken is ETH', async () => {
          tx = await waitForTx(
            exchange.execute(sellInput, buyInput, { value: price }),
          );

          expect(await mockERC721.ownerOf(tokenId)).to.be.equal(bob.address);
          expectedAliceBalance = aliceBalance.add(priceMinusFee);
          expectedBobBalance = bobBalance.sub(price);
          expectedFeeRecipientBalance = feeRecipientBalance.add(fee);
        });
        it('paymentToken is ETH; insufficient funds', async () => {
          await expect(
            exchange.execute(sellInput, buyInput, { value: price.sub(1) }),
          ).to.be.reverted;
        });
        it('paymentToken is WETH', async () => {
          sell.parameters.paymentToken = weth.address;
          buy.parameters.paymentToken = weth.address;
          sellInput = await sell.pack();
          buyInput = await buy.packNoSigs();

          tx = await waitForTx(exchange.execute(sellInput, buyInput));

          expect(await mockERC721.ownerOf(tokenId)).to.be.equal(bob.address);
          expectedAliceBalanceWeth = aliceBalanceWeth.add(priceMinusFee);
          expectedBobBalanceWeth = bobBalanceWeth.sub(price);
          expectedFeeRecipientBalanceWeth = feeRecipientBalanceWeth.add(fee);
        });
        it('paymentToken is WETH; insufficient funds', async () => {
          const newPrice = price.add(1);
          sell.parameters.paymentToken = weth.address;
          buy.parameters.paymentToken = weth.address;
          sell.parameters.price = newPrice;
          buy.parameters.price = newPrice;
          sellInput = await sell.packNoSigs();
          buyInput = await buy.pack();

          await expect(exchange.execute(sellInput, buyInput)).to.be.reverted;
        });
      });
      describe('seller is taker', () => {
        before(async () => {
          exchange = exchange.connect(alice);
          sellInput = await sell.packNoSigs();
          buyInput = await buy.pack();
        });
        it('paymentToken is WETH', async () => {
          sell.parameters.paymentToken = weth.address;
          buy.parameters.paymentToken = weth.address;
          sellInput = await sell.packNoSigs();
          buyInput = await buy.pack();
          tx = await waitForTx(exchange.execute(sellInput, buyInput));

          expect(await mockERC721.ownerOf(tokenId)).to.be.equal(bob.address);
          expectedAliceBalanceWeth = aliceBalanceWeth.add(priceMinusFee);
          expectedBobBalanceWeth = bobBalanceWeth.sub(price);
          expectedFeeRecipientBalanceWeth = feeRecipientBalanceWeth.add(fee);
        });
        it('paymentToken is WETH; insufficient funds', async () => {
          const newPrice = bobBalanceWeth.add(1);
          sell.parameters.price = newPrice;
          sell.parameters.paymentToken = weth.address;
          buy.parameters.price = newPrice;
          buy.parameters.paymentToken = weth.address;
          sellInput = await sell.packNoSigs();
          buyInput = await buy.pack();
          await expect(exchange.execute(sellInput, buyInput)).to.be.reverted;
        });
        it('paymentToken is ETH', async () => {
          tx = await waitForTx(exchange.execute(sellInput, buyInput));

          expect(await mockERC721.ownerOf(tokenId)).to.be.equal(bob.address);
          expectedAliceBalancePool = aliceBalancePool.add(priceMinusFee);
          expectedBobBalancePool = bobBalancePool.sub(price);
          expectedFeeRecipientBalancePool = feeRecipientBalancePool.add(fee);
        });
        it('paymentToken is ETH; insufficient funds', async () => {
          const newPrice = bobBalance.add(1);
          sell.parameters.price = newPrice;
          buy.parameters.price = newPrice;
          sellInput = await sell.packNoSigs();
          buyInput = await sell.pack();
          await expect(exchange.execute(sellInput, buyInput)).to.be.reverted;
        });
      });
      describe('cancel', () => {
        it('should not cancel if not user', async () => {
          await expect(exchange.connect(alice).cancelOrder(buy.parameters)).to
            .be.reverted;
        });
        it('can cancel order', async () => {
          await exchange.connect(bob).cancelOrder(buy.parameters);
          await expect(
            exchange.execute(sellInput, buyInput),
          ).to.be.revertedWith('Buy has invalid parameters');
        });
        it('can cancel bulk listing', async () => {
          sellInput = await sell.packBulk(otherOrders);
          await exchange.connect(alice).cancelOrder(sell.parameters);
          await expect(
            exchange.execute(sellInput, buyInput),
          ).to.be.revertedWith('Sell has invalid parameters');
        });
        it('can cancel multiple orders', async () => {
          const buy1 = generateOrder(bob, { side: Side.Buy, tokenId, salt: 1 });
          const buy2 = generateOrder(bob, { side: Side.Buy, tokenId, salt: 2 });
          const buyInput1 = await buy1.pack();
          const buyInput2 = await buy2.pack();
          await exchange
            .connect(bob)
            .cancelOrders([buy1.parameters, buy2.parameters]);
          await expect(
            exchange.execute(sellInput, buyInput1),
          ).to.be.revertedWith('Buy has invalid parameters');
          await expect(
            exchange.execute(sellInput, buyInput2),
          ).to.be.revertedWith('Buy has invalid parameters');
        });
        it('cancel all previous orders and match with new nonce', async () => {
          await waitForTx(exchange.connect(alice).incrementNonce());
          await waitForTx(exchange.connect(bob).incrementNonce());
          sellInput = await sell.pack();
          buyInput = await buy.pack();
          await updateBalances();

          tx = await waitForTx(exchange.execute(sellInput, buyInput));

          expect(await mockERC721.ownerOf(tokenId)).to.be.equal(bob.address);
          expectedAliceBalancePool = aliceBalancePool.add(priceMinusFee);
          expectedBobBalancePool = bobBalancePool.sub(price);
          expectedFeeRecipientBalancePool = feeRecipientBalancePool.add(fee);
        });
        it('should not match with wrong order nonce sell', async () => {
          await waitForTx(exchange.connect(alice).incrementNonce());
          await expect(
            exchange.connect(bob).execute(sellInput, buyInput),
          ).to.be.revertedWith('Sell failed authorization');
        });
        it('should not match with wrong order nonce buy', async () => {
          await waitForTx(exchange.connect(bob).incrementNonce());
          await expect(
            exchange.execute(sellInput, buyInput),
          ).to.be.revertedWith('Buy failed authorization');
        });
        it('should revert if closed', async () => {
          await waitForTx(exchange.connect(admin).close());
          await expect(
            exchange.execute(sellInput, buyInput),
          ).to.be.revertedWith('Closed');
        });
        it('should succeed if reopened', async () => {
          await waitForTx(exchange.connect(admin).open());

          tx = await waitForTx(exchange.execute(sellInput, buyInput));

          expect(await mockERC721.ownerOf(tokenId)).to.be.equal(bob.address);
          expectedAliceBalancePool = aliceBalancePool.add(priceMinusFee);
          expectedBobBalancePool = bobBalancePool.sub(price);
          expectedFeeRecipientBalancePool = feeRecipientBalancePool.add(fee);
        });
      });

      it('random sends tx with WETH', async () => {
        await waitForTx(exchange.execute(sellInput, buyInput));

        expect(await mockERC721.ownerOf(tokenId)).to.be.equal(bob.address);
        expectedAliceBalanceWeth = aliceBalanceWeth.add(priceMinusFee);
        expectedBobBalanceWeth = bobBalanceWeth.sub(price);
        expectedFeeRecipientBalanceWeth = feeRecipientBalanceWeth.add(fee);
      });

      describe('reverts', () => {
        it("should revert if seller doesn't own token", async () => {
          await mockERC721
            .connect(alice)
            .transferFrom(alice.address, bob.address, tokenId);
          await expect(exchange.execute(sellInput, buyInput)).to.be.reverted;
        });
        it('should revert with invalid parameters sell', async () => {
          await waitForTx(exchange.connect(bob).cancelOrder(buy.parameters));
          await expect(
            exchange.execute(sellInput, buyInput),
          ).to.be.revertedWith('Buy has invalid parameters');
        });
        it('should revert with invalid parameters buy', async () => {
          await waitForTx(exchange.connect(bob).cancelOrder(buy.parameters));
          await expect(
            exchange.execute(sellInput, buyInput),
          ).to.be.revertedWith('Buy has invalid parameters');
        });
        it('should revert with invalid signatures sell', async () => {
          sellInput = await sell.pack({ signer: bob });
          await expect(
            exchange.connect(bob).execute(sellInput, buyInput),
          ).to.be.revertedWith('Sell failed authorization');
        });
        it('should revert with invalid signatures buy', async () => {
          buyInput = await buy.pack({ signer: alice });
          await expect(
            exchange.execute(sellInput, buyInput),
          ).to.be.revertedWith('Buy failed authorization');
        });
        it('should revert if orders cannot be matched', async () => {
          sell.parameters.price = BigNumber.from('1');
          sellInput = await sell.pack();

          await expect(
            exchange.connect(bob).execute(sellInput, buyInput),
          ).to.be.revertedWith('Orders cannot be matched');
        });
        it('should revert policy is not whitelisted', async () => {
          sell.parameters.matchingPolicy = ZERO_ADDRESS;
          buy.parameters.matchingPolicy = ZERO_ADDRESS;
          sellInput = await sell.pack();
          buyInput = await buy.packNoSigs();

          await expect(
            exchange.connect(bob).execute(sellInput, buyInput),
          ).to.be.revertedWith('Policy is not whitelisted');
        });
        it('should revert if fee rates exceed 10000', async () => {
          sell.parameters.fees.push({
            rate: 9701,
            recipient: thirdParty.address,
          });
          sellInput = await sell.pack();

          await expect(exchange.connect(bob).execute(sellInput, buyInput)).to.be
            .reverted;
        });
      });
      it('should not match filled order sell', async () => {
        await waitForTx(exchange.execute(sellInput, buyInput));
        await expect(exchange.execute(sellInput, buyInput)).to.be.revertedWith(
          'Sell has invalid parameters',
        );
      });
      it('should not match filled order buy', async () => {
        await waitForTx(exchange.execute(sellInput, buyInput));
        sell = generateOrder(alice, {
          side: Side.Sell,
          tokenId,
          salt: 1,
        });
        sellInput = await sell.pack();
        await expect(exchange.execute(sellInput, buyInput)).to.be.revertedWith(
          'Buy has invalid parameters',
        );
      });
    });

    describe('bulk', async () => {
      let executions: any[];
      let successfulOrders: any[];
      let value: BigNumber;
      beforeEach(async () => {
        await updateBalances();

        const _executions = [];
        const _successfulOrders = [];
        value = BigNumber.from(0);
        tokenId += 5;
        for (let i = tokenId; i < tokenId + 5; i++) {
          await mockERC721.mint(alice.address, i);
          const _sell = generateOrder(alice, {
            side: Side.Sell,
            tokenId: i,
            paymentToken: ZERO_ADDRESS,
          });
          const _buy = generateOrder(bob, {
            side: Side.Buy,
            tokenId: i,
            paymentToken: ZERO_ADDRESS,
          });
          fee = price.mul(feeRate).div(INVERSE_BASIS_POINT);
          _successfulOrders.push({
            tokenId: i,
            price,
          });
          _executions.push({
            sell: await _sell.packNoOracleSig(),
            buy: await _buy.packNoSigs(),
          });
          value = value.add(price);
        }
        executions = _executions;
        successfulOrders = _successfulOrders;
      });

      afterEach(async () => {
        let totalPrice = BigNumber.from(0);
        let valueMinusFee = BigNumber.from(0);
        let totalFee = BigNumber.from(0);
        successfulOrders.forEach(async ({ tokenId, price }) => {
          totalPrice = totalPrice.add(price);
          const _fee = price.mul(feeRate).div(INVERSE_BASIS_POINT);
          totalFee = totalFee.add(_fee);

          expect(await mockERC721.ownerOf(tokenId)).to.be.equal(bob.address);
        });
        valueMinusFee = totalPrice.sub(totalFee);
        const gasFee = tx.gasUsed.mul(tx.effectiveGasPrice);
        await checkBalances(
          aliceBalance.add(valueMinusFee),
          aliceBalanceWeth,
          aliceBalancePool,
          bobBalance.sub(totalPrice).sub(gasFee),
          bobBalanceWeth,
          bobBalancePool,
          feeRecipientBalance.add(totalFee),
          feeRecipientBalanceWeth,
          feeRecipientBalancePool,
        );
      });

      it('buyer sends bulk tx with ETH', async () => {
        tx = await waitForTx(
          exchange.connect(bob).bulkExecute(executions, { value }),
        );
      });
      it('buyer sends bulk tx with ETH; with one order unavailable', async () => {
        await waitForTx(
          exchange.connect(bob).execute(executions[0].sell, executions[0].buy, {
            value: successfulOrders[0].price,
          }),
        );
        await updateBalances();
        successfulOrders = successfulOrders.slice(1);
        tx = await waitForTx(
          exchange.connect(bob).bulkExecute(executions, { value }),
        );
      });
      it('buyer sends bulk tx with ETH; with insufficient funds', async () => {
        successfulOrders = successfulOrders.slice(
          0,
          successfulOrders.length - 1,
        );
        tx = await waitForTx(
          exchange
            .connect(bob)
            .bulkExecute(executions, { value: value.sub(1) }),
        );
      });
    });

    describe('pool', () => {
      beforeEach(async () => {
        await updateBalances();
      });
      it("can't call transferFrom", async () => {
        await expect(
          pool.connect(alice).transferFrom(bob.address, alice.address, 1)
        ).to.be.reverted;
      });
      it('can deposit', async () => {
        await waitForTx(pool.connect(alice).deposit({ value: '1' }));
        expect(await pool.balanceOf(alice.address)).to.be.equal(aliceBalancePool.add(1));
        await waitForTx(alice.sendTransaction({
          to: pool.address,
          value: '0x1',
        }));
        expect(await pool.balanceOf(alice.address)).to.be.equal(aliceBalancePool.add(2));
      });
      it('can withdraw', async () => {
        const tx = await waitForTx(pool.connect(alice).withdraw('1'));
        const gasFee = tx.gasUsed.mul(tx.effectiveGasPrice);
        expect(await pool.balanceOf(alice.address)).to.be.equal(aliceBalancePool.sub(1));
        expect(await alice.getBalance()).to.be.equal(aliceBalance.add(1).sub(gasFee));
      });
      it("can't transfer more than balance", async () => {
        await hre.network.provider.request({
          method: 'hardhat_impersonateAccount',
          params: [exchange.address],
        });
        await setBalance(exchange.address, '0xfffffffffffffffffffffffffffffffffffffff');
        const signer = await hre.ethers.getSigner(exchange.address);
        await expect(
          pool.connect(signer).transferFrom(bob.address, alice.address, aliceBalancePool.add(1))
        ).to.be.reverted;
      });
      it("can't transfer to zero address", async () => {
        await setBalance(exchange.address, '0xfffffffffffffffffffffffffffffffffffffff');
        const signer = await hre.ethers.getImpersonatedSigner(exchange.address);
        await expect(
          pool.connect(signer).transferFrom(bob.address, ZERO_ADDRESS, 1)
        ).to.be.reverted;
      });
    });
  };
}
