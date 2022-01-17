/* Duino-Coin Mining handler
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2021 Duino-Coin community */

const crypto = require('crypto');
const kolka = require('./kolka');
const log = require("./logging");
const {
    poolName,
    maxWorkers,
    blockReward,
    initialBlockHash,
    updateMinersStatsEvery,
} = require('../config/config.json');
const poolRewards = require("../config/poolRewards.json");

let lastBlockhash = initialBlockHash;
globalBlocks = [];
let workers = {};
let usrWorkers = {};
let minersStats = {};
let balancesToUpdate = {};
let globalShares = {
    increase: 0,
    total: 0
};

const getDiff = (poolRewards, textDiff) => {
    try {
        let { difficulty } = poolRewards[textDiff];
        return difficulty;
    } catch(err) { console.log(err) };
}

const checkWorkers = (ipWorkers, usrWorkers, serverMiners) => {
    if (maxWorkers <= 0)
        return false;

    if (Math.max(ipWorkers, usrWorkers, serverMiners) > maxWorkers) {
        return true;
    }
    return false;
}

const receiveData = (conn) => {
    return new Promise((resolve) => {
        conn.on('data', function listener(data) {
            conn.removeListener('data', listener);
            resolve(data.trim());
        })
    })
}

const getRand = (max) => {
    try {
        return crypto.randomInt(max);
    } catch (err) {
        console.log(err);
        return Math.floor(Math.random() * max);
    }
}

const miningHandler = async (conn, data, mainListener, usingXxhash, usingAVR) => {
    let random, newHash, reqDifficulty;
    let sharetime, this_miner_chipid;

    conn.isFirstShare = true;
    conn.acceptedShares = 0;
    conn.rejectedShares = 0;

    const username = data[1];
    conn.username = username;
    conn.serverMiners = 0
    conn.this_miner_id = 1;
    conn.verified = "no";

    // remove the main listener to not re-trigger miningHandler()
    conn.removeListener('data', mainListener);
    while (true) {
        conn.reject_shares = false;
        conn.donate = false;

        if (conn.isFirstShare) {
            reqDifficulty = data[2] ? data[2] : 'NET';

            if (workers[conn.remoteAddress]) {
                workers[conn.remoteAddress] += 1;
            } else {
                workers[conn.remoteAddress] = 1;
            }

            if (usrWorkers[conn.username]) {
                usrWorkers[conn.username] += 1;
            } else {
                usrWorkers[conn.username] = 1;
            }

            if (conn.remoteAddress != "127.0.0.1") {
                conn.this_miner_id = Math.max(
                        usrWorkers[conn.username],
                        workers[conn.remoteAddress],
                        conn.serverMiners) + 1
            } else {
                conn.this_miner_id = Math.max(
                        usrWorkers[conn.username],
                        0, conn.serverMiners) + 1
            }
        } else {
            data = await receiveData(conn);
            data = data.split(',');
            /*if (data[1] != conn.username) {
                if (data[1] == "DONATE") {
                    conn.donate = true;
                }
                else {
                    conn.donate = false;
                }
            }*/

            if (conn.overrideDifficulty) {
                reqDifficulty = conn.overrideDifficulty;
            } else if (usingAVR) {
                reqDifficulty = 'AVR';
            } else {
                reqDifficulty = data[2] ? data[2] : 'NET';
            }
        }

        if (conn.verified == "yes") {
            if (conn.remoteAddress != '127.0.0.1') {
                if (await checkWorkers(workers[conn.remoteAddress], usrWorkers[conn.username], conn.serverMiners)) {
                    conn.reject_shares = "Too many workers";
                }
            } else {
                if (await checkWorkers(0, usrWorkers[conn.username], conn.serverMiners)) {
                    conn.reject_shares = "Too many workers";
                }
            }
        } else {
            if (conn.remoteAddress != '127.0.0.1') {
                if (await checkWorkers(workers[conn.remoteAddress] * 2, usrWorkers[conn.username] * 2, conn.serverMiners * 2)) {
                    conn.reject_shares = "Too many workers";
                }
            } else {
                if (await checkWorkers(0, usrWorkers[conn.username] * 2, conn.serverMiners * 2)) {
                    conn.reject_shares = "Too many workers";
                }
            }
        }

        if (conn.this_miner_id > Math.max(workers[conn.remoteAddress], usrWorkers[conn.username], conn.serverMiners)) {
            conn.this_miner_id = Math.max(workers[conn.remoteAddress], usrWorkers[conn.username], conn.serverMiners);
        }

        if (!poolRewards.hasOwnProperty(reqDifficulty))
            reqDifficulty = 'NET';

        let diff = getDiff(poolRewards, reqDifficulty);

        if (!conn.isFirstShare && (diff > getDiff(poolRewards, 'ESP32'))) {
            diff = kolka.V3(sharetime, expectedSharetime, diff);
        }

        random = getRand(diff * 100) + 1;

        const shasum = crypto.createHash('sha1');
        shasum.update(lastBlockhash + random);
        newHash = shasum.digest('hex');

        let job = [lastBlockhash, newHash.toString(), diff];
        conn.write(job.toString() + "\n");
        let sentTimestamp = new Date().getTime();

        if (diff <= getDiff(poolRewards, 'ESP32'))
            conn.setTimeout(45000);
        else
            conn.setTimeout(160000);
        let answer = await receiveData(conn);
        answer = answer.split(',');

        if (usingAVR) {
            miner_res = parseInt(answer[0], 2);
        } else {
            miner_res = parseInt(answer[0]);
        }

        sharetime = (new Date().getTime() - sentTimestamp) / 1000;
        reportedHashrate = parseFloat(answer[1]);
        hashrate_calc = random / sharetime;

        if (Math.abs(reportedHashrate - hashrate_calc) > 50000) {
            conn.reject_share = "Modified hashrate";
        }

        hashrateIsEstimated = false;
        hashrate = hashrate_calc;
        if (!reportedHashrate) 
            hashrateIsEstimated = true;
        else 
            hashrate = reportedHashrate;

        if (conn.isFirstShare) 
            this_miner_chipid = answer[4]

        conn.isFirstShare = false;
        reward_div = poolRewards[reqDifficulty]['reward'];
        maxHashrate = poolRewards[reqDifficulty]['max_hashrate'];
        minHashrate = poolRewards[reqDifficulty]['min_hashrate'];
        expectedSharetime = poolRewards[reqDifficulty]["expected_sharetime"];
        blockProbability = poolRewards[reqDifficulty]["block_chance"];
        reward = 0;

        if (hashrate < minHashrate) {
            conn.overrideDifficulty = kolka.V2_REVERSE(reqDifficulty);
            conn.rejectedShares++;
            conn.write('BAD,Incorrect difficulty\n');
        } else if (hashrate >= maxHashrate) {
            conn.overrideDifficulty = kolka.V2(reqDifficulty);
            conn.rejectedShares++;
            conn.write('BAD,Incorrect difficulty\n');
        } else if (miner_res === random && !conn.reject_shares) {
            conn.acceptedShares++;

            if (conn.acceptedShares > 5) {
                if (diff <= getDiff(poolRewards, 'ESP32')) {
                    if (!this_miner_chipid) {
                        conn.rejectedShares++;
                    } else if (answer[4] != this_miner_chipid) {
                        conn.rejectedShares++;
                    } else {
                        reward = kolka.V1(hashrate_calc, diff, conn.this_miner_id, reward_div);
                        conn.acceptedShares++;
                    }
                } else {
                    reward = kolka.V1(hashrate_calc, diff, conn.this_miner_id, reward_div);
                }
            }

            if (Math.floor((Math.random() * blockProbability)) === 1) {
                reward += blockReward;

                const blockInfos = {
                    timestamp: Date.now(),
                    finder: conn.username,
                    amount: reward,
                    algo: 'DUCO-S1',
                    hash: newHash.toString()
                }

                globalBlocks.push(blockInfos);
                log.info(`Block found by ${conn.username}`);
                conn.write('BLOCK\n');
            } else
                conn.write('GOOD\n');
        } else if (miner_res === random && conn.reject_shares) {
            conn.rejectedShares++;
            conn.write(`BAD,${conn.reject_shares}\n`);
        } else {
            conn.rejectedShares++;
            conn.write('BAD,Incorrect result\n');
        }

        if (conn.acceptedShares > 0 && conn.acceptedShares % updateMinersStatsEvery === 0) {
            if (balancesToUpdate[conn.username])
                balancesToUpdate[conn.username] += reward;
            else
                balancesToUpdate[conn.username] = reward;

            let minerName;
            try {
                minerName = answer[2].match(/[A-Za-z0-9 .()-]+/g).join(' ');
            } catch (err) {
                miner_name = 'Unknown miner';
            }

            let wallet_id;
            try {
                wallet_id = parseInt(answer[5]);
            } catch (err) {
                wallet_id = "None";
            }

            let rigIdentifier;
            try {
                rigIdentifier = answer[3].match(/[A-Za-z0-9 .()-]+/g).join(' ');
            } catch (err) {
                rigIdentifier = 'None';
            }

            const minerStats = {
                'u': conn.username,
                'h': hashrateIsEstimated ? hashrate : reportedHashrate,
                's': sharetime,
                'a': conn.acceptedShares,
                'r': conn.rejectedShares,
                'al': 'DUCO-S1',
                'd': diff,
                'p': poolName,
                'sft': minerName,
                'id': rigIdentifier,
                't': Math.floor(new Date() / 1000),
                'wd': wallet_id,
                'c': conn.this_miner_id,
            }

            minersStats[conn.id] = minerStats;

            lastBlockhash = newHash;
            globalShares.increase += updateMinersStatsEvery;
            globalShares.total += updateMinersStatsEvery;
        }
    }
}

module.exports = {
    miningHandler
};

module.exports.stats = {
    workers,
    usrWorkers,
    minersStats,
    balancesToUpdate,
    globalShares,
    globalBlocks
}
