/* Duino-Coin Connection handler
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2022 Duino-Coin community */

const fs = require("fs");
const crypto = require("crypto");
const log = require("./logging");
const mining = require("./mining");
const { exec } = require("child_process");
const bans = require("../config/bans.json");
const { motd, serverVersion } = require("../config/config.json");

if (bans.bannedIPs.length > 10) {
    bans.bannedIPs = [];
    fs.writeFileSync(
        "./config/bans.json",
        JSON.stringify(bans, null, 0)
    );
    log.info(`Cleared bans`);
}

const ban_ip = (ip) => {
    // uncomment the correct command for your firewall
    //const cmd = `csf -td ${ip}`; //csf
    //const cmd = `iptables -A INPUT -s ${ip} -j DROP`; //iptables
    //const cmd = `sudo ufw deny from ${ip} to any`; //ufw
    const cmd = '' //none

    if (cmd) {
        exec(cmd, (error) => {
            if (error) {
                log.warning(`Error banning ${ip}: ${error}`);
                return;
            } else {
                log.warning(`Banned ${ip}`);
            }
        });
    }
};

const handle = (conn) => {
    conn.id = crypto.randomBytes(8).toString("hex");
    try {
        conn.setTimeout(30 * 1000);
        conn.setEncoding("ascii");
        conn.write(serverVersion + "\n");
    } catch (err) {
        return conn.destroy();
    }

    conn.on("close", () => {
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
    });

    conn.on("error", (err) => {
        if (err.code !== "ECONNRESET") {}
    });

    conn.on("timeout", () => {
        conn.destroy();
    });

    conn.on("data", function mainListener(data) {
        data = data.trim().split(",");

        if (!conn.remoteAddress || data.length > 6) {
            conn.write("BAD,Incorrect data\n");
            return conn.destroy();
        }

        /* IP ban check */
        if (
            bans.bannedIPs.includes(conn.remoteAddress) &&
            conn.remoteAddress != "127.0.0.1"
        ) {
            conn.write("BAD,User banned\n");
            ban_ip(conn.remoteAddress);
            return conn.destroy();
        }

        /* Username ban check */
        if (
            bans.bannedUsernames.includes(data[1]) &&
            conn.remoteAddress != "127.0.0.1" &&
            !bans.bannedIPs.includes(conn.remoteAddress)
        ) {
            bans.bannedIPs.push(conn.remoteAddress);
            try {
                fs.writeFileSync(
                    "./config/bans.json",
                    JSON.stringify(bans, null, 0)
                );
            } catch (err) {
                console.log(err);
            }
            conn.write("BAD,User banned\n");
            ban_ip(conn.remoteAddress);
            return conn.destroy();
        }

        if (data[0] === "JOB") {
            if (!data[1]) {
                conn.write("BAD,No username specified\n");
                return conn.destroy();
            } else {
                if (!conn.username) conn.username = data[1];
                else if (conn.username != data[1]) {
                    return conn.destroy();
                }
                mining.miningHandler(conn, data, mainListener, false);
            }
        } else if (data[0] === "MOTD") {
            conn.write(motd);
        }
    });
};

module.exports = handle;
