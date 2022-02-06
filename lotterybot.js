const ethers = require('ethers');

const lotteryABI = require('./lotteryABI')
const multiABI = require('./multicall')

const fs = require('fs');

var starting = '0';

const main = async () => {
    // const WSS = "wss://bsc-ws-node.nariox.org:443"
    const WSS = "wss://speedy-nodes-nyc.moralis.io/db2f4bda686485fc3c0c1604/bsc/mainnet/ws"
    const privateKey = "";
    const lotteryAddress = '0x7ded2Ca1861E62867cE4FB14eAAd0468841e431B';
    const multiAddress = '0x52E54D127cA6474aB1C700335C4714f2515b4f3D';
    var provider = new ethers.providers.WebSocketProvider(WSS);
    const wallet = new ethers.Wallet(privateKey);
    const account = wallet.connect(provider);

    provider.removeAllListeners()

    const lotteryContract = new ethers.Contract(
        lotteryAddress,
        lotteryABI,
        account
    )

    const multilCallContract = new ethers.Contract(
        multiAddress,
        multiABI,
        account
    )
    
    const startNewRound = () => {
        const randomNumber = Math.floor(Math.random() * 1000000);
        console.log('randomNumber', randomNumber)
        lotteryContract.drawAndReset(randomNumber, {
            gasLimit: 3000000,
            gasPrice: 5000000000,
        }).then((txHash) => {
            console.log("txHash", txHash)
            provider.once(txHash?.hash, (tx)=>{
                console.log("tx", tx)
                console.log("txstatus", tx.status)
                if(tx?.status != 1) {
                    setTimeout(() => {
                        console.log('transaction failed, retrying')
                        startNewRound();
                    }, 30000);
                }
                else if(tx?.status == 1) {
                    starting = '0';
                    saveData();
                    setTimeout(() => {
                        init_set();
                    }, 60000);
                }
            })
        })
    }

    
    const saveData = () => {
        console.log("--------- saving storageData -------------");
        fs.writeFile('storage.txt', starting, (err) => {
            // throws an error, you could also catch it here
            if (err) throw err;

            // success case, the file was saved
            console.log('storageData saved!');
        });
        return;
    }

    const resotoreData = async () => {
        console.log("--------- restoring storageData -------------");
            await fs.readFile('storage.txt', 'utf8', function (err, data) {
                if (err) {
                    return console.log(err);
                }
                console.log('successfully restored');
                console.log('data', data);
                starting = data;
                if (starting == '1') {
                    console.log("breaked");
                    startNewRound();
                }
            });
        return;
    }

    const init_set = async () => {
        await resotoreData();
    
        const referTimeStamp = 1631944800;
        const currentTimeStamp = await multilCallContract.getCurrentBlockTimestamp();
        const nextTime = (3600 - (currentTimeStamp - referTimeStamp) % 3600) * 1000;
        console.log('nextTime', nextTime)
        setTimeout(() => {
            console.log('timeout')
            starting = '1';
            saveData();
            startNewRound();
        }, nextTime);
    }

    console.log("restarting");
    init_set();
}

main();