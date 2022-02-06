const ethers = require('ethers');
const abi = require('@ethersproject/abi')
const Web3 = require('web3')

const bnbPricePredictionABI = require('./bnbPricePredictionV2');
const oracleABI = require('./oracle')
const MultiCallAbi = require('./Multicall.json');

const BigNumber = require('bignumber.js');
var ema = require('exponential-moving-average');
const fs = require('fs');



var unConnectedTimeCnt = 0;
const main = () => {
    // const WSS = "wss://bsc-ws-node.nariox.org:443"
    const web3 = new Web3(new Web3.providers.HttpProvider('https://speedy-nodes-nyc.moralis.io/69399f287c98c2f6a473fcb6/bsc/mainnet', { timeout: 10000 }));
    const multi = new web3.eth.Contract((MultiCallAbi), '0x52E54D127cA6474aB1C700335C4714f2515b4f3D')
    const WSS = "wss://speedy-nodes-nyc.moralis.io/db2f4bda686485fc3c0c1604/bsc/mainnet/ws"
    const Seed = "melody leg laundry height yellow uncover glimpse manual royal update ability valve";
    const UserAddress = "0x8f46a9b461Cc3a6b87CCbcE04b0c95714a45b842";
    const bnbPricePredictionAddress = '0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA';
    const oracleAddress = '0xd276fcf34d54a926773c399ebaa772c12ec394ac';
    var provider = new ethers.providers.WebSocketProvider(WSS);
    const wallet = ethers.Wallet.fromMnemonic(Seed);
    const account = wallet.connect(provider);

    const Interface = abi.Interface;
    const itf = new Interface(bnbPricePredictionABI)
    provider.removeAllListeners()

    const bnbPricePredictionContract = new ethers.Contract(
        bnbPricePredictionAddress,
        bnbPricePredictionABI,
        account
    )

    const oracleContract = new ethers.Contract(
        oracleAddress,
        oracleABI,
        account
    )


    const BidAmountPerOnce = 0.01;
    const ENVIRONMENT = 'PRODUCTION';

    var lastNumber = 0;
    var multiplier = 1;
    var endStartTime;
    var transactionHistory = [];
    var bidded = false;
    var totalEarning = 0;
    var secondProviderNotRunning = false;
    const emaPeriod = 3;
    var sample_array = [];
    var failCnt = 0;
    var skipCnt = 0;
    var prevRefDir;
    var successHistory = [];

    var skipFlag = false;
    var userBalance = 0;
    

    console.log('##########################################################################')
    console.log('##########################################################################')
    console.log('##########################################################################')
    console.log('##########################################################################')
    console.log('########################## Starting New Server ###########################')
    
    const executeBid = async () => {
        console.log('user balance is ', userBalance)
        if(userBalance < 4)
            return;
        var oraclePrice = await oracleContract.latestAnswer();
        oraclePrice = oraclePrice.toNumber() / 10 ** 8;
        var lastLockPrice = sample_array[sample_array.length - 1];
        var curResult = oraclePrice > lastLockPrice;
        successHistory.push(curResult);
        sample_array.push(oraclePrice);
        var ema_array = ema(sample_array, emaPeriod);
        var sampleLength = ema_array.length;
        var otherDir;
        var refDir;
        if(ema_array[sampleLength - 1] > ema_array[sampleLength - 2] + 0.1)
            otherDir = true;
        if(ema_array[sampleLength - 1] < ema_array[sampleLength - 2] - 0.1)
            otherDir = false;
        
        refDir = otherDir
        if(refDir == undefined)
            refDir = curResult;
        else {
            let weightOther = otherDir ? 1 : -1;
            let weightPrev = curResult ? 1 : -1;
            let weightNew = weightOther + weightPrev * failCnt / 3;
            if(weightNew > 0)
                refDir = true;
            else
                refDir = false;
        }
        console.log(ema_array[sampleLength - 1], ema_array[sampleLength - 2], oraclePrice)

        var temp_fail_cnt = failCnt;
        if(prevRefDir != undefined) {
            if(prevRefDir != curResult)
                temp_fail_cnt = failCnt + 1;
            if(prevRefDir == curResult)
                temp_fail_cnt = 0;
        }
        
        prevRefDir = refDir;

        multiplier = 2 ** temp_fail_cnt;
        if(multiplier > 16)
            multiplier = 16;
        if(refDir != undefined)
            makeBid(refDir)
    }

    const init_set = async () => {
        console.log("----------- Setting Next Bid ----------------")
        // setting next lock block
        lastNumber = await bnbPricePredictionContract.currentEpoch();
        lastNumber = lastNumber.toNumber();
        getHistory();
        console.log("----------- current round is ", lastNumber, " ----------------");
        const nextRoundData = await getCurrentRound();
        secondProviderNotRunning = true;
        setTimeout(() => {
            if(secondProviderNotRunning)
                process.exit();
        }, 10000);
        const currentBlockNumber = await provider.getBlockNumber();
        const currentBlock = await provider.getBlock(currentBlockNumber);
        secondProviderNotRunning = false;
        console.log(currentBlockNumber)
        const interval = nextRoundData['lockTimestamp'] - currentBlock['timestamp'];
        console.log('current timestamp', currentBlock['timestamp'], 'round lockTimestamp', nextRoundData['lockTimestamp'])
        setTimeout(() => {
            console.log('betting next Round')
            executeBid();
            setTimeout(() => {
                console.log('setting Next Round automatically')
                init_set();
                harvest();
            }, 60000);
        }, interval * 1000 - 14000);
        return;
    }


    const getCurrentRound = async () => {
        var RoundData = {};
        const lastBlock = await bnbPricePredictionContract.rounds(lastNumber);
        for (const key in lastBlock) {
            if (Object.hasOwnProperty.call(lastBlock, key)) {
                if (lastBlock[key] != true || isNaN(parseInt(key)))
                    RoundData[key] = (new BigNumber(lastBlock[key].toString())).toNumber();
            }
        }
        return RoundData;
    }

    const makeBid = (flag) => {
        if (bidded)
            return;
        else {
            bidded = true;
            setTimeout(() => {
                bidded = false;
                console.log('--------------- bid initialized ---------------')
            }, 30000);
        }
        if (Date.now() - endStartTime > 8000) {
            console.log("accident, betting was deplyed so I gave up");
            return;
        }
        if (ENVIRONMENT == 'PRODUCTION') {
            if (flag) {
                console.log("----- betting UP with x", multiplier, "-----");
                bnbPricePredictionContract.betBull(lastNumber, {
                    gasLimit: 300000,
                    gasPrice: 5000000000,
                    value: ethers.utils.parseEther((BidAmountPerOnce * multiplier).toString())
                }).then((result) => {
                    console.log("----- betted UP at ", result['hash'], "-----");
                    transactionHistory.push('transaction is ' + result['hash'] + ' at ' + lastNumber);
                });
            } else {
                console.log("----- betting DOWN with x", multiplier, "-----");
                bnbPricePredictionContract.betBear(lastNumber, {
                    gasLimit: 300000,
                    gasPrice: 5000000000,
                    value: ethers.utils.parseEther((BidAmountPerOnce * multiplier).toString())
                }).then((result) => {
                    console.log("----- betted DOWN at ", result['hash'], "-----");
                    transactionHistory.push('transaction is ' + result['hash'] + ' at ' + lastNumber);
                });
            }
        }
        return;
    }

    const harvest = async () => {
        var balance = await provider.getBalance(UserAddress);
        userBalance = ethers.utils.formatEther(balance);
        var prevNumber = await bnbPricePredictionContract.currentEpoch();
        prevNumber = prevNumber.toNumber();
        prevNumber -= 2;
        console.log("---------- checking harvest remain at ", prevNumber, " ----------");
        const prevLedger = await bnbPricePredictionContract.ledger(prevNumber, UserAddress);
        // console.log(prevLedger);
        if ((new BigNumber(prevLedger['amount'].toString())).toNumber() == 0)
            return;
        // reward = ledger[epoch][msg.sender].amount.mul(round.rewardAmount).div(round.rewardBaseCalAmount)
        var prevBid = prevLedger['position'] == 0;
        var prevAmount = prevLedger['amount'];
        var claimed = prevLedger['claimed'];
        var claimable = await bnbPricePredictionContract.claimable(prevNumber, UserAddress);
        claimable = claimable && !claimed;
        console.log("--------Harvesting earns at ", prevNumber);
        const prevRound = await bnbPricePredictionContract.rounds(prevNumber);
        var orgRate = prevRound['bullAmount'] / prevRound['bearAmount'];
        // var bidRate = prevBid ? 1 / orgRate : orgRate;
        var successDir = prevRound['closePrice'] > prevRound['lockPrice'];
        var rewardAmount = prevRound['rewardAmount'];
        var rewardBaseCalAmount = prevRound['rewardBaseCalAmount'];
        var reward = prevAmount * (rewardAmount / rewardBaseCalAmount) / (10 ** 18) - prevAmount / (10 ** 18);
        prevSuccess = successDir;
        fs.readFile('failCnt.txt', 'utf8', function (err, data) {
            failCnt = parseInt(data);
            console.log('fail cnt is',failCnt)
            if (prevBid == successDir) {
                totalEarning += reward;
                console.log("I bidded ", prevBid, " and success Bid is ", successDir, " so I earned ", reward, " at ", prevNumber, " total Earn is", totalEarning)
                failCnt = 0;
            } else {
                totalEarning -= prevAmount / (10 ** 18);
                console.log("I bidded ", prevBid, " and success Bid is ", successDir, " so I lost ", 1, " at ", prevNumber, "total Earn is", totalEarning)
                failCnt++
                failCnt%=4;
            }
            fs.writeFile('failCnt.txt', failCnt.toString(), (err) => {});
        });

        console.log("-----real result is ", claimable, " at ", prevNumber);
        if (claimable) {
            var result = await bnbPricePredictionContract.claim(
                [prevNumber], {
                    gasLimit: 300000,
                    gasPrice: 5000000000
                }
            );
            console.log("----- Claim done at ", result['hash'], " at ", prevNumber, "-----");
        }
        return;
    }

    const getHistory = () => {
        console.log('getting history data')
        var calls = [];
        sample_array = [];
        console.log('from', lastNumber - 500, 'to', lastNumber)
        for (let index = lastNumber - 500; index < lastNumber; index++) {
            calls.push({
                address: bnbPricePredictionAddress,
                name: 'rounds',
                params: [index],
            });
        }
        const calldata = calls.map((call) => [call.address.toLowerCase(), itf.encodeFunctionData(call.name, call.params)])
        multi.methods.aggregate(calldata).call().then(({ returnData })=>{
            console.log('getting history')
            const userHistory = returnData.map((call, i) => itf.decodeFunctionResult(calls[i].name, call));
            for (let j = 0; j < userHistory.length; j++) {
                sample_array.push(userHistory[j]['lockPrice'].toNumber() / 10 ** 8)
            }
            console.log('last lockPrice is', sample_array[sample_array.length - 1])
        });
    }
    init_set();
    harvest();
}

main();