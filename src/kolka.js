/* Duino-Coin Kolka algorithms and formulas
   For documention about these functions,
   see https://github.com/revoxhere/duino-coin/blob/useful-tools/Master_Server/kolka_module.py
   2019-2021 Duino-Coin community
*/

const highestPCdiff = 150000;
const highestAVRdiff = 1500;
const pcMiningPercentage = 0.8;
const avrMiningPercentage = 0.96;
const maxAVRHashrate = 250;
const maxESPHashrate = 11000;

function V1(hashrate, difficulty, workers) {
    let output;

    if (hashrate < maxAVRHashrate) {
        output = Math.log(hashrate) / 5000;
    } else if (hashrate < maxESPHashrate) {
        output = Math.log(hashrate) / 15000;
    } else {
        output = Math.log(hashrate) / 30000;
    }

    if (difficulty > highestPCdiff) {
        output = output + output * (Math.pow(pcMiningPercentage, workers-1)) / 28110;
    } else if (difficulty > highestAVRdiff) {
        output = output + output * (Math.pow(pcMiningPercentage, workers-1));
    } else {
        output = output + output * (Math.pow(avrMiningPercentage, workers-1));
    }

    return output;
}

function V2(currDiff) {
    switch(currDiff) {
        case "AVR": return "ARM";
        case "ARM": return "ESP8266"
        case "ESP8266": return "ESP32"
        case "ESP32": return "LOW";
        case "LOW": return "MEDIUM";
        case "MEDIUM": return "NET";
        case "NET": return "EXTREME";
    }
}

function V3 (sharetime, expectedSharetime, difficulty) {
    const p = 2 - sharetime / expectedSharetime;
    let newDifficulty = difficulty;

    if (p < 1 || p > 1.1) {
        newDifficulty = difficulty * p

        if (newDifficulty < 0) {
            newDifficulty = Math.floor(parseInt(difficulty / (Math.abs(p) + 2)) * 0.9) + 1
        } else if (newDifficulty === 0) {
            newDifficulty = difficulty * 0.5
        }
    }

    if (newDifficulty <= 5000) newDifficulty = 5000;

    return parseInt(newDifficulty);
}

function V4 (sharetime, expectedTestSharetime) {
    const p = sharetime / expectedTestSharetime;

    if (p > 1.5) {
        return {
            rejected: true,
            penalty: V1(0, sharetime, 0, 0, true)
        }
    } else {
        return { rejected: false }
    }
}

module.exports = { V1, V2, V3, V4 };