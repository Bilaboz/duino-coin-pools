/* Duino-Coin Mining handler
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2022 Duino-Coin community */

const crypto = require("crypto");
const request = require('sync-request');
const kolka = require("./kolka");
const log = require("./logging");
const {
    poolName,
    maxWorkers,
    blockReward,
    initialBlockHash,
    updateMinersStatsEvery,
    serverVersion,
    max_shares_per_minute,
} = require("../config/config.json");
const poolRewards = require("../config/poolRewards.json");
const algo = "DUCO-S1";

let lastBlockhash = initialBlockHash;
globalBlocks = [];
let workers = {};
let usrWorkers = {};
let minersStats = {};
let balancesToUpdate = {};
let globalShares = {
    increase: 0,
    total: 0,
};
if (!max_shares_per_minute) {
    let max_shares_per_minute = 70;
}

const getDiff = (poolRewards, textDiff) => {
    try {
        let { difficulty } = poolRewards[textDiff];
        return difficulty;
    } catch (err) {
        console.log(err);
    }
};

const checkWorkers = (ipWorkers, usrWorkers, serverMiners, username) => {
    if (maxWorkers <= 0) return false;

    if (Math.max(ipWorkers, usrWorkers, serverMiners) > maxWorkers) {
        /* Check if user has worker limit upgrades */
        res = request('GET', `https://server.duinocoin.com/v2/users/${username}`)
        userItems = JSON.parse(res.getBody('utf8')).result.items;

        if (userItems.includes(10) && userItems.includes(11)) {
            if (Math.max(ipWorkers, usrWorkers, serverMiners) > 125) {
                return true
            }
        } else if (userItems.includes(11)) {
            if (Math.max(ipWorkers, usrWorkers, serverMiners) > 100) {
                return true
            }
        } else if (userItems.includes(10)) {
            if (Math.max(ipWorkers, usrWorkers, serverMiners) > 75) {
                return true
            }
        } else {
            return true
        }
    }
    return false;
};

const receiveData = (conn) => {
    return new Promise((resolve) => {
        conn.on("data", function listener(data) {
            conn.removeListener("data", listener);
            resolve(data.trim());
        });
    });
};

const getRand = (max) => {
    try {
        return crypto.randomInt(max);
    } catch (err) {
        console.log(err);
        return Math.floor(Math.random() * max);
    }
};

const percDiff = (a, b) => {
    return Math.floor(100 * Math.abs((a - b) / ((a + b) / 2)));
};

const miningHandler = async (conn, data, mainListener, usingAVR) => {
    let random, newHash, reqDifficulty, miningKey;
    let this_miner_chipid, minerName, sharetime;
    let feedback_sent = 0;

    let isFirstShare = true;
    conn.acceptedShares = 0;
    conn.rejectedShares = 0;

    const username = data[1];
    conn.username = username;
    conn.serverMiners = 0;
    conn.this_miner_id = 0;
    conn.lastminshares = 0;
    conn.lastsharereset = Math.floor(new Date() / 1000);
    conn.ping = 0;

    // remove the main listener to not re-trigger miningHandler()
    conn.removeListener("data", mainListener);
    while (true) {
        conn.reject_shares = false;
        conn.donate = false;

        if (isFirstShare) {
            reqDifficulty = data[2] ? data[2] : "NET";

            if (reqDifficulty == "ESP32") worker_add = 0.5;
            else worker_add = 1;

            if (workers[conn.remoteAddress]) {
                workers[conn.remoteAddress] += worker_add;
            } else {
                workers[conn.remoteAddress] = worker_add;
            }

            if (usrWorkers[conn.username]) {
                usrWorkers[conn.username] += worker_add;
            } else {
                usrWorkers[conn.username] = worker_add;
            }

            if (conn.remoteAddress != "127.0.0.1") {
                conn.this_miner_id = Math.max(
                    usrWorkers[conn.username],
                    workers[conn.remoteAddress],
                    conn.serverMiners
                );
            } else {
                conn.this_miner_id = Math.max(
                    usrWorkers[conn.username],
                    conn.serverMiners
                );
            }
            conn.setTimeout(90 * 1000);
        } else {
            data = await receiveData(conn);
            data = data.split(",");
            conn.ping = (new Date() - feedback_sent) / 1000;

            if (data[1] != username) conn.reject_shares = "Username changed";

            if (conn.overrideDifficulty)
                reqDifficulty = conn.overrideDifficulty;
            else if (usingAVR) reqDifficulty = "AVR";
            else reqDifficulty = data[2] ? data[2] : "NET";
        }

        if (data[3]) miningKey = Buffer.from(data[3]).toString("base64");
        else miningKey = null;

        if (data[4]) {
            if (!data[4].match(/[A-Za-z0-9 .():@-]+/))
                conn.iot_reading = "Error:incorrect data";
            else if (data[4].length > 48)
                conn.iot_reading = "Error:data too long";
            else conn.iot_reading = data[4];
        } else conn.iot_reading = null;

        if (conn.remoteAddress != "127.0.0.1") {
            if (
                await checkWorkers(
                    workers[conn.remoteAddress],
                    usrWorkers[conn.username],
                    conn.serverMiners,
                    conn.username
                )
            ) {
                conn.reject_shares = "Too many workers";
            }
        } else {
            if (
                await checkWorkers(
                    0,
                    usrWorkers[conn.username],
                    conn.serverMiners,
                    conn.username
                )
            ) {
                conn.reject_shares = "Too many workers";
            }
        }

        if (
            conn.this_miner_id >
            Math.max(
                workers[conn.remoteAddress],
                usrWorkers[conn.username],
                conn.serverMiners
            )
        ) {
            conn.this_miner_id = Math.max(
                workers[conn.remoteAddress],
                usrWorkers[conn.username],
                conn.serverMiners
            );
        }

        if (!poolRewards.hasOwnProperty(reqDifficulty)) reqDifficulty = "NET";

        let diff = getDiff(poolRewards, reqDifficulty);

        if (!isFirstShare && diff > getDiff(poolRewards, "ESP8266NH")) {
            diff = kolka.V3(sharetime, expectedSharetime, diff);
        }

        random = getRand(diff * 100) + 1;

        const shasum = crypto.createHash("sha1");
        shasum.update(lastBlockhash + random);
        newHash = shasum.digest("hex");
        let job = [lastBlockhash, newHash.toString(), diff];

        conn.write(job.toString() + "\n");
        let job_sent = new Date();
        let answer = await receiveData(conn);
        let answer_received = new Date();
        answer = answer.split(",");

        sharetime = (answer_received - job_sent) / 1000;
        if (sharetime > conn.ping) {
            sharetime -= conn.ping;
        }

        reportedHashrate = parseFloat(answer[1]);
        if (reportedHashrate <= 0) {
            conn.reject_shares = "Invalid data";
        }

        if (sharetime >= 0.5) {
            hashrate_calc = random / sharetime;
        } else {
            hashrate_calc = reportedHashrate;
        }

        conn.lastminshares++;

        if (usingAVR) {
            miner_res = parseInt(answer[0], 2);
        } else {
            miner_res = parseInt(answer[0]);
        }

        /* try {
            if (diff <= getDiff(poolRewards, "ESP8266NH")) {
                const r = /[+-]?([0-9][.][0-9])+/;
                if (
                    parseFloat(answer[2].match(r)) &&
                    parseFloat(answer[2].match(r)[0]) <
                        parseFloat(serverVersion)
                ) {
                    conn.reject_shares = "Outdated miner";
                }
            }
        } catch (err) {
            conn.reject_shares = "No miner name";
        } */

        if (conn.lastminshares > max_shares_per_minute) {
            conn.reject_shares = "Too low difficulty";
        }

        hashrateIsEstimated = false;
        hashrate = hashrate_calc;
        if (!reportedHashrate) hashrateIsEstimated = true;
        else hashrate = reportedHashrate;

        if (isFirstShare) this_miner_chipid = answer[4];

        if (
            diff > getDiff(poolRewards, "DUE") &&
            diff <= getDiff(poolRewards, "ESP8266NH") &&
            percDiff(hashrate, hashrate_calc) > 15 &&
            sharetime >= 1.5
        ) {
            conn.reject_shares = "Modified hashrate";
        }

        reward_div = poolRewards[reqDifficulty]["reward"];
        maxHashrate = poolRewards[reqDifficulty]["max_hashrate"];
        minHashrate = poolRewards[reqDifficulty]["min_hashrate"];
        expectedSharetime = poolRewards[reqDifficulty]["expected_sharetime"];
        blockProbability = poolRewards[reqDifficulty]["block_chance"];
        reward = 0;

        if (conn.reject_shares) {
            conn.write(`BAD,${conn.reject_shares}\n`);
            feedback_sent = new Date();
        } else if (hashrate < minHashrate) {
            conn.overrideDifficulty = kolka.V2_REVERSE(reqDifficulty);
            conn.rejectedShares++;
            conn.write("BAD,Too high starting difficulty\n");
            feedback_sent = new Date();
        } else if (hashrate >= maxHashrate) {
            conn.overrideDifficulty = kolka.V2(reqDifficulty);
            conn.rejectedShares++;
            conn.write("BAD,Too low starting difficulty\n");
            feedback_sent = new Date();
        } else if (miner_res === random) {
            conn.acceptedShares++;
            if (conn.acceptedShares > 10) {
                if (diff <= getDiff(poolRewards, "ESP8266NH")) {
                    if (!this_miner_chipid) {
                        conn.rejectedShares++;
                    } else if (answer[4] != this_miner_chipid) {
                        conn.rejectedShares++;
                    } else {
                        reward = kolka.V1(
                            hashrate_calc,
                            diff,
                            conn.this_miner_id,
                            reward_div
                        );
                    }
                } else {
                    reward = kolka.V1(
                        hashrate_calc,
                        diff,
                        conn.this_miner_id,
                        reward_div
                    );
                }
            }

            if (Math.floor(Math.random() * blockProbability) === 1) {
                reward += blockReward;

                const blockInfos = {
                    timestamp: Date.now(),
                    finder: conn.username,
                    amount: reward,
                    algo: "DUCO-S1",
                    hash: newHash.toString(),
                };

                globalBlocks.push(blockInfos);
                log.info(`Block found by ${conn.username}`);
                conn.write("BLOCK\n");
                feedback_sent = new Date();
            } else {
                conn.write("GOOD\n");
                feedback_sent = new Date();
            }
        } else {
            conn.rejectedShares++;
            conn.write("BAD,Incorrect result\n");
            feedback_sent = new Date();
        }

        if (
            conn.acceptedShares > 0 &&
            conn.acceptedShares % updateMinersStatsEvery === 0
        ) {
            if (balancesToUpdate[conn.username])
                balancesToUpdate[conn.username] += reward;
            else balancesToUpdate[conn.username] = reward;

            try {
                minerName = answer[2].match(/[A-Za-z0-9 .()-]+/g).join(" ");
            } catch (err) {
                miner_name = "Unknown miner";
            }

            let wallet_id;
            try {
                wallet_id = parseInt(answer[5]);
            } catch (err) {
                wallet_id = "None";
            }

            let rigIdentifier;
            try {
                const cut_rigid = answer[3].split(":");

                rigIdentifier = cut_rigid[0]
                    .match(/[A-Za-z0-9 .()-]+/g)
                    .join(" ");

                if (cut_rigid[1])
                    // mining key backwards compatibility for old miners
                    miningKey = Buffer.from(cut_rigid[1]).toString("base64");
            } catch (err) {
                rigIdentifier = "None";
            }

            if (Math.floor(new Date() / 1000) - conn.lastsharereset >= 60) {
                conn.lastsharereset = Math.floor(new Date() / 1000);
                conn.lastminshares = 0;
            }

            if (conn.this_miner_id > 4) {
                kolka_drop = conn.this_miner_id - 3;
            } else {
                kolka_drop = 1;
            }

            minersStats[conn.id] = {
                u: conn.username,
                h: hashrateIsEstimated ? hashrate : reportedHashrate,
                s: sharetime,
                a: conn.acceptedShares,
                r: conn.rejectedShares,
                c: kolka_drop,
                al: algo,
                d: diff,
                p: poolName,
                sft: minerName,
                id: rigIdentifier,
                t: Math.floor(new Date() / 1000),
                wd: wallet_id,
                k: this_miner_chipid,
                pw: miningKey,
                ls: conn.lastminshares,
                it: conn.iot_reading,
                ip: conn.remoteAddress,
                pg: conn.ping,
                rw: reward,
            };
            lastBlockhash = newHash;
            globalShares.increase += updateMinersStatsEvery;
            globalShares.total += updateMinersStatsEvery;
        }

        isFirstShare = false;
    }
};

module.exports = {
    miningHandler,
};

module.exports.stats = {
    workers,
    usrWorkers,
    minersStats,
    balancesToUpdate,
    globalShares,
    globalBlocks,
};
