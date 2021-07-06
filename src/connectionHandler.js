const fs = require("fs");

const mining = require("./mining");
const { poolVersion, motd, serverVersion } = require("../config/config.json")
const bans = require("../config/bans.json");

const handle = (conn) => {
    conn.setEncoding("utf8");
    // generate a unique id for the connection
    conn.id = Math.random().toString(36).substr(2, 9);
    console.log(`New incoming connection: ${conn.remoteAddress}#${conn.id}`);

    conn.write(serverVersion);

    conn.on("end", () => {
        console.log(`${conn.remoteAddress}#${conn.id} disconnected`);
        try {
            delete mining.stats.minersStats[conn.id];
        } catch {}
        try {
            mining.stats.workers[conn.remoteAddress] -= 1;
            if (mining.stats.workers[conn.remoteAddress] <= 0) delete mining.stats.workers[conn.remoteAddress];
        } catch{}
    })

    conn.on("error", (err) => {
        if (err.code !== "ECONNRESET") {
            console.log(`Socket error in connection handler: ${err}`);
        }
    })

    conn.on("data", function mainListener (data) {
        data = data.trim();
        data = data.split(",");

        if (bans.bannedIPs.includes(conn.remoteAddress)) { // check if the ip is banned
            return conn.destroy();
        }

        if (data[0] === "JOB") {
            if (!data[1]) {  // check if username was provided
                conn.write("NO,Not enough data");
                return conn.destroy();
            }

            if (bans.bannedUsernames.includes(data[1])) {
                bans.bannedIPs.push(conn.remoteAddress); // ban the ip
                fs.writeFileSync("./config/bans.json", JSON.stringify(bans, null, 4));
                return conn.destroy();
            }

            mining.miningHandler(conn, data, mainListener, false);
        } else if (data[0] === "JOBXX") {
            if (!data[1]) {  // check if username was provided
                conn.write("NO,Not enough data");
                return conn.destroy();
            }

            if (bans.bannedUsernames.includes(data[1])) {
                bans.bannedIPs.push(conn.remoteAddress); // ban the ip
                fs.writeFileSync("./config/bans.json", JSON.stringify(bans, null, 4));
                return conn.destroy();
            }

            mining.miningHandler(conn, data, mainListener, true);
        } else if (data[0] === "MOTD") {
            conn.write(motd);
        }
    })
}

module.exports = handle;
