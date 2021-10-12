/* Duino-Coin Connection handler
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2021 Duino-Coin community */

const fs = require('fs');
const axios = require('axios');
const mining = require('./mining');
const {
    maxWorkers,
    motd,
    serverVersion
} = require('../config/config.json');
let bans = require('../config/bans.json');

const handle = (conn) => {
    conn.id = Math.random().toString(36).substr(2, 9);
    try {
        conn.setTimeout(10000);
        conn.setNoDelay(true);
        conn.setEncoding('utf8');
        conn.write(serverVersion);
    } catch (err) {}

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

        if (data.length > 5) {
            conn.write('101 Switching Protocol');
            return conn.destroy();
        }

        if (!conn.remoteAddress) {
            conn.write('418 I\'m a teapot');
            return conn.destroy();
        }

        if (bans.bannedIPs.includes(conn.remoteAddress)) {
            conn.write('204 No Content');
            return conn.destroy();
        }

        if (bans.bannedUsernames.includes(data[1])) {
            conn.write('301 Moved Permanently');
            bans.bannedIPs.push(conn.remoteAddress);
            fs.writeFileSync('../config/bans.json', JSON.stringify(bans, null, 0));
            return conn.destroy();
        }

        if (data[0] === 'JOB') {
            if (!data[1]) {
                conn.write('NO,Not enough data');
                return conn.destroy();
            }
            mining.miningHandler(conn, data, mainListener, false, false);

        } else if (data[0] === 'JOBXX') {
            conn.write('NO,XXHASH is disabled');
            return conn.destroy();
            if (!data[1]) {
                conn.write('NO,Not enough data');
                return conn.destroy();
            }
            mining.miningHandler(conn, data, mainListener, true, false);

        } else if (data[0] === 'MOTD') {
            let finalMOTD = motd;
            finalMOTD += `\nPool worker limit: ${maxWorkers}`
            conn.write(finalMOTD);
        }
    })
}

module.exports = handle;
