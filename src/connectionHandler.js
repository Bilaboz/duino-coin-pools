/* Duino-Coin Connection handler
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2021 Duino-Coin community */

const fs = require('fs');
const axios = require('axios');
const mining = require('./mining');
const crypto = require('crypto');
const chalk = require('chalk');
const error = chalk.bold.red;
const info = chalk.blue;
const success = chalk.green;
const warning = chalk.hex('#FFA500');
const importFresh = require('import-fresh');
let bans = require('../config/bans.json');
const {
    exec
} = require("child_process");
const {
    maxWorkers,
    motd,
    serverVersion,
    poolName
} = require('../config/config.json');

function getHttpCode() {
    http_codes = [
        "201 Created",
        "203 Non-Authoritative Information",
        "208 Already Reported",
        "226 IM Used",
        "303 See Other",
        "402 Payment Required",
        "406 Not Acceptable",
        "408 Request Timeout",
        "410 Gone",
        "413 Payload Too Large",
        "422 Unprocessable Entity",
        "425 Too Early",
        "426 Upgrade Required",
        "451 Unavailable For Legal Reasons",
        "506 Variant Also Negotiates",
        "508 Loop Detected"
    ]
    return http_codes[Math.floor(Math.random() * http_codes.length)];
}

function ban_ip(ip) {
    exec(`csf -td ${ip}`, (error, stdout, stderr) => {
        if (error) {
            // console.log(`${poolName}: ${new Date().toLocaleString()}` + warning(` Error banning ${ip}: ${stderr}`))
            return;
        }
        if (stderr) {
            // console.log(`${poolName}: ${new Date().toLocaleString()}` + warning(` Stderror banning ${ip}: ${stderr}`))
            return;
        }
        console.log(`${poolName}: ${new Date().toLocaleString()}` + warning(` Banned ${ip}`))
    });
}

const handle = (conn) => {
    conn.username = undefined;
    conn.id = crypto.randomBytes(4).toString('hex');
    try {
        conn.setTimeout(20000);
        conn.setNoDelay(true);
        conn.setEncoding('utf8');
        conn.write(serverVersion);
    } catch (err) {
        return conn.destroy();
    }

    conn.on('close', () => {
        try {
            delete mining.stats.minersStats[conn.id];
        } catch (err) {}
        try {
            mining.stats.workers[conn.remoteAddress] -= 1;
            if (mining.stats.workers[conn.remoteAddress] <= 0)
                delete mining.stats.workers[conn.remoteAddress];
        } catch (err) {}
        try {
            mining.stats.usrWorkers[conn.username] -= 1;
            if (mining.stats.usrWorkers[conn.username] <= 0)
                delete mining.stats.usrWorkers[conn.username];
        } catch (err) {}
    })

    conn.on('error', (err) => {
        if (err.code !== 'ECONNRESET') {}
    })

    conn.on('timeout', (err) => {
        conn.destroy();
    })

    conn.on('data', function mainListener(data) {
        data = data.trim().split(',');

        if (data.length > 6) {
            setTimeout(function () {
                conn.write(getHttpCode());
                return conn.destroy();
            }, 10000)
        }

        if (!conn.remoteAddress) {
            setTimeout(function () {
                conn.write(getHttpCode());
                return conn.destroy();
            }, 10000)
        }

        if (bans.bannedIPs.includes(conn.remoteAddress) && conn.remoteAddress != "127.0.0.1") {
            ban_ip(conn.remoteAddress);

            setTimeout(function () {
                conn.write(getHttpCode());
                return conn.destroy();
            }, 10000)
        }

        if (bans.bannedUsernames.includes(data[1]) && conn.remoteAddress != "127.0.0.1") {
            if (conn.remoteAddress != "127.0.0.1")
                bans.bannedIPs.push(conn.remoteAddress);
            try {
                fs.writeFileSync('./config/bans.json', JSON.stringify(bans, null, 0));
            } catch (err) {
                console.log(err);
            }
            ban_ip(conn.remoteAddress);

            setTimeout(function () {
                conn.write(getHttpCode());
                return conn.destroy();
            }, 10000)
        }

        if (data[0] === 'JOB') {
            if (!data[1]) {
                conn.write('BAD,No username specified\n');
                return conn.destroy();
            } else {
                if (!conn.username)
                    conn.username = data[1];
                else if (conn.username != data[1]) {
                    conn.write(getHttpCode());
                    return conn.destroy();
                }
                mining.miningHandler(conn, data, mainListener, false, false);
            }

        } else if (data[0] === 'JOBXX') {
            conn.write('BAD,XXHASH is disabled');
            return conn.destroy();

            if (!data[1]) {
                conn.write('BAD,No username specified\n');
                return conn.destroy();
            }
            mining.miningHandler(conn, data, mainListener, true, false);

        } else if (data[0] === 'MOTD') {
            let finalMOTD = motd;
            //finalMOTD += `\nPool worker limit: ${maxWorkers}`
            conn.write(finalMOTD);
        }
    })
}

module.exports = handle;
