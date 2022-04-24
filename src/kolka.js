/* Duino-Coin Kolka algorithms and formulas
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2022 Duino-Coin community */

const poolRewards = require("../config/poolRewards.json");

const highestPCdiff = poolRewards["NET"]["difficulty"] * 5.19202;
const highestESPdiff = poolRewards["ESP32"]["difficulty"];
const highestAVRdiff = poolRewards["DUE"]["difficulty"];

const gpuMiningPercentage = poolRewards["EXTREME"]["kolka_decrease_perc"] * 0.01;
const pcMiningPercentage = poolRewards["NET"]["kolka_decrease_perc"] * 0.01;
const espMiningPercentage = poolRewards["ESP32"]["kolka_decrease_perc"] * 0.01;
const avrMiningPercentage = poolRewards["AVR"]["kolka_decrease_perc"] * 0.01;

function V1(hashrate, difficulty, workers, reward_div) {
    let output;

    if (workers > 4) {
        workers = workers - 3;
    } else {
        workers = 1;
    }

    try {
        output = Math.log(hashrate) / reward_div;
    } catch (err) {
        return 0;
    }

    if (difficulty > highestPCdiff) {
        // GPU, Extreme PC
        output = 2 * (output * (Math.pow(gpuMiningPercentage, workers - 1)));
    } else if (difficulty > highestESPdiff) {
        // PC
        output = 2 * (output * (Math.pow(pcMiningPercentage, workers - 1)));
    } else if (difficulty > highestAVRdiff) {
        // ESP
        output = 2 * (output * (Math.pow(espMiningPercentage, workers - 1)));
    } else {
        // AVR
        output = 2 * (output * (Math.pow(avrMiningPercentage, workers - 1)));
    }

    return output;
}

function V2(currDiff) {
    switch (currDiff) {
    case "XXHASH":
        return "XXHASH";
    case "AVR":
        return "MEGA";
    case "MEGA":
        return "ARM";
    case "ARM":
        return "DUE";
    case "DUE":
        return "ESP8266";
    case "ESP8266":
        return "ESP8266H"
    case "ESP8266H":
        return "ESP32"
    case "ESP32":
        return "LOW";
    case "LOW":
        return "MEDIUM";
    case "MEDIUM":
        return "NET";
    case "NET":
        return "EXTREME";
    case "EXTREME":
        return "EXTREME";
    }
}

function V2_REVERSE(currDiff) {
    switch (currDiff) {
    case "XXHASH":
        return "XXHASH";
    case "AVR":
        return "AVR";
    case "MEGA":
        return "AVR";
    case "ARM":
        return "MEGA";
    case "DUE":
        return "ARM";
    case "ESP8266":
        return "ESP8266";
    case "ESP8266H":
        return "ESP8266"
    case "ESP32":
        return "ESP32"
    case "LOW":
        return "LOW";
    case "MEDIUM":
        return "LOW";
    case "NET":
        return "MEDIUM";
    case "EXTREME":
        return "NET";
    }
}

function V3(sharetime, expectedSharetime, difficulty) {
    const p = 2 - sharetime / expectedSharetime;
    let newDifficulty = difficulty;

    if (p < 1 || p > 1.1) {
        newDifficulty = difficulty * p

            if (newDifficulty < 0) {
                newDifficulty = Math.floor(parseInt(difficulty 
                                / (Math.abs(p) + 2)) * 0.9) + 1
            } else if (newDifficulty === 0) {
                newDifficulty = difficulty * 0.5
            }
    }

    if (newDifficulty <= 2500)
        newDifficulty = 2500;

    return parseInt(newDifficulty);
}

function V4(sharetime, expectedTestSharetime) {
    const p = sharetime / expectedTestSharetime;

    if (p > 1.5) {
        return {
            rejected: true,
            penalty: V1(0, sharetime, 0, 0, true)
        }
    } else {
        return {
            rejected: false
        }
    }
}

module.exports = {
    V1,
    V2,
    V2_REVERSE,
    V3,
    V4
};
