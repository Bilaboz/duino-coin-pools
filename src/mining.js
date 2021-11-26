/* Duino-Coin Mining handler
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2021 Duino-Coin community */

const XXH = require('xxhashjs');
const crypto = require('crypto');
const bans = require('../config/bans.json');
const kolka = require('./kolka');
const fs = require('fs');

const chalk = require('chalk');
const info = chalk.blue;

const {
    poolName,
    maxWorkers,
    blockReward,
    preGenJobCount,
    initialBlockHash,
    blockProbability,
    expectedSharetime,
    jobGenerationDelay,
    updateMinersStatsEvery,
} = require('../config/config.json');

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

function getDiff(poolRewards, textDiff) {
    let {
        difficulty
    } = poolRewards[textDiff];
    return difficulty;
}

function checkWorkers(ipWorkers, usrWorkers, serverMiners) {
    if (maxWorkers <= 0)
        return false;

    if (Math.max(ipWorkers, usrWorkers, serverMiners) > maxWorkers) {
        return true;
    }
    return false;
}

function receiveData(conn) {
    return new Promise((resolve) => {
        conn.on('data', function listener(data) {
            conn.removeListener('data', listener);
            resolve(data.trim());
        })
    })
}

function getRand(max) {
    try {
        return crypto.randomInt(max);
    } catch (err) {
        console.log(err);
        return Math.floor(Math.random() * max);
    }
};

async function miningHandler(conn, data, mainListener, usingXxhash, usingAVR) {
    let job,
    random,
    newHash,
    reqDifficulty,
    sharetime,
    this_miner_chipid;
    let serverMiners = 0;
    let isFirstShare = true;
    let overrideDifficulty = '';
    let acceptedShares = 1,
    rejectedShares = 0;
    const username = data[1];
    conn.username = username;
    conn.this_miner_id = 1;

    // remove the main listener to not re-trigger miningHandler()
    conn.removeListener('data', mainListener);
    while (true) {
        try {
            serverMinersFile = require('../config/serverMiners.json');
            if (serverMinersFile[conn.username])
                serverMiners = serverMinersFile[conn.username]["w"];
        } catch (err) {
            console.log(err);
        }

        if (isFirstShare) {
            if (usingXxhash) {
                reqDifficulty = 'XXHASH';
            } else {
                reqDifficulty = data[2] ? data[2] : 'NET';
            }

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

            minernum = Math.max(
                    usrWorkers[conn.username],
                    workers[conn.remoteAddress],
                    serverMiners) + 1
                if (minernum > 4) {
                    // Nov 2021 update - start counting from the 4th miner
                    conn.this_miner_id = minernum - 4
                }
        } else {
            data = await receiveData(conn);
            data = data.split(',');

            if (data[1] != conn.username) {
                conn.write(`451 Unavailable For Legal Reasons\n`);
                return conn.destroy();
            }

            if (overrideDifficulty) {
                reqDifficulty = overrideDifficulty;
            } else if (usingAVR) {
                reqDifficulty = 'AVR';
            } else {
                reqDifficulty = data[2] ? data[2] : 'NET';
            }
        }

        if (conn.remoteAddress != '127.0.0.1') {
            if (await checkWorkers(workers[conn.remoteAddress], usrWorkers[conn.username], serverMiners)) {
                conn.write(`BAD,Too many workers - current limit: ${maxWorkers}\n`);
                return conn.destroy();
            }
        } else {
            if (await checkWorkers(0, usrWorkers[conn.username], serverMiners)) {
                conn.write(`BAD,Too many workers - current limit: ${maxWorkers}\n`);
                return conn.destroy();
            }
        }

        poolRewards = require('../config/poolRewards.json');
        if (!poolRewards.hasOwnProperty(reqDifficulty))
            reqDifficulty = 'NET';
        let diff = getDiff(poolRewards, reqDifficulty);

        if (!isFirstShare && (diff > getDiff(poolRewards, 'ESP32'))) {
            diff = kolka.V3(sharetime, expectedSharetime, diff);
        }

        let sentTimestamp = 0,
        answer = "",
        i = 0,
        job = [];

        random = getRand(diff * 100) + 1;
        if (usingXxhash) {
            newHash = XXH.h64(lastBlockhash + random, 2811).toString(16);
        } else {
            const shasum = crypto.createHash('sha1');
            shasum.update(lastBlockhash + random);
            newHash = shasum.digest('hex');
        }
        while (i < 3) {
            job = [lastBlockhash, newHash.toString(), diff];
            conn.write(job.toString());
            sentTimestamp = new Date().getTime();

            if (diff <= getDiff(poolRewards, 'ESP32'))
                conn.setTimeout(45000);
            else
                conn.setTimeout(160000);
            answer = await receiveData(conn);
            conn.setTimeout(20000);

            if (!answer.includes("JOB"))
                break;
            i += 1;
        }
        answer = answer.split(',');

        if (usingAVR) {
            miner_res = parseInt(answer[0], 2);
        } else {
            miner_res = parseInt(answer[0]);
        }

        sharetime = (new Date().getTime() - sentTimestamp) / 1000;
        reportedHashrate = parseFloat(answer[1]);
        hashrate_calc = random / sharetime;

        hashrateIsEstimated = false;
        hashrate = hashrate_calc;
        if (!reportedHashrate) {
            hashrateIsEstimated = true;
        } else {
            hashrate = reportedHashrate;
        }

        if (isFirstShare) {
            this_miner_chipid = answer[4]
        }

        isFirstShare = false;
        reward_div = poolRewards[reqDifficulty]['reward'];
        maxHashrate = poolRewards[reqDifficulty]['max_hashrate'];
        minHashrate = poolRewards[reqDifficulty]['min_hashrate'];
        reward = 0;

        if (hashrate < minHashrate) {
            overrideDifficulty = kolka.V2_REVERSE(reqDifficulty);
            rejectedShares++;
            conn.write('BAD,Incorrect difficulty\n');
        } else if (hashrate >= maxHashrate) {
            overrideDifficulty = kolka.V2(reqDifficulty);
            rejectedShares++;
            conn.write('BAD,Incorrect difficulty\n');
        } else if (miner_res === random) {
            acceptedShares++;

            if (acceptedShares > 5) {
                if (diff <= getDiff(poolRewards, 'ESP32')) {
                    if (!this_miner_chipid) {
                        rejectedShares++;
                    } else if (answer[4] != this_miner_chipid) {
                        rejectedShares++;
                    } else {
                        reward = kolka.V1(hashrate, diff, conn.this_miner_id, reward_div);
                        acceptedShares++;
                    }
                } else {
                    reward = kolka.V1(hashrate, diff, conn.this_miner_id, reward_div);
                }
            }

            if (Math.floor((Math.random() * blockProbability)) === 1) {
                reward += blockReward;

                const blockInfos = {
                    timestamp: Date.now(),
                    finder: conn.username,
                    amount: reward,
                    algo: usingXxhash ? 'XXHASH' : 'DUCO-S1',
                    hash: newHash.toString()
                }

                globalBlocks.push(blockInfos);
                console.log(`${poolName}: ${new Date().toLocaleString()}` + info(` Block found by ${conn.username}`))
                conn.write('BLOCK\n');
            } else
                conn.write('GOOD\n');
        } else {
            rejectedShares++;
            conn.write('BAD,Incorrect result\n');
        }

        if (acceptedShares > 0 &&
            acceptedShares % updateMinersStatsEvery === 0) {
            if (balancesToUpdate[conn.username])
                balancesToUpdate[conn.username] += reward;
            else
                balancesToUpdate[conn.username] = reward;

            let minerName = "",
            rigIdentifier = "",
            wallet_id = null;

            try {
                minerName = answer[2].match(/[A-Za-z0-9 .()-]+/g).join(' ');
            } catch (err) {
                miner_name = 'Unknown miner';
            }

            try {
                wallet_id = parseInt(answer[5]);
            } catch (err) {
                wallet_id = "None";
            }

            try {
                rigIdentifier = answer[3].match(/[A-Za-z0-9 .()-]+/g).join(' ');
            } catch (err) {
                rigIdentifier = 'None';
            }

            const minerStats = {
                'u': conn.username,
                'h': hashrateIsEstimated ? hashrate : reportedHashrate,
                's': sharetime,
                'a': acceptedShares,
                'r': rejectedShares,
                'al': usingXxhash ? 'XXHASH' : 'DUCO-S1',
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
