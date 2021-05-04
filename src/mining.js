const XXH = require("xxhashjs");
const crypto = require("crypto")

const kolka = require("./kolka");

const {
    preGenJobCount,
    jobGenerationDelay,
    initialBlockHash,
    expectedSharetime,
    blockProbability,
    blockReward,
    updateMinersStatsEvery
    } = require("../config/config.json");

let lastBlockhash = initialBlockHash;

let jobs = {
    "avr": [],
    "due": [],
    "esp32": [],
    "esp8266": [],
};

let workers = {};
let minersStats = {};
let balancesToUpdate = {};
let globalShares = { increase: 0, total: 0 };

/* Generate DUCO-S1A jobs for low-power devices */
async function generateJobs() {
    /* AVR */
    for (let i = 0; i < preGenJobCount; i++) {
        const random = Math.floor((Math.random() * getDiff("AVR") * 100) + 1);
        let shasum = crypto.createHash("sha1");
        const newHash = shasum.update(lastBlockhash + random).digest("hex");
        jobs.avr[i] = {
            secret: random,
            expectedHash: newHash.toString(),
            lastBlockhash: lastBlockhash
        }
    }

    /* Arduino DUE */
    for (let i = 0; i < preGenJobCount; i++) {
        const random = Math.floor((Math.random() * getDiff("DUE") * 100) + 1);
        let shasum = crypto.createHash("sha1");
        const newHash = shasum.update(lastBlockhash + random).digest("hex");
        jobs.due[i] = {
            secret: random,
            expectedHash: newHash.toString(),
            lastBlockhash: lastBlockhash
        }
    }

    /* ESP32 */
    for (let i = 0; i < preGenJobCount; i++) {
        const random = Math.floor((Math.random() * getDiff("ESP32") * 100) + 1);
        let shasum = crypto.createHash("sha1");
        const newHash = shasum.update(lastBlockhash + random).digest("hex");
        jobs.esp32[i] = {
            secret: random,
            expectedHash: newHash.toString(),
            lastBlockhash: lastBlockhash
        }
    }

    /* ESP8266 */
    for (let i = 0; i < preGenJobCount; i++) {
        const random = Math.floor((Math.random() * getDiff("ESP8266") * 100) + 1);
        let shasum = crypto.createHash("sha1");
        const newHash = shasum.update(lastBlockhash + random).digest("hex");
        jobs.esp8266[i] = {
            secret: random,
            expectedHash: newHash.toString(),
            lastBlockhash: lastBlockhash
        }
    }

    console.log("Finished generating jobs");
    setTimeout(generateJobs, jobGenerationDelay);
}

function getPregeneratedJob(diff) {
    diff = diff.toLowerCase();

    const validDiff = ["avr", "due", "esp32", "esp8266"];
    if (!validDiff.includes(diff)) return -1;

    let job = jobs[diff][Math.floor(Math.random() * preGenJobCount)];
    return [job.lastBlockhash, job.expectedHash, job.secret];
}

function getDiff(textDiff) {
    const poolRewards = require("../config/poolRewards.json");
    let { difficulty } = poolRewards[textDiff];
    return difficulty;
}

function receiveData(conn) {
    return new Promise((resolve) => {
        conn.on("data", function listener (data) {
            conn.removeListener("data", listener);
            resolve(data.trim());
        })
    })
}

async function ducos1(conn, data, mainListener) {
    const poolRewards = require("../config/poolRewards.json");

    let job, random, newHash, reqDifficulty, sharetime;
    let isFirstShare = true;
    let overrideDifficulty = "";
    let acceptedShares = 0, rejectedShares = 0;

    conn.removeListener("data", mainListener); // remove the main listener to not re-trigger ducos1

    while (true) {
        if (isFirstShare) {
            reqDifficulty = data[2] ? data[2] : "NET"; // check if a custom diff was provided

            if (workers[conn.remoteAddress]) {
                workers[conn.remoteAddress] += 1;
            } else {
                workers[conn.remoteAddress] = 1;
            }
        } else {
            data = await receiveData(conn);
            data = data.split(",");

            if (!overrideDifficulty) {
                reqDifficulty = data[2] ? data[2] : "NET";
            } else {
                reqDifficulty = overrideDifficulty;
            }
        }
    
        if (!poolRewards.hasOwnProperty(reqDifficulty)) reqDifficulty = "NET";
        let diff = getDiff(reqDifficulty);

        if (diff < 600) {
            jobInfo = getPregeneratedJob(reqDifficulty);
            if (jobInfo === -1) { // invalid avr diff provided
                conn.write("NO,Invalid AVR diff");
                console.log(`${conn.remoteAddress}: Invalid avr diff provided`);
                return conn.destroy();
            }
    
            random = jobInfo[2];
            newHash = jobInfo[1];
        } else {
            if (!isFirstShare) {
                diff = kolka.V3(sharetime, expectedSharetime, diff);
            }

            random = Math.floor((Math.random() * diff * 100) + 1);
    
            let shasum = crypto.createHash("sha1");
            shasum.update(lastBlockhash + random);
            newHash = shasum.digest("hex");
        }

        job = [lastBlockhash, newHash.toString(), diff];
        conn.write(job.toString());

        let sentTimestamp = new Date().getTime();
    
        let answer = await receiveData(conn);

        sharetime = (new Date().getTime() - sentTimestamp) / 1000;
        answer = answer.split(",");

        let hashrateIsEstimated = false;

        let reportedHashrate = parseFloat(answer[1]);
        if (!reportedHashrate) {
            hashrateIsEstimated = true;
        }

        let hashrate = random / sharetime;

        isFirstShare = false;

        if (acceptedShares > 0 && ((acceptedShares % updateMinersStatsEvery) === 0)) {
            let minerName, rigIdentifier;
            try {
                // Check miner software for unallowed characters
                minerName = answer[2].match(/[A-Za-z0-9 .()-]+/g).join(" ");
            } catch {
                miner_name = "Unknown miner";
            }

            try {
                // Check miner id for unallowed characters
                rigIdentifier = answer[3].match(/[A-Za-z0-9 .()-]+/g).join(" ");
            } catch {
                rigIdentifier = "None";
            }

            let minerStats = {
                "User": data[1],
                "Hashrate": hashrateIsEstimated ? hashrate : reportedHashrate,
                "Is estimated": hashrateIsEstimated,
                "Sharetime": sharetime,
                "Accepted":     acceptedShares,
                "Rejected":     rejectedShares,
                "Algorithm":    "DUCO-S1",
                "Diff":         diff,
                "Software":     minerName,
                "Identifier":   rigIdentifier
            }
            minersStats[conn.id] = minerStats;

            lastBlockhash = newHash;
            globalShares.increase += updateMinersStatsEvery;
            globalShares.total += updateMinersStatsEvery;
        }

        let maxHashrate = poolRewards[reqDifficulty]["max_hashrate"];
        let reward;
        if (hashrate > maxHashrate && acceptedShares > 2) {
            rejectedShares++;

            reward = kolka.V1(0, sharetime, 0, 0, true);
            overrideDifficulty = kolka.V2(reqDifficulty);

            conn.write("BAD");
        } else if (parseInt(answer[0]) === random) {
            acceptedShares++;

            if (acceptedShares > 3) {
                let baseReward = poolRewards[reqDifficulty]["reward"];
                reward = kolka.V1(baseReward, sharetime, diff, workers[conn.remoteAddress]);
            } else {
                reward = 0;
            }

            if (Math.floor((Math.random() * blockProbability)) === 1) {
                reward += blockReward;
                conn.write("BLOCK\n");
            } else {
                conn.write("GOOD\n");
            }
        } else {
            rejectedShares++;

            reward = kolka.V1(0, sharetime, 0, 0, true);
            overrideDifficulty = kolka.V2(reqDifficulty);

            conn.write("BAD\n");
        }

        if (balancesToUpdate[data[1]]) {
            balancesToUpdate[data[1]] += reward;
        } else {
            balancesToUpdate[data[1]] = reward;
        }
    }
}

async function xxhash(conn, data, mainListener) {
    const poolRewards = require("../config/poolRewards.json");

    let job, random, newHash, reqDifficulty, sharetime;
    let isFirstShare = true;
    let overrideDifficulty = "";
    let acceptedShares = 0, rejectedShares = 0;

    conn.removeListener("data", mainListener); // remove the main listener to not re-trigger ducos1

    while (true) {
        if (isFirstShare) {
            reqDifficulty = data[2] ? data[2] : "NET"; // check if a custom diff was provided

            if (workers[conn.remoteAddress]) {
                workers[conn.remoteAddress] += 1;
            } else {
                workers[conn.remoteAddress] = 1;
            }
        } else {
            data = await receiveData(conn);
            data = data.split(",");

            if (!overrideDifficulty) {
                reqDifficulty = data[2] ? data[2] : "NET";
            } else {
                reqDifficulty = overrideDifficulty;
            }
        }
    
        if (!poolRewards.hasOwnProperty(reqDifficulty)) reqDifficulty = "NET";
        let diff = getDiff(reqDifficulty);

        if (!isFirstShare) {
            diff = kolka.V3(sharetime, expectedSharetime, diff);
        }

        random = Math.floor((Math.random() * diff * 100) + 1);

        let newHash = XXH.h64(lastBlockhash + random, 2811).toString(16);

        job = [lastBlockhash, newHash, diff];
        conn.write(job.toString());

        let sentTimestamp = new Date().getTime();
    
        let answer = await receiveData(conn);

        sharetime = (new Date().getTime() - sentTimestamp) / 1000;
        answer = answer.split(",");

        let hashrateIsEstimated = false;

        let reportedHashrate = parseFloat(answer[1]);
        if (!reportedHashrate) {
            hashrateIsEstimated = true;
        }

        let hashrate = random / sharetime;

        isFirstShare = false;

        if (acceptedShares > 0 && ((acceptedShares % updateMinersStatsEvery) === 0)) {
            let minerName, rigIdentifier;
            try {
                // Check miner software for unallowed characters
                minerName = answer[2].match(/[A-Za-z0-9 .()-]+/g).join(" ");
            } catch {
                miner_name = "Unknown miner";
            }

            try {
                // Check miner id for unallowed characters
                rigIdentifier = answer[3].match(/[A-Za-z0-9 .()-]+/g).join(" ");
            } catch {
                rigIdentifier = "None";
            }

            let minerStats = {
                "User": data[1],
                "Hashrate": hashrateIsEstimated ? hashrate : reportedHashrate,
                "Is estimated": hashrateIsEstimated,
                "Sharetime": sharetime,
                "Accepted":     acceptedShares,
                "Rejected":     rejectedShares,
                "Algorithm":    "DUCO-S1",
                "Diff":         diff,
                "Software":     minerName,
                "Identifier":   rigIdentifier
            }
            minersStats[conn.id] = minerStats;

            lastBlockhash = newHash;
            globalShares.increase += updateMinersStatsEvery;
            globalShares.total += updateMinersStatsEvery;
        }

        let maxHashrate = poolRewards[reqDifficulty]["max_hashrate"];
        let reward;
        if (hashrate > maxHashrate && acceptedShares > 2) {
            rejectedShares++;

            reward = kolka.V1(0, sharetime, 0, 0, true);
            overrideDifficulty = kolka.V2(reqDifficulty);

            conn.write("BAD");
        } else if (parseInt(answer[0]) === random) {
            acceptedShares++;

            if (acceptedShares > 3) {
                let baseReward = poolRewards[reqDifficulty]["reward"];
                reward = kolka.V1(baseReward, sharetime, diff, workers[conn.remoteAddress]);
            } else {
                reward = 0;
            }

            if (Math.floor((Math.random() * blockProbability)) === 1) {
                reward += blockReward;
                conn.write("BLOCK\n");
            } else {
                conn.write("GOOD\n");
            }
        } else {
            rejectedShares++;

            reward = kolka.V1(0, sharetime, 0, 0, true);
            overrideDifficulty = kolka.V2(reqDifficulty);

            conn.write("BAD\n");
        }

        if (balancesToUpdate[data[1]]) {
            balancesToUpdate[data[1]] += reward;
        } else {
            balancesToUpdate[data[1]] = reward;
        }
    }
}

module.exports = { 
    ducos1,
    xxhash,
    generateJobs
};

module.exports.stats = {
    workers,
    minersStats,
    balancesToUpdate,
    globalShares
}
